/**
 * Browser-facing routes on the DSH web server (same origin, loopback only):
 * an SSE stream plus a small JSON API the bubble UI calls.
 */
import fs from 'node:fs'
import path from 'node:path'

import { isFeiqProcess, portOwner, terminateProcess, waitForUdpPort } from './net.js'

const MAX_BODY_BYTES = 48 * 1024 * 1024

function sameOrigin(req) {
  const host = req.headers.host ?? ''
  const hostname = host.split(':')[0]
  if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(hostname)) return false
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(value))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

export function registerRoutes(ctx, app, { log = () => {} } = {}) {
  const disposers = []
  const add = (kind, pathname, handler) => {
    disposers.push(
      ctx.webServer.register({
        kind,
        path: pathname,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return sendJson(res, 403, { error: 'forbidden origin' })
          try {
            await handler(req, res)
          } catch (error) {
            log('route error: ' + (error?.message ?? error))
            if (!res.writableEnded) sendJson(res, 500, { error: String(error?.message ?? error) })
          }
        },
      }),
    )
  }

  add('exact', '/feiq-im/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    })
    const write = (event, data) => {
      if (res.writableEnded) return
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    write('hello', app.snapshot())
    const onState = (snapshot) => write('state', snapshot)
    const onMessage = (message) => write('message', message)
    const onKnock = (event) => write('knock', event)
    const onStatus = (status) => write('status', status)
    app.on('state', onState)
    app.on('message', onMessage)
    app.on('knock', onKnock)
    app.on('status', onStatus)
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n')
    }, 15000)
    req.on('close', () => {
      clearInterval(heartbeat)
      app.removeListener('state', onState)
      app.removeListener('message', onMessage)
      app.removeListener('knock', onKnock)
      app.removeListener('status', onStatus)
      try {
        res.end()
      } catch {
        /* ignore */
      }
    })
  })

  add('exact', '/feiq-im/api/bootstrap', (req, res) => sendJson(res, 200, app.snapshot()))

  add('exact', '/feiq-im/api/history', (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const convId = url.searchParams.get('convId') ?? ''
    const limit = Math.min(300, Number(url.searchParams.get('limit') ?? 100) || 100)
    return sendJson(res, 200, { messages: app.history(convId, limit) })
  })

  add('exact', '/feiq-im/api/send', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    const peerKey = String(body.peerKey ?? '')
    if (!peerKey) return sendJson(res, 400, { error: 'peerKey required' })
    if (body.kind === 'image') {
      const data = Buffer.from(String(body.data ?? ''), 'base64')
      if (data.length === 0) return sendJson(res, 400, { error: 'empty image' })
      const message = app.sendImage(peerKey, data, { code: 2 })
      return sendJson(res, 200, { message })
    }
    const text = String(body.text ?? '')
    if (text.trim() === '') return sendJson(res, 400, { error: 'empty text' })
    const message = app.sendText(peerKey, text.slice(0, 4000))
    return sendJson(res, 200, { message })
  })

  add('exact', '/feiq-im/api/read', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    app.markRead(String(body.convId ?? ''))
    return sendJson(res, 200, app.snapshot())
  })

  add('exact', '/feiq-im/api/knock', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    app.sendKnock(String(body.peerKey ?? ''))
    return sendJson(res, 200, { ok: true })
  })

  add('exact', '/feiq-im/api/retry', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    const message = app.retry(String(body.convId ?? ''), String(body.messageId ?? ''))
    return sendJson(res, message ? 200 : 404, message ? { message } : { error: 'not found' })
  })

  add('exact', '/feiq-im/api/send-file', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    const peerKey = String(body.peerKey ?? '')
    const data = Buffer.from(String(body.data ?? ''), 'base64')
    if (!peerKey || data.length === 0) return sendJson(res, 400, { error: 'peerKey and data required' })
    if (data.length > 32 * 1024 * 1024) return sendJson(res, 413, { error: 'file too large' })
    const message = app.sendFile(peerKey, String(body.name ?? 'file.bin'), data)
    return sendJson(res, 200, { message })
  })

  add('exact', '/feiq-im/api/accept-file', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    const message = app.acceptFile(String(body.convId ?? ''), String(body.messageId ?? ''))
    return sendJson(res, message ? 200 : 404, message ? { message } : { error: 'not found' })
  })

  add('exact', '/feiq-im/api/file', (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const id = String(url.searchParams.get('id') ?? '')
    const file = app.filePathFor(id)
    if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' })
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(path.basename(file)) + '"')
    fs.createReadStream(file).pipe(res)
  })

  add('exact', '/feiq-im/api/save', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    const target = app.exportFile(String(body.messageId ?? ''), String(body.name ?? ''))
    if (!target) return sendJson(res, 404, { error: 'not found' })
    return sendJson(res, 200, { path: target })
  })

  add('exact', '/feiq-im/api/refresh', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    return sendJson(res, 200, app.refresh())
  })

  add('exact', '/feiq-im/api/cancel', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    const message = app.cancel(String(body.convId ?? ''), String(body.messageId ?? ''))
    return sendJson(res, message ? 200 : 404, message ? { message } : { error: 'not found' })
  })

  add('exact', '/feiq-im/api/settings', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = await readBody(req)
    return sendJson(res, 200, app.setSettings(body))
  })

  add('exact', '/feiq-im/api/image', (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const id = String(url.searchParams.get('id') ?? '')
    const ext = (url.searchParams.get('ext') ?? 'jpg').replace(/[^a-z0-9]/gi, '')
    const safe = String(id).replace(/[^0-9a-zA-Z_-]/g, '')
    const file = path.join(app.store.filesDir, `${safe}.${ext}`)
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' })
    res.statusCode = 200
    res.setHeader('Content-Type', ext === 'jpg' ? 'image/jpeg' : 'application/octet-stream')
    res.setHeader('Cache-Control', 'max-age=86400')
    fs.createReadStream(file).pipe(res)
  })

  add('exact', '/feiq-im/api/port/owner', async (req, res) => {
    const owner = await portOwner(app.port)
    return sendJson(res, 200, {
      port: app.port,
      listening: app.status.listening,
      error: app.status.error,
      owner,
      isFeiq: isFeiqProcess(owner),
    })
  })

  add('exact', '/feiq-im/api/port/close-feiq', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const owner = await portOwner(app.port)
    if (!owner) return sendJson(res, 404, { error: 'no owner' })
    if (!isFeiqProcess(owner)) return sendJson(res, 409, { error: 'owner is not FeiQ', owner })
    const ok = await terminateProcess(owner.pid)
    if (!ok) return sendJson(res, 403, { error: 'cannot terminate (elevation?)', owner })
    const released = await waitForUdpPort(app.port)
    if (!released) return sendJson(res, 500, { error: 'port still busy' })
    app.stop()
    const status = await app.start()
    return sendJson(res, status.listening ? 200 : 500, { status, snapshot: app.snapshot() })
  })

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }
}
