import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMMAND,
  MAX_PACKET_BYTES,
  OPTION,
  buildFeiqHeaderValue,
  buildFileAttachExtra,
  buildFileEntry,
  buildFileRequestExtra,
  buildFileRequestPacket,
  buildKnockPacket,
  buildPacket,
  decodeGbk,
  decodeText,
  encodeGbk,
  escapeField,
  flagsOf,
  hasOption,
  modeName,
  modeOf,
  nextPacketNo,
  parseFeiqHeader,
  parseFileList,
  parsePacket,
  unescapeField,
} from '../src/host/ipmsg.js'

// Captured from a live FeiQ 3.x answering a plain BR_ENTRY on this machine.
const FEIQ_ANSENTRY =
  '1_lbt80_0#128#001122334455#0#0#0#4000#9:1795120395:Tester:PC-TEST:6291459:²âÊÔÔ±\0\0'
const FEIQ_RECVMSG =
  '1_lbt80_0#128#001122334455#0#0#0#4000#9:1795120400:Tester:PC-TEST:33:1795164632\0'

function latin1Buffer(text) {
  return Buffer.from(text, 'latin1')
}

test('parses a real FeiQ ANSENTRY datagram', () => {
  const packet = parsePacket(latin1Buffer(FEIQ_ANSENTRY))
  assert.ok(packet !== null)
  assert.equal(packet.mode, COMMAND.ANSENTRY)
  assert.equal(packet.command, 6291459)
  assert.equal(packet.user, 'Tester')
  assert.equal(packet.host, 'PC-TEST')
  assert.equal(packet.packetNo, '1795120395')
  assert.equal(packet.text, '测试员')
  assert.equal(packet.header.length, 8)
  assert.equal(packet.header[0], '1_lbt80_0')
  assert.equal(packet.header[1], '128')
  assert.equal(packet.header[2], '001122334455')
  assert.equal(flagsOf(packet.command), 0x600000)
})

test('parses a real FeiQ RECVMSG datagram', () => {
  const packet = parsePacket(latin1Buffer(FEIQ_RECVMSG))
  assert.ok(packet !== null)
  assert.equal(packet.mode, COMMAND.RECVMSG)
  assert.equal(packet.command, 33)
  assert.equal(packet.text, '1795164632')
})

test('accepts a plain standard packet like the one FeiQ answered', () => {
  const packet = parsePacket(latin1Buffer('1:1000001:DSH-PROBE:DSH:1:\0'))
  assert.ok(packet !== null)
  assert.equal(packet.ver, '1')
  assert.equal(packet.header, null)
  assert.equal(packet.mode, COMMAND.BR_ENTRY)
  assert.equal(packet.text, '')
})

test('keeps colons in the message and splits NUL-separated tail', () => {
  const packet = parsePacket(latin1Buffer('1:7:u:h:32:a:b\0QUOTE-BLOCK'))
  assert.ok(packet !== null)
  assert.equal(packet.text, 'a:b')
  assert.equal(packet.textTail.toString('latin1'), 'QUOTE-BLOCK')
})

test('tolerates a missing extra field and trailing NULs', () => {
  const packet = parsePacket(latin1Buffer('1:5:u:h:32\0\0'))
  assert.ok(packet !== null)
  assert.equal(packet.text, '')
  assert.equal(packet.extra.length, 0)
})

test('rejects malformed datagrams instead of throwing', () => {
  assert.equal(parsePacket(Buffer.alloc(0)), null)
  assert.equal(parsePacket(latin1Buffer('garbage')), null)
  assert.equal(parsePacket(latin1Buffer('1:5:u:h:not-a-number:\0')), null)
  assert.equal(parsePacket(latin1Buffer('1:5:u:h\0')), null)
  assert.equal(parsePacket(Buffer.alloc(MAX_PACKET_BYTES + 1)), null)
  assert.equal(parsePacket('\0\0\0'), null)
})

test('GBK encoding roundtrips and is recognised on the wire', () => {
  const bytes = encodeGbk('测试员')
  assert.equal(bytes.toString('hex'), 'b2e2cad4d4b1')
  assert.equal(decodeGbk(bytes), '测试员')
  assert.equal(decodeText(bytes), '测试员')
})

test('UTF-8 is preferred when the bytes are valid UTF-8', () => {
  assert.equal(decodeText(Buffer.from('你好', 'utf8')), '你好')
})

test('GBK encoder covers ASCII plus Chinese and degrades unmappable to ?', () => {
  const text = 'PC-01 测试员'
  assert.equal(decodeGbk(encodeGbk(text)), text)
  assert.equal(encodeGbk('😀').toString('latin1'), '?')
})

test('build and parse roundtrip with flags and a colon inside the message', () => {
  const buf = buildPacket({
    packetNo: 1000001,
    user: '测试用户',
    host: 'PC-01',
    command: COMMAND.SENDMSG | OPTION.SENDCHECK | OPTION.READCHECK,
    extra: '你好:world',
  })
  assert.equal(buf[buf.length - 1], 0, 'terminator is part of the datagram')
  const packet = parsePacket(buf)
  assert.ok(packet !== null)
  assert.equal(packet.mode, COMMAND.SENDMSG)
  assert.ok(hasOption(packet.command, OPTION.SENDCHECK))
  assert.ok(hasOption(packet.command, OPTION.READCHECK))
  assert.equal(packet.user, '测试用户')
  assert.equal(packet.host, 'PC-01')
  assert.equal(packet.text, '你好:world')
})

