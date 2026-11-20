/**
 * Fake FeiQ peer for one experiment: appear in the local FeiQ roster as
 * "DSH-IM", deliberately NOT answer GETPUBKEY (to simulate a peer without
 * encryption support), and log whatever FeiQ sends when the user sends an image.
 *
 * Run: node scripts/probe-plain-peer.mjs [seconds]
 */
import dgram from 'node:dgram'

import { COMMAND, buildPacket, nextPacketNo, parsePacket } from '../src/host/ipmsg.js'

const PORT = 24250
const NAME = 'DSH-IM'
const HOST = 'DSH-IM-PC'
const VER = '1_lbt6_0#128#AABBCCDDEEFF#0#0#0#4001#9'
const peer = '127.0.0.1'
const seconds = Number(process.argv[2] ?? 300)

const sock = dgram.createSocket('udp4')

sock.on('message', (message, rinfo) => {
  const packet = parsePacket(message, { keepTrailingNuls: true })
  if (!packet) {
    console.log(`<- raw ${message.length} bytes from ${rinfo.address}:${rinfo.port} ${message.subarray(0, 40).toString('latin1')}`)
    return
  }
  const mode = packet.command & 0xff
  console.log(
    `<- ${rinfo.address}:${rinfo.port} cmd=${packet.command}(0x${mode.toString(16)}) user=${JSON.stringify(packet.user)} host=${JSON.stringify(packet.host)} text=${JSON.stringify(packet.text.slice(0, 80))} extraHex=${packet.extra.subarray(0, 24).toString('hex')}`,
  )
  if (mode === COMMAND.SENDMSG && (packet.command & 0x100) === 0x100) {
    const ack = buildPacket({
      packetNo: nextPacketNo(),
      user: NAME,
      host: HOST,
      command: COMMAND.RECVMSG,
      extra: packet.packetNo,
    })
    sock.send(ack, rinfo.port, rinfo.address)
  }
})

function announce() {
  const packet = buildPacket({
    feiqHeader: VER,
    packetNo: Math.floor(Date.now() / 1000),
    user: NAME,
    host: HOST,
    command: COMMAND.BR_ENTRY,
    extra: '',
  })
  sock.send(packet, 2425, peer)
}

sock.bind(PORT, () => {
  console.log(`DSH-IM listening on ${PORT}, announcing to ${peer}:2425 for ${seconds}s`)
  announce()
  const timer = setInterval(announce, 5000)
  setTimeout(() => {
    clearInterval(timer)
    sock.close()
    console.log('probe finished')
  }, seconds * 1000)
})
