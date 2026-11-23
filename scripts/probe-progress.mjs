// Probe: does acceptFile emit progress events and complete over TCP?
import dgram from 'node:dgram'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFeiqApp } from '../src/host/app.js'
import { Store } from '../src/host/store.js'
import { buildFileAttachExtra, buildPacket, COMMAND, OPTION } from '../src/host/ipmsg.js'

const APP_PORT = 25283
const FAKE_PORT = 25284
const SIZE = 3 * 1024 * 1024
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feiq-progress-'))
const app = createFeiqApp({
  config: { ipmsgPort: APP_PORT, announceMs: 0, nick: 'APP' },
  store: new Store(dir),
  log: () => {},
})

const progress = new Map()
app.on('message', (message) => {
  if (message.kind === 'file' && message.dir === 'in') {
    progress.set(message.status + ':' + (message.progress?.done ?? 0), true)
  }
})

await app.start()

const tcp = net.createServer((socket) => {
  socket.on('data', () => {
    const chunk = Buffer.alloc(256 * 1024, 1)
    let sent = 0
    const pump = () => {
      while (sent < SIZE) {
        const size = Math.min(chunk.length, SIZE - sent)
        const ok = socket.write(chunk.subarray(0, size))
        sent += size
        if (!ok) return socket.once('drain', pump)
      }
      socket.end()
    }
    pump()
  })
})
await new Promise((resolve) => tcp.listen(FAKE_PORT, '0.0.0.0', resolve))

const udp = dgram.createSocket('udp4')
await new Promise((resolve) => udp.bind(FAKE_PORT, '0.0.0.0', resolve))

const extra = buildFileAttachExtra(
  [{ fileId: 0, name: 'big.bin', size: SIZE, mtime: Math.floor(Date.now() / 1000), fileType: 1 }],
  { message: '' },
)
const offer = buildPacket({
  feiqHeader: '1_lbt6_0#128#001122334455#0#0#0#4001#9',
  packetNo: '5000',
  user: 'fake',
  host: 'FAKE-PC',
  command: COMMAND.SENDMSG | OPTION.FILEATTACH | OPTION.SENDCHECK,
  extraBuffer: extra,
})
udp.send(offer, APP_PORT, '127.0.0.1')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await wait(1200)
app.ensureLoaded('fake@FAKE-PC')
const message = (app.messages.get('fake@FAKE-PC') ?? []).find((item) => item.kind === 'file')
if (!message) {
  console.log('no offer received')
  process.exit(1)
}
console.log('offer', message.status, message.file.size)
app.acceptFile('fake@FAKE-PC', message.id)
for (let i = 0; i < 40 && message.status !== 'received' && message.status !== 'failed'; i++) await wait(250)
console.log('final', message.status, message.progress)
console.log('distinct progress events', progress.size)
const values = [...progress.keys()].filter((key) => key.startsWith('receiving:')).length
console.log('receiving events', values)
app.stop()
tcp.close()
udp.close()
