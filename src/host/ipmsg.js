/**
 * IPMsg / FeiQ (飞秋 / 飞鸽传书) text-packet codec.
 *
 * Wire format, one UDP datagram per packet, legacy 1-byte-per-char encoding:
 *
 *     ver : packetNo : user : host : command : extra
 *
 * FeiQ prefixes `ver` with a private `#`-separated header (verified against a
 * live FeiQ 3.x on the local machine, see docs/lan-im-design.md appendix B.6):
 *
 *     1_lbt80_0#128#001122334455#0#0#0#4000#9 : 1795120395 : user : host : cmd : extra
 *
 * Observed behaviour that this codec relies on:
 *   - FeiQ ACCEPTS a plain standard packet (no `#` header);
 *   - FeiQ always REPLIES with its `#` header;
 *   - its packetNo is epoch seconds, not a counter;
 *   - its text is GBK and the datagram ends with one or two NUL bytes;
 *   - unknown/private commands must be ignored, never thrown on.
 *
 * Zero dependencies. Node's TextDecoder('gbk') is backed by ICU; the encoder is
 * reconstructed from the decoder on first use (no 200 KB table needed).
 */

export const MAX_PACKET_BYTES = 16 * 1024
export const MAX_FIELD_BYTES = 8 * 1024
export const MAX_TEXT_BYTES = 4 * 1024

/** Command (mode) codes. `command = mode | flags`. */
export const COMMAND = Object.freeze({
  NOOP: 0x00,
  BR_ENTRY: 0x01,
  BR_EXIT: 0x02,
  ANSENTRY: 0x03,
  BR_ABSENCE: 0x04,
  SENDMSG: 0x20,
  RECVMSG: 0x21,
  READMSG: 0x30,
  DELMSG: 0x31,
  GETINFO: 0x40,
  SENDINFO: 0x41,
  GETABSENCEINFO: 0x50,
  SENDABSENCEINFO: 0x51,
  GETFILEDATA: 0x60,
  RELEASEFILES: 0x61,
  GETDIRFILES: 0x62,
  ANSREADMSG: 0x32,
  // FeiQ (飞秋) private extensions, confirmed against 3.0.0.1 on this machine.
  OPEN_YOU: 0x77,
  INPUTING: 0x79,
  INPUT_END: 0x7a,
  SENDIMAGE: 0xc0,
  KNOCK: 0xd1,
  KNOCK_ACK: 0xd2,
  MAC_HANDSHAKE: 0xd9,
  INFO_1D8: 0x1d8,
})

/** Option bits. Bits overlap between commands (ABSENCE vs SENDCHECK); use in context. */
export const OPTION = Object.freeze({
  ABSENCE: 0x100,
  SENDCHECK: 0x100,
  SECRET: 0x200,
  BROADCAST: 0x400,
  MULTICAST: 0x800,
  NOPOPUP: 0x1000,
  AUTORET: 0x2000,
  RETRY: 0x4000,
  PASSWORD: 0x8000,
  NOLOG: 0x20000,
  NEWMULTI: 0x40000,
  NOADDLIST: 0x80000,
  READCHECK: 0x100000,
  FILEATTACH: 0x200000,
  ENCRYPT: 0x400000,
})

export const MODE_MASK = 0xff

/** FeiQ field separators, confirmed by the wire format and reference clients. */
export const FIELD_SEPARATOR = 0x3a // ':'
export const FILELIST_SEPARATOR = 0x07
export const NAME_ESCAPE = 0x08 // ':' inside name/host on the wire

export const KNOWN_MODES = new Set(Object.values(COMMAND))

export function modeOf(command) {
  return command & MODE_MASK
}

export function flagsOf(command) {
  return command & ~MODE_MASK
}

export function hasOption(command, option) {
  return (command & option) === option
}

export function modeName(command) {
  const mode = modeOf(command)
  for (const [name, value] of Object.entries(COMMAND)) {
    if (value === mode) return name
  }
  return `0x${mode.toString(16)}`
}

/* ------------------------------------------------------------------ */
/* text encoding                                                       */
/* ------------------------------------------------------------------ */

const utf8Strict = new TextDecoder('utf-8', { fatal: true })
const utf8Loose = new TextDecoder('utf-8', { fatal: false })
let gbkDecoder
let gbkReverse

function gbkDecodeOrNull() {
  if (gbkDecoder === undefined) {
    try {
      gbkDecoder = new TextDecoder('gbk')
    } catch {
      gbkDecoder = null
    }
  }
  return gbkDecoder
}

