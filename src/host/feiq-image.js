/**
 * FeiQ image transfer (SENDIMAGE 0xC0 / request 0xC1).
 *
 * Captured from FeiQ 3.0.0.1 on this machine while sending two images:
 *
 *   extra = "<id>|<total>|<offset>|<chunks>|<index>|<chunkLen>|<0>|<code>|<0>|<flags>#\0<data>"
 *
 *   id       8 hex chars, one per image (sender generated)
 *   total    image byte length
 *   offset   byte offset of this chunk
 *   chunks   total chunk count
 *   index    1-based chunk number
 *   chunkLen bytes in this chunk (last one is short)
 *   code     2 = JPEG payload, 1 = FeiQ "LZW!" container
 *   data     raw bytes, prefixed by exactly one NUL after '#'
 *
 * The receiver answers with 0xC1 per chunk it wants:
 *
 *   extra = "<id>|<index>#"
 *
 * which doubles as the retransmission request. Chunk size is 512 by default
 * (FeiqCfg.xml: BmpUdpSendSize=512, BmpUdpTrys=10).
 */

import { COMMAND, buildPacket } from './ipmsg.js'

export const IMAGE_CHUNK_SIZE = 512

export const IMAGE_CODE = Object.freeze({
  LZW: 1,
  JPEG: 2,
})

const HASH = 0x23
const NUL = 0x00
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_CHUNKS = 65536

export function newImageId() {
  let id = ''
  for (let i = 0; i < 8; i++) id += Math.floor(Math.random() * 16).toString(16)
  return id
}

/**
 * Parse the extra field of an image chunk packet.
 * @param {Buffer} extra
 * @returns {null | { id, total, offset, chunks, index, chunkLen, code, flags, data }}
 */
export function parseImageExtra(extra) {
  if (!Buffer.isBuffer(extra)) return null
  const hash = extra.indexOf(HASH)
  if (hash <= 0) return null
  const header = extra.subarray(0, hash).toString('latin1')
  const fields = header.split('|')
  if (fields.length < 6) return null
  const id = fields[0]
  if (!/^[0-9a-fA-F]{1,16}$/.test(id)) return null
  const total = Number(fields[1])
  const offset = Number(fields[2])
  const chunks = Number(fields[3])
  const index = Number(fields[4])
  const chunkLen = Number(fields[5])
  const code = fields[7] === undefined ? 0 : Number(fields[7])
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_IMAGE_BYTES) return null
  if (!Number.isSafeInteger(chunks) || chunks <= 0 || chunks > MAX_CHUNKS) return null
  if (!Number.isSafeInteger(index) || index < 1 || index > chunks) return null
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= total) return null
  if (!Number.isSafeInteger(chunkLen) || chunkLen < 0 || chunkLen > IMAGE_CHUNK_SIZE) return null
  const start = hash + 2 // '#' + one NUL pad, verified on 36/36 captured packets
  if (start + chunkLen > extra.length) return null
  return {
    id: id.toLowerCase(),
    total,
    offset,
    chunks,
    index,
    chunkLen,
    code: Number.isSafeInteger(code) ? code : 0,
    flags: fields[9] ?? '',
    data: extra.subarray(start, start + chunkLen),
  }
}

/**
 * Build the extra payload of one image chunk.
 * @param {object} spec
 * @returns {Buffer}
 */
export function buildImageExtra({ id, total, offset, chunks, index, chunkLen, code = IMAGE_CODE.JPEG, flags = '00000000', data }) {
  if (!Buffer.isBuffer(data)) throw new TypeError('data must be a Buffer')
  if (data.length !== chunkLen) throw new RangeError('chunkLen does not match data length')
  const header = `${id}|${total}|${offset}|${chunks}|${index}|${chunkLen}|0|${code}|0|${flags}#`
  return Buffer.concat([Buffer.from(header, 'latin1'), Buffer.from([NUL]), data])
}

/**
 * Split an image into chunks ready for the wire.
 * @returns {Array<{ index, offset, chunkLen, extra, packet }>}
 */
export function buildImageChunks({
  data,
  id = newImageId(),
  code = IMAGE_CODE.JPEG,
  chunkSize = IMAGE_CHUNK_SIZE,
  user = '',
  host = '',
  feiqHeader,
  packetNo = () => 0,
}) {
  if (!Buffer.isBuffer(data) || data.length === 0) throw new TypeError('data must be a non-empty Buffer')
  if (data.length > MAX_IMAGE_BYTES) throw new RangeError('image too large')
  if (chunkSize < 1 || chunkSize > IMAGE_CHUNK_SIZE) throw new RangeError('chunkSize out of range')
  const chunks = Math.ceil(data.length / chunkSize)
  const out = []
  for (let i = 0; i < chunks; i++) {
    const offset = i * chunkSize
    const part = data.subarray(offset, Math.min(offset + chunkSize, data.length))
    const extra = buildImageExtra({
      id,
      total: data.length,
      offset,
      chunks,
      index: i + 1,
      chunkLen: part.length,
      code,
      data: part,
    })
    out.push({
      index: i + 1,
      offset,
      chunkLen: part.length,
      extra,
      packet: buildPacket({
        feiqHeader,
        packetNo: packetNo(),
        user,
        host,
        command: COMMAND.SENDIMAGE | 0x200000,
        extraBuffer: extra,
        terminator: false,
      }),
    })
  }
  return out
}