test('FeiQ private header roundtrips and declares the extra length', () => {
  const extra = 'hi'
  const declaredLength = encodeGbk(extra).length + 1
  const header = buildFeiqHeaderValue({ declaredLength, mac: '001122334455' })
  const buf = buildPacket({
    feiqHeader: header,
    packetNo: '1795120395',
    user: 'Tester',
    host: 'PC-TEST',
    command: COMMAND.ANSENTRY,
    extra,
  })
  const packet = parsePacket(buf)
  assert.ok(packet !== null)
  assert.equal(packet.header[1], String(declaredLength))
  assert.equal(packet.header[2], '001122334455')
  assert.equal(packet.text, 'hi')
  const named = parseFeiqHeader(packet.header)
  assert.equal(named.mac, '001122334455')
  assert.equal(named.declaredLength, String(declaredLength))
})

test('buildFeiqHeaderValue rejects a bogus length', () => {
  assert.throws(() => buildFeiqHeaderValue({ declaredLength: -1 }), TypeError)
  assert.throws(() => buildFeiqHeaderValue({}), TypeError)
})

test('nextPacketNo is monotonic and stays within int32', () => {
  const a = nextPacketNo()
  const b = nextPacketNo()
  assert.equal(b, a + 1)
  assert.ok(a > 0 && a < 2 ** 31)
})

test('mode and option helpers', () => {
  const command = COMMAND.SENDMSG | OPTION.SENDCHECK | OPTION.READCHECK
  assert.equal(modeOf(command), COMMAND.SENDMSG)
  assert.equal(flagsOf(command), 0x100100)
  assert.ok(hasOption(command, OPTION.SENDCHECK))
  assert.ok(!hasOption(command, OPTION.BROADCAST))
  assert.equal(modeName(command), 'SENDMSG')
  assert.equal(modeName(COMMAND.READMSG), 'READMSG')
})

// Captured from FeiQ 3.0.0.1 after a real knock (the window really shook).
const FEIQ_KNOCK_ACK =
  '1_lbt80_0#128#001122334455#0#0#0#4000#9:1795120407:Tester:PC-TEST:210:\0'

test('parses the 0xD2 knock ack a running FeiQ sends back', () => {
  const packet = parsePacket(latin1Buffer(FEIQ_KNOCK_ACK))
  assert.ok(packet !== null)
  assert.equal(packet.mode, COMMAND.KNOCK_ACK)
  assert.equal(packet.text, '')
})

test('builds a knock packet FeiQ acknowledges with 0xD2', () => {
  const buf = buildKnockPacket({ packetNo: 1795164971, user: 'DSH-TEST', host: 'DSH' })
  const packet = parsePacket(buf)
  assert.ok(packet !== null)
  assert.equal(packet.mode, COMMAND.KNOCK)
  assert.equal(packet.user, 'DSH-TEST')
  assert.equal(packet.text, '')
})

test('escapes ":" in name and host as 0x08 and restores it', () => {
  assert.equal(escapeField('a:b'), 'a\u0008b')
  assert.equal(unescapeField('a\u0008b'), 'a:b')
  const buf = buildPacket({ packetNo: 1, user: '甲:乙', host: 'PC:1', command: COMMAND.BR_ENTRY })
  const packet = parsePacket(buf)
  assert.ok(packet !== null)
  assert.equal(packet.user, '甲:乙')
  assert.equal(packet.host, 'PC:1')
})

test('builds and parses a file attachment list with a colon in the name', () => {
  const extra = buildFileAttachExtra(
    [{ fileId: 1, name: '报告:终稿.pdf', size: 500, mtime: 0x5f5e100, fileType: 1 }],
    { message: '给你' },
  )
  const packet = parsePacket(
    buildPacket({
      packetNo: 2,
      user: 'u',
      host: 'h',
      command: COMMAND.SENDMSG | OPTION.FILEATTACH,
      extraBuffer: extra,
    }),
  )
  assert.ok(packet !== null)
  assert.equal(packet.text, '给你')
  const files = parseFileList(packet.extra)
  assert.equal(files.length, 1)
  assert.equal(files[0].fileId, 1)
  assert.equal(files[0].name, '报告:终稿.pdf')
  assert.equal(files[0].size, 500)
  assert.equal(files[0].mtime, 0x5f5e100)
  assert.equal(files[0].fileType, 1)
})

test('builds a GETFILEDATA request with hex fields', () => {
  assert.equal(buildFileRequestExtra({ offerPacketNo: 100, fileId: 7, offset: 0 }), '64:7:0:')
  const packet = parsePacket(
    buildFileRequestPacket({ requestPacketNo: 3, offerPacketNo: 100, fileId: 7, user: 'u', host: 'h' }),
  )
  assert.ok(packet !== null)
  assert.equal(packet.mode, COMMAND.GETFILEDATA)
  assert.equal(packet.text, '64:7:0:')
})

test('each file entry ends with 0x07 so multiple files survive', () => {
  const extra = buildFileAttachExtra([
    { fileId: 1, name: 'a.txt', size: 1, mtime: 0, fileType: 1 },
    { fileId: 2, name: 'b.txt', size: 2, mtime: 0, fileType: 1 },
  ])
  assert.equal(parseFileList(extra).length, 2)
  assert.equal(
    buildFileEntry({ fileId: 9, name: 'x', size: 16, mtime: 0, fileType: 1 }).toString('latin1'),
    '9:x:10:0:1:',
  )
})