/**
 * Build a char -> bytes map by decoding every two-byte GBK code once.
 * Measured: 23,939 single-character mappings, a few milliseconds, ~2 MB.
 */
function ensureGbkReverse() {
  if (gbkReverse) return gbkReverse
  const decoder = gbkDecodeOrNull()
  const map = new Map()
  if (decoder) {
    for (let lead = 0x81; lead <= 0xfe; lead++) {
      for (let trail = 0x40; trail <= 0xfe; trail++) {
        if (trail === 0x7f) continue
        const ch = decoder.decode(Uint8Array.of(lead, trail))
        if (ch.length === 1 && ch !== '\uFFFD' && !map.has(ch)) {
          map.set(ch, [lead, trail])
        }
      }
    }
  }
  for (let code = 0x20; code < 0x7f; code++) {
    const ch = String.fromCharCode(code)
    if (!map.has(ch)) map.set(ch, [code])
  }
  gbkReverse = map
  return map
}

/** Decode bytes as GBK, falling back to a lossy UTF-8 read. */
export function decodeGbk(bytes) {
  const decoder = gbkDecodeOrNull()
  if (!decoder) return utf8Loose.decode(bytes)
  return decoder.decode(bytes)
}

/**
 * Decode a 1-byte-per-char field. Strict UTF-8 wins when valid (modern FeiQ can
 * send UTF-8), otherwise GBK — this is the only reliable auto-detection because
 * GBK Chinese text almost never forms valid UTF-8.
 */
export function decodeText(bytes) {
  if (bytes.length === 0) return ''
  try {
    return utf8Strict.decode(bytes)
  } catch {
    return decodeGbk(bytes)
  }
}

/** Encode text as GBK (FeiQ's default). Unmappable code points become '?'. */
export function encodeGbk(text) {
  const map = ensureGbkReverse()
  const out = []
  for (const ch of text) {
    if (ch.codePointAt(0) < 0x80) {
      out.push(ch.charCodeAt(0))
      continue
    }
    const pair = map.get(ch)
    if (pair) out.push(pair[0], pair[1])
    else out.push(0x3f)
  }
  return Buffer.from(out)
}

export function encodeText(text, encoding = 'gbk') {
  return encoding === 'utf8' ? Buffer.from(text, 'utf8') : encodeGbk(text)
}

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

function latin1(bytes) {
  return bytes.toString('latin1')
}

/**
 * Parse one datagram.
 * @param {Buffer} buf
 * @returns {null | {
 *   ver: string, header: string[] | null, packetNo: string,
 *   user: string, host: string, command: number, mode: number, flags: number,
 *   extra: Buffer, text: string, textTail: Buffer, raw: string,
 * }}
 */
export function parsePacket(buf, { keepTrailingNuls = false } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length === 0 || buf.length > MAX_PACKET_BYTES) return null

  let end = buf.length
  if (!keepTrailingNuls) {
    while (end > 0 && buf[end - 1] === 0) end--
  }
  if (end === 0) return null

  const body = latin1(buf.subarray(0, end))
  // Split off exactly five fields; everything after the fifth ':' is `extra`,
  // which may legitimately contain more colons (message text, QUOTE blocks).
  const parts = []
  let start = 0
  for (let i = 0; i < 5; i++) {
    const at = body.indexOf(':', start)
    if (at === -1) break
    parts.push(body.slice(start, at))
    start = at + 1
  }
  if (parts.length === 4) {
    // Older clients may omit the trailing colon when extra is empty.
    parts.push(body.slice(start))
    parts.push('')
  } else if (parts.length === 5) {
    parts.push(body.slice(start))
  } else {
    return null
  }

  const versionField = parts[0]
  const header = versionField.includes('#') ? versionField.split('#') : null
  const ver = header ? header[0] : versionField

  if (!/^\d{1,10}$/.test(parts[4])) return null
  const command = Number(parts[4])
  if (!Number.isSafeInteger(command) || command < 0) return null

  const userBytes = Buffer.from(parts[2], 'latin1')
  const hostBytes = Buffer.from(parts[3], 'latin1')
  const extra = Buffer.from(parts[5] ?? '', 'latin1')
  if (userBytes.length > MAX_FIELD_BYTES || hostBytes.length > MAX_FIELD_BYTES) return null
  if (extra.length > MAX_FIELD_BYTES) return null

  // `extra` may carry NUL-separated extension blocks (quotes, file lists).
  const nul = extra.indexOf(0)
  const head = nul === -1 ? extra : extra.subarray(0, nul)
  const textTail = nul === -1 ? Buffer.alloc(0) : extra.subarray(nul + 1)

  return {
    ver,
    header,
    packetNo: parts[1],
    user: unescapeField(decodeText(userBytes)),
    host: unescapeField(decodeText(hostBytes)),
    command,
    mode: modeOf(command),
    flags: flagsOf(command),
    extra,
    text: decodeText(head).slice(0, MAX_TEXT_BYTES),
    textTail,
    raw: body.slice(0, 512),
  }
}

