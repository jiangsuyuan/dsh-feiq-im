/**
 * Send a plaintext image message to the local FeiQ using the format it itself
 * uses for peers that do not answer GETPUBKEY (captured 2026-11-20):
 *
 *   1) SENDMSG|SENDCHECK, text = "/~#><id><B~{/font;...}"   (with the `#MAC` header)
 *   2) SENDIMAGE|FILEATTACH chunks, 512 bytes, code 2 = JPEG (with the header)
 *   3) every 0xC1 is an ACK for one chunk; unacked chunks retry on a timer
 *
 * Run: node scripts/probe-send-image-plain.mjs <image.jpg> [seconds]
 */
import fs from 'node:fs'
import dgram from 'node:dgram'

import { COMMAND, buildPacket, nextPacketNo, parsePacket } from '../src/host/ipmsg.js'
import { IMAGE_CODE, ImageSender, buildImageChunks, newImageId } from '../src/host/feiq-image.js'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/probe-send-image-plain.mjs <image.jpg> [seconds]')
  process.exit(2)
}
const seconds = Number(process.argv[3] ?? 12)
const data = fs.readFileSync(file)
const id = newImageId()
const NAME = 'DSH-IM'
const HOST = 'DSH-IM-PC'
const VER = '1_lbt6_0#128#AABBCCDDEEFF#0#0#0#4001#9'
const peer = '127.0.0.1'
const PORT = 24250
const format = '{/font;-16 0 0 0 400 0 0 0 134 0 0 2 32 微软雅黑 8404992;}'

const chunks = buildImageChunks({
  data,
  id,
  code: IMAGE_CODE.JPEG,
  user: NAME,
  host: HOST,
  feiqHeader: VER,
  packetNo: () => nextPacketNo(),
})
const sender = new ImageSender({ chunks, retryMs: 800, maxTries: 10 })
console.log(`image bytes=${data.length} id=${id} chunks=${chunks.length}`)

const sock = dgram.createSocket('udp4')
let acks = 0
let retries = 0

sock.on('message', (message, rinfo) => {
  const packet = parsePacket(message, { keepTrailingNuls: true })
  if (!packet) return
  const mode = packet.command & 0xff
  if (mode !== 0xc1) return
  const [rid, index] = packet.text.replace('#', '').split('|')
  if (rid !== id) return
  if (sender.ack(Number(index))) {
    acks++
    console.log(`ack ${index} (${sender.ackCount()}/${sender.total()})`)
  }
})

function announce() {
  sock.send(buildPacket({
    feiqHeader: VER,
    packetNo: Math.floor(Date.now() / 1000),
    user: NAME,
    host: HOST,
    command: COMMAND.BR_ENTRY,
    extra: '',
  }), 2425, peer)
}

sock.bind(PORT, () => {
  announce()
  sock.send(buildPacket({
    feiqHeader: VER,
    packetNo: nextPacketNo(),
    user: NAME,
    host: HOST,
    command: COMMAND.SENDMSG | 0x100,
    extra: `/~#>${id}<B~${format}`,
  }), 2425, peer)

  for (const chunk of chunks) {
    sock.send(chunk.packet, 2425, peer)
    sender.markSent(chunk.index)
  }
  console.log('sent marker + chunks')

  const timer = setInterval(() => {
    for (const chunk of sender.retryList()) {
      sock.send(chunk.packet, 2425, peer)
      sender.markSent(chunk.index)
      retries++
    }
    if (sender.isDone()) {
      console.log(`all ${sender.total()} chunks acked`)
    }
  }, 200)

  setTimeout(() => {
    clearInterval(timer)
    console.log(`done: acked=${sender.ackCount()}/${sender.total()} retries=${retries} failed=[${sender.unackedIndexes().join(',')}]`)
    sock.close()
  }, seconds * 1000)
})
