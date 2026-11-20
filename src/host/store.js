/**
 * Persistence for dsh-feiq-im: identity, roster/conversation state, message
 * logs and received images. Plain files only, no dependencies.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAX_TAIL_BYTES = 8 * 1024 * 1024

export function resolveDataDir(config = {}) {
  if (typeof config.dataDir === 'string' && config.dataDir.trim() !== '') return config.dataDir
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'plugin-data', 'dsh-feiq-im')
}

export class Store {
  constructor(dir) {
    this.dir = dir
    this.messagesDir = path.join(dir, 'messages')
    this.filesDir = path.join(dir, 'files')
    this.stateFile = path.join(dir, 'state.json')
  }

  ensure() {
    fs.mkdirSync(this.messagesDir, { recursive: true })
    fs.mkdirSync(this.filesDir, { recursive: true })
  }

  loadState() {
    try {
      const raw = fs.readFileSync(this.stateFile, 'utf8')
      const state = JSON.parse(raw)
      return state && typeof state === 'object' ? state : null
    } catch {
      return null
    }
  }

  saveState(state) {
    const tmp = this.stateFile + '.tmp'
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(state))
      fs.renameSync(tmp, this.stateFile)
    } catch {
      /* a failed state write must never break messaging */
    }
  }

  convPath(convId) {
    return path.join(this.messagesDir, encodeURIComponent(convId) + '.jsonl')
  }

  appendMessage(convId, message) {
    try {
      fs.appendFileSync(this.convPath(convId), JSON.stringify(message) + '\n')
    } catch {
      /* ignore */
    }
  }

  readMessages(convId, limit = 200) {
    try {
      const file = this.convPath(convId)
      const stat = fs.statSync(file)
      const start = Math.max(0, stat.size - MAX_TAIL_BYTES)
      const fd = fs.openSync(file, 'r')
      const buffer = Buffer.alloc(stat.size - start)
      fs.readSync(fd, buffer, 0, buffer.length, start)
      fs.closeSync(fd)
      const lines = buffer.toString('utf8').split('\n').filter(Boolean)
      const out = []
      for (const line of lines.slice(-limit)) {
        try {
          out.push(JSON.parse(line))
        } catch {
          /* skip a torn line */
        }
      }
      return out
    } catch {
      return []
    }
  }

  saveImage(id, extension, buffer) {
    this.ensure()
    const safe = String(id).replace(/[^0-9a-zA-Z_-]/g, '')
    const file = path.join(this.filesDir, `${safe}.${extension}`)
    fs.writeFileSync(file, buffer)
    return file
  }
}