/** `<id>|<index>#` — the 0xC1 packet a receiver uses to (re)request a chunk. */
export function buildImageRequestExtra({ id, index }) {
  return `${id}|${index}#`
}

export function buildImageRequestPacket({ id, index, packetNo, user = '', host = '', command = 0xc1 }) {
  return buildPacket({
    packetNo: packetNo(),
    user,
    host,
    command,
    extra: buildImageRequestExtra({ id, index }),
  })
}

/**
 * Send-side bookkeeping. 0xC1 is a per-chunk ACK, not a retransmission
 * request: acking must never trigger a resend, or the two sides ping-pong
 * forever. Unacked chunks are retried on a timer (FeiQ: BmpUdpTrys = 10).
 */
export class ImageSender {
  constructor({ chunks, retryMs = 1200, maxTries = 10 }) {
    this.entries = chunks.map((chunk) => ({ chunk, acked: false, tries: 0, lastSentAt: 0 }))
    this.retryMs = retryMs
    this.maxTries = maxTries
  }

  markSent(index, at = Date.now()) {
    const entry = this.entries.find((e) => e.chunk.index === index)
    if (!entry || entry.acked) return
    entry.tries++
    entry.lastSentAt = at
  }

  /** @returns {boolean} true only for a newly acknowledged chunk */
  ack(index, at = Date.now()) {
    const entry = this.entries.find((e) => e.chunk.index === index)
    if (!entry || entry.acked) return false
    entry.acked = true
    entry.ackedAt = at
    return true
  }

  ackCount() {
    return this.entries.filter((e) => e.acked).length
  }

  total() {
    return this.entries.length
  }

  isDone() {
    return this.entries.every((e) => e.acked)
  }

  failedIndexes() {
    return this.entries.filter((e) => !e.acked && e.tries >= this.maxTries).map((e) => e.chunk.index)
  }

  /** Chunks that were sent at least once, are unacked, and waited long enough. */
  retryList(now = Date.now()) {
    return this.entries
      .filter((e) => !e.acked && e.tries > 0 && e.tries < this.maxTries && now - e.lastSentAt >= this.retryMs)
      .map((e) => e.chunk)
  }

  unackedIndexes() {
    return this.entries.filter((e) => !e.acked).map((e) => e.chunk.index)
  }
}

/** Collect chunks for one or more images, expose missing indexes. */
export class ImageReceiver {
  constructor() {
    this.images = new Map()
  }

  /**
   * @param {Buffer} extra raw extra field (after the fifth ':')
   * @returns {{ id: string, complete: boolean } | null}
   */
  accept(extra) {
    const chunk = parseImageExtra(extra)
    if (chunk === null) return null
    let image = this.images.get(chunk.id)
    if (!image) {
      image = {
        id: chunk.id,
        total: chunk.total,
        chunks: chunk.chunks,
        code: chunk.code,
        parts: new Map(),
        createdAt: Date.now(),
      }
      this.images.set(chunk.id, image)
    }
    if (image.total !== chunk.total || image.chunks !== chunk.chunks) return null
    if (!image.parts.has(chunk.index)) image.parts.set(chunk.index, chunk)
    return { id: chunk.id, complete: image.parts.size === image.chunks }
  }

  /** Indexes still missing, in ascending order. */
  missing(id) {
    const image = this.images.get(id)
    if (!image) return []
    const out = []
    for (let i = 1; i <= image.chunks; i++) if (!image.parts.has(i)) out.push(i)
    return out
  }

  /** Drop an assembled image and return it. */
  take(id) {
    const image = this.images.get(id)
    if (!image) return null
    if (image.parts.size !== image.chunks) return null
    const out = Buffer.alloc(image.total)
    for (let i = 1; i <= image.chunks; i++) {
      const chunk = image.parts.get(i)
      chunk.data.copy(out, chunk.offset)
    }
    this.images.delete(id)
    return { id, code: image.code, data: out }
  }

  forget(id) {
    this.images.delete(id)
  }

  /** Expire partial images so a dropped transfer does not leak memory. */
  sweep(ttlMs = 60_000) {
    const now = Date.now()
    for (const [id, image] of this.images) {
      if (now - image.createdAt > ttlMs) this.images.delete(id)
    }
  }
}