/** Split the `#` header of a FeiQ packet into named fields. */
export function parseFeiqHeader(header) {
  if (!Array.isArray(header) || header.length === 0) return null
  return {
    tag: header[0] ?? '',
    declaredLength: header[1] ?? '',
    mac: header[2] ?? '',
    reserved: header.slice(3, 6),
    portTag: header[6] ?? '',
    kind: header[7] ?? '',
    fields: header,
  }
}

/* ------------------------------------------------------------------ */
/* building                                                            */
/* ------------------------------------------------------------------ */

function joinFields(fields) {
  const out = []
  fields.forEach((field, index) => {
    if (index > 0) out.push(Buffer.from(':', 'latin1'))
    out.push(Buffer.isBuffer(field) ? field : Buffer.from(String(field), 'latin1'))
  })
  return Buffer.concat(out)
}

/**
 * Build the FeiQ private header. `declaredLength` is the extra-field byte count
 * INCLUDING the trailing NUL, because FeiQ copies exactly that many bytes into
 * its 0x8000 buffer and never appends a terminator itself.
 */
export function buildFeiqHeaderValue({
  tag = '1_lbt80_0',
  declaredLength,
  mac = '000000000000',
  portTag = '4000',
  kind = '9',
} = {}) {
  if (!Number.isInteger(declaredLength) || declaredLength < 0) {
    throw new TypeError('declaredLength must be a non-negative integer')
  }
  return [tag, String(declaredLength), mac, '0', '0', '0', portTag, kind].join('#')
}

/**
 * Build one datagram.
 * @param {object} spec
 * @param {string} [spec.ver='1']     standard version field when no FeiQ header
 * @param {string} [spec.feiqHeader]  pre-built `#` header; overrides `ver`
 * @param {string|number} spec.packetNo
 * @param {string} spec.user
 * @param {string} spec.host
 * @param {number} spec.command
 * @param {string} [spec.extra='']
 * @param {Buffer} [spec.extraBuffer] binary extra (overrides `extra`)
 * @param {'gbk'|'utf8'} [spec.encoding='gbk']
 * @param {boolean} [spec.terminator=true] append '\0'
 * @returns {Buffer}
 */
export function buildPacket({
  ver = '1',
  feiqHeader,
  packetNo,
  user = '',
  host = '',
  command,
  extra = '',
  extraBuffer = null,
  encoding = 'gbk',
  terminator = true,
}) {
  if (!Number.isSafeInteger(command) || command < 0) {
    throw new TypeError('command must be a non-negative integer')
  }
  if (packetNo === undefined || packetNo === null || String(packetNo) === '') {
    throw new TypeError('packetNo is required')
  }

  const extraBytes = extraBuffer ?? encodeText(extra, encoding)
  if (extraBytes.length > MAX_FIELD_BYTES) throw new RangeError('extra too large')

  const versionField = feiqHeader ?? ver
  const head = joinFields([
    Buffer.from(String(versionField), 'latin1'),
    Buffer.from(String(packetNo), 'latin1'),
    encodeText(escapeField(user), encoding),
    encodeText(escapeField(host), encoding),
    Buffer.from(String(command), 'latin1'),
    extraBytes,
  ])
  return terminator ? Buffer.concat([head, Buffer.from([0])]) : head
}

/* ------------------------------------------------------------------ */
/* FeiQ name escaping and file attachments                             */
/* ------------------------------------------------------------------ */

const COLON_CHAR = String.fromCharCode(FIELD_SEPARATOR)
const ESCAPE_CHAR = String.fromCharCode(NAME_ESCAPE)

/** IPMsg puts ':' inside name/host on the wire as 0x08. */
export function escapeField(text) {
  return String(text).split(COLON_CHAR).join(ESCAPE_CHAR)
}

export function unescapeField(text) {
  return String(text).split(ESCAPE_CHAR).join(COLON_CHAR)
}

function hexOf(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0))
  return n.toString(16)
}

