// Probe: does the real FeiqApp file path work against FeiQ (auto-receive)?
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFeiqApp } from '../src/host/app.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feiq-app-probe-'))
const app = createFeiqApp({
  config: { ipmsgPort: 25271, announceMs: 0, nick: 'DSH-APPTEST' },
  store: new (await import('../src/host/store.js')).Store(dir),
  log: (message) => console.log('[app]', message),
})

app.on('message', (message) => {
  if (message.kind === 'file' && message.dir === 'out') {
    console.log('[message]', message.id, message.status, JSON.stringify(message.file))
  }
})

await app.start()
console.log('[start]', app.status.port, 'fileService=', app.status.fileService)
app.injectPeer({ nick: 'FeiQ', host: 'DESKTOP-GKTH4CF', ip: '127.0.0.1', port: 2425 })
const key = 'FeiQ@DESKTOP-GKTH4CF'
const message = app.sendFile(key, 'app-probe.txt', Buffer.from('hello from FeiqApp\n'))
console.log('[sent]', message.id, 'packetNo=', message.file.packetNo, 'fileId=', message.file.fileId)
await new Promise((resolve) => setTimeout(resolve, 12000))
console.log('[status]', message.status)
console.log('[debug-log]')
try {
  console.log(fs.readFileSync(path.join(dir, 'debug.log'), 'utf8').trim())
} catch {
  console.log('(no debug log)')
}
app.stop()
