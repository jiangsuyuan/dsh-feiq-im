/**
 * Socket helpers for the FeiQ link: UDP bind with a clear error, TCP listen for
 * file/image bodies, and Windows helpers to identify (and, only on explicit
 * user action, terminate) the process holding 2425.
 */
import dgram from 'node:dgram'
import net from 'node:net'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function bindUdp({ port, host = '0.0.0.0' } = {}) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: false })
    const onError = (error) => {
      try {
        socket.close()
      } catch {
        /* already closed */
      }
      reject(error)
    }
    socket.once('error', onError)
    socket.bind(port, host, () => {
      socket.removeListener('error', onError)
      try {
        socket.setBroadcast(true)
      } catch {
        /* some adapters refuse broadcast */
      }
      resolve(socket)
    })
  })
}

export function listenTcp({ port, host = '0.0.0.0', onConnection }) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => onConnection?.(socket))
    server.once('error', reject)
    server.listen(port, host, () => {
      server.removeListener('error', reject)
      resolve(server)
    })
  })
}

/** Best-effort MAC of the interface that owns the default route (or the first). */
export function primaryMac() {
  const interfaces = os.networkInterfaces()
  for (const list of Object.values(interfaces)) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal && item.mac && item.mac !== '00:00:00:00:00:00') {
        return item.mac.replace(/[:-]/g, '').toUpperCase()
      }
    }
  }
  return '000000000000'
}

export function primaryAddress() {
  const interfaces = os.networkInterfaces()
  for (const list of Object.values(interfaces)) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return '127.0.0.1'
}

/** Broadcast addresses for every IPv4 interface, e.g. 192.168.0.255. */
export function broadcastAddresses() {
  const out = new Set(['255.255.255.255'])
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' || item.internal || !item.netmask) continue
      const address = item.address.split('.').map(Number)
      const mask = item.netmask.split('.').map(Number)
      if (address.length !== 4 || mask.length !== 4) continue
      const broadcast = address.map((part, index) => (part & mask[index]) | (~mask[index] & 255))
      out.add(broadcast.join('.'))
    }
  }
  return [...out]
}

export function isPrivateIPv4(ip) {
  if (typeof ip !== 'string') return false
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  return false
}

/** Windows: which process owns a local port? Returns null when unknown. */
export async function portOwner(port) {
  try {
    const { stdout } = await execFileAsync('netstat', ['-ano'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    const pattern = new RegExp(`[:.]${port}\\s`)
    for (const line of stdout.split(/\r?\n/)) {
      if (!pattern.test(line)) continue
      const parts = line.trim().split(/\s+/)
      const pid = Number(parts[parts.length - 1])
      if (!Number.isInteger(pid) || pid <= 0) continue
      return { pid, name: await processName(pid), line: line.trim() }
    }
  } catch {
    /* netstat unavailable */
  }
  return null
}

async function processName(pid) {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      windowsHide: true,
    })
    const match = /^"([^"]+)"/.exec(stdout.trim())
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

const FEIQ_SIGNATURE = /^feiq(\.exe)?$/i

/** Only FeiQ may be terminated, and only when the caller already asked the user. */
export function isFeiqProcess(owner) {
  if (!owner) return false
  return FEIQ_SIGNATURE.test(String(owner.name || '').trim())
}

export async function terminateProcess(pid) {
  try {
    await execFileAsync('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

export function waitForUdpPort(port, host = '0.0.0.0', timeoutMs = 2000, intervalMs = 200) {
  const started = Date.now()
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = dgram.createSocket('udp4')
      socket.once('error', () => {
        try {
          socket.close()
        } catch {
          /* ignore */
        }
        if (Date.now() - started >= timeoutMs) resolve(false)
        else setTimeout(attempt, intervalMs)
      })
      socket.bind(port, host, () => {
        socket.close(() => resolve(true))
      })
    }
    attempt()
  })
}
