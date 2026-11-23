import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Store } from '../src/host/store.js'
import { FeiqApp } from '../src/host/app.js'
import { COMMAND, buildPacket, parsePacket } from '../src/host/ipmsg.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function tempStore(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `feiq-${name}-`))
  return new Store(dir)
}

test('store round-trips state and message logs', () => {  const store = tempStore('store')
  store.ensure()
  assert.equal(store.loadState(), null)
  store.saveState({ settings: { nick: 'a' } })
  assert.deepEqual(store.loadState(), { settings: { nick: 'a' } })
  store.appendMessage('dm:a|b', { id: '1', text: '你好' })
  store.appendMessage('dm:a|b', { id: '2', text: '在吗' })
  const messages = store.readMessages('dm:a|b', 10)
  assert.equal(messages.length, 2)
  assert.equal(messages[1].text, '在吗')
  const file = store.saveImage('abc123', 'jpg', Buffer.from([1, 2, 3]))
  assert.ok(fs.existsSync(file))
})

test('two peers exchange text, delivery ack and read receipt over UDP', async () => {
  const appA = new FeiqApp({ config: { ipmsgPort: 25211, announceMs: 0, nick: 'A' }, store: tempStore('a') })
  const appB = new FeiqApp({ config: { ipmsgPort: 25212, announceMs: 0, nick: 'B' }, store: tempStore('b') })
  try {
    await appA.start()
    await appB.start()
    assert.equal(appA.status.listening, true)
    assert.equal(appB.status.listening, true)

    appA.injectPeer({ nick: 'B', host: appB.hostName, ip: '127.0.0.1', port: 25212 })
    appB.injectPeer({ nick: 'A', host: appA.hostName, ip: '127.0.0.1', port: 25211 })

    const keyB = `B@${appB.hostName}`
    const keyA = `A@${appA.hostName}`

    const sent = appA.sendText(keyB, '你好，飞秋')
    assert.equal(sent.status, 'sending')
    await sleep(300)
    assert.equal(sent.status, 'delivered', 'FeiQ answers RECVMSG for SENDCHECK messages')

    const received = appB.history(keyA, 10)
    assert.equal(received.length, 1)
    assert.equal(received[0].text, '你好，飞秋')
    assert.equal(received[0].dir, 'in')
    assert.equal(appB.snapshot().unreadTotal, 1)

    appB.markRead(keyA)
    await sleep(300)
    assert.equal(appB.convs.get(keyA).unread, 0)
    assert.equal(appA.history(keyB, 10)[0].status, 'read', 'READMSG upgrades the sender copy to read')
  } finally {
    appA.stop()
    appB.stop()
  }
})

test('knock reaches the peer and is acknowledged', async () => {
  const appA = new FeiqApp({ config: { ipmsgPort: 25221, announceMs: 0, nick: 'A' }, store: tempStore('ka') })
  const appB = new FeiqApp({ config: { ipmsgPort: 25222, announceMs: 0, nick: 'B' }, store: tempStore('kb') })
  try {
    await appA.start()
    await appB.start()
    appA.injectPeer({ nick: 'B', host: appB.hostName, ip: '127.0.0.1', port: 25222 })

    const knocks = []
    appB.on('knock', (event) => knocks.push(event))
    appA.sendKnock(`B@${appB.hostName}`)
    await sleep(300)
    assert.equal(knocks.length, 1)
    assert.equal(knocks[0].nick, 'A')
  } finally {
    appA.stop()
    appB.stop()
  }
})

test('image send exposes chunk progress and can be canceled', async () => {
  const app = new FeiqApp({ config: { ipmsgPort: 25261, announceMs: 0, nick: 'A' }, store: tempStore('progress') })
  try {
    await app.start()
    app.injectPeer({ nick: 'B', host: 'B-PC', ip: '127.0.0.1', port: 25262 })
    const message = app.sendImage('B@B-PC', Buffer.alloc(1200, 7))
    assert.equal(message.status, 'sending')
    assert.equal(message.progress.total, 3)
    assert.equal(message.progress.done, 0)
    app.cancel('B@B-PC', message.id)
    assert.equal(message.status, 'canceled')
  } finally {
    app.stop()
  }
})

test('avatar profile packets are exchanged between plugin peers', () => {
  const app = new FeiqApp({ config: { nick: 'A' }, store: tempStore('avatar') })
  const packet = buildPacket({
    feiqHeader: '1',
    packetNo: '1',
    user: 'B',
    host: 'B-PC',
    command: 0xe1,
    extra: 'avatar:fish-2',
  })
  app.handlePacket(packet, { address: '127.0.0.1', port: 25262 })
  assert.equal(app.peers.get('B@B-PC').avatar, 'fish-2')
  assert.equal(app.snapshot().peers[0].avatar, 'fish-2')

  app.setSettings({ avatar: 'fish-3' })
  assert.equal(app.avatar, 'fish-3')
  assert.equal(app.snapshot().self.avatar, 'fish-3')
})

test('TCP file serving accepts a FeiQ-style request without a trailing NUL', async () => {
  const app = new FeiqApp({
    config: { ipmsgPort: 25281, announceMs: 0, nick: 'A' },
    store: tempStore('tcp-nul'),
  })
  try {
    await app.start()
    app.injectPeer({ nick: 'B', host: 'B-PC', ip: '127.0.0.1', port: 25282 })
    const message = app.sendFile('B@B-PC', 'x.txt', Buffer.from('hello world'))
    const received = await new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port: 25281 }, () => {
        const hex = (value) => Number(value).toString(16)
        socket.write(`${hex(message.file.packetNo)}:${hex(message.file.fileId)}:0:`)
      })
      const chunks = []
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('end', () => resolve(Buffer.concat(chunks).toString()))
      socket.on('error', reject)
      setTimeout(() => reject(new Error('file serving timed out')), 3000)
    })
    assert.equal(received, 'hello world')
  } finally {
    app.stop()
  }
})

