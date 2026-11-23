// Probe: can a standard IPMSG FILEATTACH offer make FeiQ pull the file over TCP?
// Usage: node scripts/probe-feiq-file.mjs [port] [target]
import dgram from 'node:dgram'
import net from 'node:net'
import { buildFileAttachExtra, buildPacket, COMMAND, OPTION, parsePacket } from '../src/host/ipmsg.js'

const PORT = Number(process.argv[2] || 25270)
const target = process.argv[3] || '127.0.0.1'
const data = Buffer.from('hello from dsh-feiq-im probe\n')
const name = 'probe-file.txt'
const packetNo = '1000'
const fileId = 1

const extra = buildFileAttachExtra(
  [{ fileId, name, size: data.length, mtime: Math.floor(Date.now() / 1000), fileType: 1 }],
  { message: 'probe' },
)
const offer = buildPacket({
  feiqHeader: '1',
  packetNo,
  user: 'DSH-PROBE',
  host: 'PROBE-PC',
  command: COMMAND.SENDMSG | OPTION.FILEATTACH | OPTION.SENDCHECK,
  extraBuffer: extra,
})

const tcp = net.createServer((socket) => {
  console.log('TCP CONNECT from', socket.remoteAddress, socket.remotePort)
  socket.on('data', (chunk) => {
    console.log('TCP HEAD', chunk.length, chunk.toString('hex'))
    const nul = chunk.indexOf(0)
    const raw = nul >= 0 ? chunk.subarray(0, nul) : chunk
    const packet = parsePacket(Buffer.concat([raw, Buffer.from([0])]), { keepTrailingNuls: true })
    console.log('PARSED', packet ? { cmd: '0x' + packet.command.toString(16), text: packet.text } : null)
    socket.write(data)
    socket.end()
  })
  socket.on('error', (error) => console.log('TCP ERR', error.message))
})
tcp.listen(PORT, '0.0.0.0', () => console.log('TCP listen', PORT))

const udp = dgram.createSocket('udp4')
udp.bind(PORT, '0.0.0.0', () => {
  udp.setBroadcast(true)
  udp.send(offer, 2425, target, (error) => {
    console.log('offer sent', error ? error.message : 'ok', 'packetNo', packetNo, 'bytes', offer.length)
  })
  udp.on('message', (buffer, rinfo) => {
    const packet = parsePacket(buffer, { keepTrailingNuls: true })
    console.log('UDP', rinfo.address + ':' + rinfo.port, packet ? 'cmd=0x' + packet.command.toString(16) + ' text=' + JSON.stringify(packet.text).slice(0, 120) : buffer.toString('hex').slice(0, 80))
  })
})

setTimeout(() => {
  console.log('timeout, exiting')
  process.exit(0)
}, 120000)
