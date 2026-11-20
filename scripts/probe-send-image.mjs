/**
 * One-off probe: send a real JPEG to the local FeiQ using the captured image
 * protocol, and log whether FeiQ answers with 0xC1 chunk requests.
 *
 * Usage: node scripts/probe-send-image.mjs <image.jpg>
 */
import fs from 'node:fs'
import dgram from 'node:dgram'

import { COMMAND, buildPacket, nextPacketNo, parsePacket } from '../src/host/ipmsg.js'
import { IMAGE_CODE, buildImageChunks, newImageId } from '../src/host/feiq-image.js'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/probe-send-image.mjs <image.jpg>')
  process.exit(2)
}
const data = fs.readFileSync(file)
const id = newImageId()
const USER = 'DSH-TEST'
const HOST = 'DSH'
const peer = '127.0.0.1'

const chunks = buildImageChunks({
  data,
  id,
  code: IMAGE_CODE.JPEG,
  user: USER,
  host: HOST,
  packetNo: () => nextPacketNo(),
})
console.log(`image ${file} bytes=${data.length} id=${id} chunks=${chunks.length}`)

const sock = dgram.createSocket('udp4')
const requested = new Map()

sock.on('message', (message, rinfo) => {
  const packet = parsePacket(message, { keepTrailingNuls: true })
  if (!packet) return
  const mode = packet.command & 0xff
  console.log(`<- ${rinfo.address}:${rinfo.port} cmd=${packet.command}(0x${mode.toString(16)}) text=${JSON.stringify(packet.text.slice(0, 40))}`)
  if (mode !== 0xc1) return
  const [rid, idx] = packet.text.replace('#', '').split('|')
  if (rid !== id) return
  requested.set(idx, (requested.get(idx) ?? 0) + 1)
  const chunk = chunks.find((c) => c.index === Number(idx))
  if (chunk) sock.send(chunk.packet, 2425, rinfo.address)
})

sock.bind(0, () => {
  const text = buildPacket({
    packetNo: nextPacketNo(),
    user: USER,
    host: HOST,
    command: COMMAND.SENDMSG | 0x100,
    extra: 'DSH-TEST：看到这句话 + 下面这张图，说明明文文本和图片都通了',
  })
  sock.send(text, 2425, peer)
  for (const chunk of chunks) sock.send(chunk.packet, 2425, peer)
  console.log('sent text + all chunks, listening for 0xC1 retransmit requests...')
  setTimeout(() => {
    console.log('retransmit requests:', JSON.stringify([...requested.entries()]))
    sock.close()
  }, 12000)
})