test('exportFile copies a received file into Downloads', () => {
  const store = tempStore('export')
  store.ensure()
  const app = new FeiqApp({ config: { nick: 'A' }, store })
  const source = path.join(store.filesDir, 'export-src.jar')
  fs.writeFileSync(source, 'abc')
  app.filePaths.set('export-1', source)
  let target = null
  try {
    target = app.exportFile('export-1', 'dsh-feiq-export-test.jar')
    assert.ok(target.includes('Downloads'))
    assert.equal(fs.readFileSync(target, 'utf8'), 'abc')
  } finally {
    if (target && fs.existsSync(target)) fs.unlinkSync(target)
  }
})

test('read receipts never overwrite a pending file offer', () => {
  const store = tempStore('file-offer')
  store.ensure()
  store.appendMessage('B@B-PC', {
    id: 'f1',
    convId: 'B@B-PC',
    peerKey: 'B@B-PC',
    dir: 'in',
    kind: 'file',
    file: { name: 'x.bin', size: 3, fileId: 0, packetNo: '9', ip: '127.0.0.1', port: 2425 },
    ts: Date.now(),
    status: 'offered',
  })
  const app = new FeiqApp({ config: { nick: 'A' }, store })
  app.ensureLoaded('B@B-PC')
  app.markRead('B@B-PC')
  assert.equal(app.messages.get('B@B-PC')[0].status, 'offered')
})

test('legacy file offers marked as read are repaired on load', () => {
  const store = tempStore('file-legacy')
  store.ensure()
  store.appendMessage('B@B-PC', {
    id: 'f2',
    convId: 'B@B-PC',
    peerKey: 'B@B-PC',
    dir: 'in',
    kind: 'file',
    file: { name: 'x.bin', size: 3, fileId: 0, packetNo: '9', ip: '127.0.0.1', port: 2425 },
    ts: Date.now(),
    status: 'read',
  })
  const app = new FeiqApp({ config: { nick: 'A' }, store })
  app.ensureLoaded('B@B-PC')
  assert.equal(app.messages.get('B@B-PC')[0].status, 'offered')
})

test('persisted receipt status overrides a stored "sending" record', () => {
  const store = tempStore('status')
  store.ensure()
  store.appendMessage('A@PC', {
    id: 'm1',
    convId: 'A@PC',
    dir: 'out',
    kind: 'text',
    text: 'hi',
    status: 'sending',
    ts: Date.now(),
  })
  store.saveState({ settings: { nick: 'B' }, statuses: { m1: { status: 'delivered', deliveredAt: 123 } } })
  const app = new FeiqApp({ config: { nick: 'B' }, store })
  app.restore()
  app.convs.set('A@PC', { key: 'A@PC', unread: 0, lastAt: 0 })
  app.ensureLoaded('A@PC')
  const message = app.messages.get('A@PC')[0]
  assert.equal(message.status, 'delivered')
  assert.equal(message.deliveredAt, 123)
})

test('BR_ENTRY carries the nickname in the extra field FeiQ displays', () => {
  const app = new FeiqApp({ config: { nick: '测试员' }, store: tempStore('entry') })
  const packet = parsePacket(app.entryPacket(), { keepTrailingNuls: true })
  assert.ok(packet !== null)
  assert.equal(packet.mode, COMMAND.BR_ENTRY)
  assert.equal(packet.user, '测试员')
  assert.equal(packet.text, '测试员', 'FeiQ reads the display name from the extra field')
})

test('file offer is received and the body can be pulled over TCP', async () => {
  const appA = new FeiqApp({ config: { ipmsgPort: 25231, announceMs: 0, nick: 'A' }, store: tempStore('fa') })
  const appB = new FeiqApp({ config: { ipmsgPort: 25232, announceMs: 0, nick: 'B' }, store: tempStore('fb') })
  try {
    await appA.start()
    await appB.start()
    appA.injectPeer({ nick: 'B', host: appB.hostName, ip: '127.0.0.1', port: 25232 })
    appB.injectPeer({ nick: 'A', host: appA.hostName, ip: '127.0.0.1', port: 25231 })
    const keyA = `A@${appA.hostName}`
    const keyB = `B@${appB.hostName}`
    const payload = Buffer.from('hello file transfer over TCP', 'utf8')

    const sent = appA.sendFile(keyB, 'note.txt', payload)
    await sleep(300)
    const offered = appB.history(keyA, 10).find((message) => message.kind === 'file')
    assert.ok(offered, 'peer receives the FILEATTACH offer')
    assert.equal(offered.file.name, 'note.txt')
    assert.equal(offered.file.size, payload.length)
    assert.equal(offered.status, 'offered')

    appB.acceptFile(keyA, offered.id)
    await sleep(600)
    const received = appB.history(keyA, 10).find((message) => message.id === offered.id)
    assert.equal(received.status, 'received')
    assert.ok(received.file.path)
    assert.deepEqual(fs.readFileSync(received.file.path), payload)
    assert.equal(sent.kind, 'file')
  } finally {
    appA.stop()
    appB.stop()
  }
})
