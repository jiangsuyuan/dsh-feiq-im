import test from 'node:test'
import assert from 'node:assert/strict'

import { COMMAND, parsePacket } from '../src/host/ipmsg.js'
import {
  IMAGE_CHUNK_SIZE,
  IMAGE_CODE,
  ImageReceiver,
  ImageSender,
  buildImageChunks,
  buildImageExtra,
  buildImageRequestExtra,
  buildImageRequestPacket,
  newImageId,
  parseImageExtra,
} from '../src/host/feiq-image.js'

function sampleBytes(length) {
  const out = Buffer.alloc(length)
  for (let i = 0; i < length; i++) out[i] = (i * 37 + 11) % 256
  return out
}

test('parses the extra layout captured from FeiQ', () => {
  const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const extra = buildImageExtra({
    id: '3531d1b3', total: 9769, offset: 0, chunks: 20, index: 1, chunkLen: data.length, code: 2, data,
  })
  const text = extra.subarray(0, extra.indexOf(0x23)).toString('latin1')
  assert.equal(text, '3531d1b3|9769|0|20|1|6|0|2|0|00000000')
  const parsed = parseImageExtra(extra)
  assert.ok(parsed !== null)
  assert.equal(parsed.id, '3531d1b3')
  assert.equal(parsed.total, 9769)
  assert.equal(parsed.offset, 0)
  assert.equal(parsed.chunks, 20)
  assert.equal(parsed.index, 1)
  assert.equal(parsed.chunkLen, 6)
  assert.equal(parsed.code, 2)
  assert.deepEqual(parsed.data, data)
})

test('splits an image into 512-byte chunks with correct offsets', () => {
  const data = sampleBytes(1200)
  const chunks = buildImageChunks({ data, id: 'deadbeef', code: IMAGE_CODE.JPEG, packetNo: () => 42 })
  assert.equal(chunks.length, 3)
  assert.deepEqual(chunks.map((c) => c.chunkLen), [512, 512, 176])
  assert.deepEqual(chunks.map((c) => c.offset), [0, 512, 1024])
  assert.equal(IMAGE_CHUNK_SIZE, 512)
  for (const chunk of chunks) {
    assert.equal(chunk.packet[chunk.packet.length - 1], data[chunk.offset + chunk.chunkLen - 1])
    const packet = parsePacket(chunk.packet, { keepTrailingNuls: true })
    assert.ok(packet !== null)
    assert.equal(packet.mode, COMMAND.SENDIMAGE)
    const parsed = parseImageExtra(packet.extra)
    assert.ok(parsed !== null)
    assert.equal(parsed.id, 'deadbeef')
    assert.equal(parsed.index, chunk.index)
  }
})

test('reassembles out-of-order chunks and reports missing indexes', () => {
  const data = sampleBytes(1500)
  const chunks = buildImageChunks({ data, id: 'cafebabe', code: IMAGE_CODE.JPEG })
  const receiver = new ImageReceiver()

  // Feed everything except chunk 2, in reverse order.
  for (const chunk of [...chunks].reverse()) {
    if (chunk.index === 2) continue
    receiver.accept(chunk.extra)
  }
  assert.deepEqual(receiver.missing('cafebabe'), [2])
  assert.equal(receiver.take('cafebabe'), null)

  receiver.accept(chunks[1].extra)
  assert.deepEqual(receiver.missing('cafebabe'), [])
  const image = receiver.take('cafebabe')
  assert.ok(image !== null)
  assert.equal(image.code, IMAGE_CODE.JPEG)
  assert.deepEqual(image.data, data)
  receiver.forget('cafebabe')
})

test('rejects malformed image chunks instead of throwing', () => {
  assert.equal(parseImageExtra(Buffer.alloc(0)), null)
  assert.equal(parseImageExtra(Buffer.from('nohash', 'latin1')), null)
  assert.equal(parseImageExtra(Buffer.from('id|1|0|1|1|9|0|2|0|00000000#\0xx', 'latin1')), null)
  assert.equal(parseImageExtra(Buffer.from('id|0|0|1|1|0|0|2|0|00000000#\0', 'latin1')), null)
  assert.throws(() => buildImageExtra({
    id: 'x', total: 2, offset: 0, chunks: 1, index: 1, chunkLen: 2, data: Buffer.from([1]),
  }), RangeError)
})

test('builds the 0xC1 request a FeiQ receiver sends', () => {
  assert.equal(buildImageRequestExtra({ id: '3531d1b3', index: 7 }), '3531d1b3|7#')
  const packet = parsePacket(buildImageRequestPacket({
    id: '3531d1b3', index: 7, packetNo: () => 99, user: 'u', host: 'h',
  }))
  assert.ok(packet !== null)
  assert.equal(packet.command & 0xff, 0xc1)
  assert.equal(packet.text, '3531d1b3|7#')
})

test('image ids are 8 lowercase hex chars', () => {
  for (let i = 0; i < 20; i++) assert.match(newImageId(), /^[0-9a-f]{8}$/)
})

test('0xC1 is an ACK: acked chunks are never retried', () => {
  const data = sampleBytes(1200)
  const chunks = buildImageChunks({ data, id: 'aaaaaaaa' })
  const sender = new ImageSender({ chunks, retryMs: 1000, maxTries: 3 })
  const t0 = 10_000
  for (const chunk of chunks) sender.markSent(chunk.index, t0)

  assert.equal(sender.ack(1, t0 + 10), true)
  assert.equal(sender.ack(1, t0 + 20), false, 'duplicate ack is ignored')
  assert.deepEqual(sender.retryList(t0 + 500), [], 'acked chunks are not retried')
  assert.deepEqual(sender.retryList(t0 + 1500).map((c) => c.index), [2, 3], 'only unacked chunks retry')

  for (const chunk of chunks) sender.ack(chunk.index, t0 + 2000)
  assert.ok(sender.isDone())
  assert.equal(sender.ackCount(), 3)
  assert.deepEqual(sender.failedIndexes(), [])
})

test('gives up on a chunk after maxTries', () => {
  const chunks = buildImageChunks({ data: sampleBytes(100), id: 'bbbbbbbb' })
  const sender = new ImageSender({ chunks, retryMs: 10, maxTries: 2 })
  sender.markSent(1, 0)
  sender.markSent(1, 20)
  assert.deepEqual(sender.retryList(1000), [])
  assert.deepEqual(sender.failedIndexes(), [1])
  assert.equal(sender.isDone(), false)
})