function hexToInt(text) {
  if (!/^[0-9a-fA-F]{1,10}$/.test(text)) return null
  return Number.parseInt(text, 16)
}

/** Split one file entry on ':' while keeping "::" inside the name as a literal ':'. */
function splitFileEntry(bytes) {
  const parts = []
  let current = []
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]
    if (byte !== FIELD_SEPARATOR) {
      current.push(byte)
      continue
    }
    if (bytes[i + 1] === FIELD_SEPARATOR) {
      current.push(FIELD_SEPARATOR)
      i++
      continue
    }
    parts.push(Buffer.from(current))
    current = []
  }
  parts.push(Buffer.from(current))
  return parts
}

/**
 * Parse the attachment part of `SENDMSG|FILEATTACH`.
 * Wire layout: `<text>\0<id>:<name>:<sizeHex>:<mtimeHex>:<typeHex>:\x07 ...`
 */
export function parseFileList(extra) {
  if (!Buffer.isBuffer(extra)) return []
  const firstNul = extra.indexOf(0)
  if (firstNul === -1) return []
  const files = []
  let start = firstNul + 1
  while (start < extra.length) {
    const end = extra.indexOf(FILELIST_SEPARATOR, start)
    if (end === -1) break
    const fields = splitFileEntry(extra.subarray(start, end))
    start = end + 1
    if (fields.length < 5) continue
    const fileId = Number.parseInt(fields[0].toString('latin1'), 10)
    const size = hexToInt(fields[2].toString('latin1'))
    const mtime = hexToInt(fields[3].toString('latin1'))
    const fileType = hexToInt(fields[4].toString('latin1'))
    if (!Number.isSafeInteger(fileId) || size === null) continue
    files.push({
      fileId,
      name: decodeText(fields[1]),
      size,
      mtime: mtime ?? 0,
      fileType: fileType ?? 1,
    })
  }
  return files
}

/** One attachment entry: `id:name:sizeHex:mtimeHex:typeHex:` (name ':' -> '::'). */
export function buildFileEntry({ fileId, name, size, mtime = 0, fileType = 1 }) {
  const safeName = String(name).split(COLON_CHAR).join(COLON_CHAR + COLON_CHAR)
  return Buffer.concat([
    Buffer.from(`${fileId}:`, 'latin1'),
    encodeText(safeName),
    Buffer.from(`:${hexOf(size)}:${hexOf(mtime)}:${hexOf(fileType)}:`, 'latin1'),
  ])
}

/** Full extra payload for `SENDMSG|FILEATTACH`. */
export function buildFileAttachExtra(files, { message = '', encoding = 'gbk' } = {}) {
  const parts = [encodeText(message, encoding), Buffer.from([0])]
  for (const file of files) {
    parts.push(buildFileEntry(file), Buffer.from([FILELIST_SEPARATOR]))
  }
  return Buffer.concat(parts)
}

/** `GETFILEDATA` extra: the offer's packetNo, fileId and offset, all in hex. */
export function buildFileRequestExtra({ offerPacketNo, fileId, offset = 0 }) {
  return `${hexOf(offerPacketNo)}:${hexOf(fileId)}:${hexOf(offset)}:`
}

/** The packet a receiver writes into the sender's TCP 2425 socket. */
export function buildFileRequestPacket({
  requestPacketNo,
  offerPacketNo,
  fileId,
  offset = 0,
  user = '',
  host = '',
  command = COMMAND.GETFILEDATA,
}) {
  return buildPacket({
    packetNo: requestPacketNo,
    user,
    host,
    command,
    extra: buildFileRequestExtra({ offerPacketNo, fileId, offset }),
  })
}

/** 闪屏震动: FeiQ replies 0xD2 and every peer window shakes. */
export function buildKnockPacket({ packetNo, user = '', host = '', ver = '1' }) {
  return buildPacket({ packetNo, user, host, command: COMMAND.KNOCK, ver, extra: '' })
}

/* ------------------------------------------------------------------ */
/* misc helpers                                                        */
/* ------------------------------------------------------------------ */

let packetCounter = 0

/**
 * FeiQ uses epoch seconds as its packet number. Ours is a plain monotonic
 * counter: it only has to correlate RECVMSG/READMSG with what we sent, and it
 * must stay within the 10-digit / int32 range that old clients tolerate.
 */
export function nextPacketNo() {
  packetCounter = (packetCounter + 1) % 2000000000
  return packetCounter === 0 ? (packetCounter = 1) : packetCounter
}

export function timestampPacketNo(now = Date.now()) {
  return Math.floor(now / 1000)
}
