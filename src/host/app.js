/**
 * FeiQ-compatible IM engine: presence, text, knock, image transfer and read
 * receipts over IPMsg UDP 2425. Transport-agnostic enough to be driven by the
 * DSH Web routes and by tests (handlePacket is public).
 */
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  COMMAND,
  OPTION,
  buildFileAttachExtra,
  buildFileRequestPacket,
  buildPacket,
  parseFileList,
  parsePacket,
} from './ipmsg.js'
import { ImageReceiver, ImageSender, buildImageChunks, newImageId, parseImageExtra } from './feiq-image.js'
import { Store, resolveDataDir } from './store.js'
import { bindUdp, broadcastAddresses, listenTcp, primaryAddress, primaryMac } from './net.js'

const ACK_TIMEOUT_MS = 8000
const MAX_MESSAGES = 300
const IMAGE_MARKER = /^\/~#>([0-9a-fA-F]{1,16})<B~/

/** FeiQ image placeholders: `/~#><id><B~{/font;...}` or just the formatting tail. */
function isImagePlaceholder(text) {
  return (
    typeof text === 'string' &&
    (text.includes('/~#>') || /^\s*\.{2,}\{/.test(text) || /^\{?\/font;/.test(text))
  )
}

export class FeiqApp extends EventEmitter {
  constructor({ config = {}, store, log = () => {} } = {}) {
    super()
    this.config = config
    this.log = log
    this.store = store ?? new Store(resolveDataDir(config))
    this.port = Number(config.ipmsgPort ?? 2425)
    this.nick = String(config.nick || '') || os.hostname() || 'DSH'
    this.avatar = String(config.avatar || 'initial')
    this.hostName = os.hostname() || 'DSH'
    this.mac = String(config.mac || primaryMac())
    this.localIp = primaryAddress()
    this.ver = `1_lbt6_0#128#${this.mac}#0#0#0#4000#9`
    this.announceMs = Number(config.announceMs ?? 10_000)
    this.rosterTtlMs = Number(config.rosterTtlMs ?? 30_000)

    this.peers = new Map()
    this.convs = new Map()
    this.messages = new Map()
    this.byPacketNo = new Map()
    this.statuses = new Map()
    this.seq = new Map()
    this.debugFile = this.store?.dir ? path.join(this.store.dir, 'debug.log') : null
    this.pendingImages = new Map()
    this.receiver = new ImageReceiver()
    this.imageSenders = new Map()
    this.transfers = new Map()
    this.servedFiles = new Map()
    this.filePaths = new Map()
    this.fileSeq = 1
    this.tcpServer = null
    this.packetNo = 1000
    this.socket = null
    this.timers = new Set()
    this.intervals = new Set()
    this.stateScheduled = false
    this.status = { listening: false, error: null, port: this.port, owner: null }
  }

  /* ------------------------------------------------------------------ */
  /* lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  async start() {
    this.debug('start port=' + this.port + ' nick=' + this.nick + ' avatar=' + this.avatar)
    this.store.ensure()
    this.restore()
    try {
      this.socket = await bindUdp({ port: this.port })
    } catch (error) {
      this.status = { listening: false, error: error?.code ?? String(error), port: this.port, owner: null }
      this.emit('status', this.status)
      return this.status
    }
    this.socket.on('message', (buffer, rinfo) => {
      try {
        this.handlePacket(buffer, rinfo)
      } catch (error) {
        this.log('packet error: ' + (error?.message ?? error))
      }
    })
    this.status = { listening: true, error: null, port: this.port, owner: null }
    try {
      this.tcpServer = await listenTcp({ port: this.port, onConnection: (socket) => this.onTcp(socket) })
    } catch (error) {
      this.tcpServer = null
      this.log('tcp file service unavailable: ' + (error?.code ?? error))
    }
    this.status = {
      listening: true,
      error: null,
      port: this.port,
      owner: null,
      fileService: Boolean(this.tcpServer),
    }
    this.emit('status', this.status)

    if (this.announceMs > 0) {
      this.announce()
      this.setInterval(() => this.announce(), this.announceMs)
    }
    this.setInterval(() => this.prune(), Math.max(5000, Math.floor(this.rosterTtlMs / 2)))
    return this.status
  }

  stop() {
    for (const transfer of this.transfers.values()) {
      try {
        transfer.stop()
      } catch {
        /* ignore */
      }
    }
    this.transfers.clear()
    if (this.socket) {
      try {
        this.send(
          buildPacket({
            feiqHeader: this.ver,
            packetNo: Math.floor(Date.now() / 1000),
            user: this.nick,
            host: this.hostName,
            command: COMMAND.BR_EXIT,
            extra: '',
          }),
          { address: '255.255.255.255', port: this.port },
        )
      } catch {
        /* best effort */
      }
    }
    for (const timer of this.timers) clearTimeout(timer)
    for (const interval of this.intervals) clearInterval(interval)
    this.timers.clear()
    this.intervals.clear()
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        /* ignore */
      }
      this.socket = null
    }
    if (this.tcpServer) {
      try {
        this.tcpServer.close()
      } catch {
        /* ignore */
      }
      this.tcpServer = null
    }
    this.persist(true)
  }

  setInterval(fn, ms) {
    const id = setInterval(fn, ms)
    this.intervals.add(id)
    return id
  }

  setTimeout(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id)
      fn()
    }, ms)
    this.timers.add(id)
    return id
  }

  restore() {
    const saved = this.store.loadState()
    if (!saved) return
    if (saved.settings?.nick && !this.config.nick) this.nick = saved.settings.nick
    if (saved.settings?.avatar) this.avatar = saved.settings.avatar
    for (const peer of saved.peers ?? []) {
      if (peer?.key) this.peers.set(peer.key, { ...peer, online: false, lastSeen: 0 })
    }
    for (const conv of saved.convs ?? []) {
      if (conv?.key) this.convs.set(conv.key, { unread: 0, lastAt: 0, ...conv })
    }
    for (const [key, value] of Object.entries(saved.seq ?? {})) this.seq.set(key, Number(value) || 0)
    for (const [id, patch] of Object.entries(saved.statuses ?? {})) {
      if (patch && typeof patch === 'object') this.statuses.set(id, patch)
    }
  }

  persist(immediate = false) {
    if (this.persistTimer && !immediate) return
    const write = () => {
      this.persistTimer = null
      this.store.saveState({
        settings: { nick: this.nick, avatar: this.avatar },
        peers: [...this.peers.values()],
        convs: [...this.convs.values()],
        seq: Object.fromEntries(this.seq),
        statuses: Object.fromEntries([...this.statuses].slice(-1500)),
      })
    }
    if (immediate) return write()
    this.persistTimer = setTimeout(write, 1000)
    this.timers.add(this.persistTimer)
  }

  /* ------------------------------------------------------------------ */
  /* wire                                                                */
  /* ------------------------------------------------------------------ */

  /** FeiQ takes the display nickname from the packet extra, not from `user`. */
  entryPacket() {
    return buildPacket({
      feiqHeader: this.ver,
      packetNo: Math.floor(Date.now() / 1000),
      user: this.nick,
      host: this.hostName,
      command: COMMAND.BR_ENTRY,
      extra: this.nick,
    })
  }

  announce() {
    if (!this.socket) return
    const packet = this.entryPacket()
    const profile = buildPacket({
      feiqHeader: this.ver,
      packetNo: String(++this.packetNo),
      user: this.nick,
      host: this.hostName,
      command: 0xe1,
      extra: 'avatar:' + this.avatar,
    })
    for (const address of broadcastAddresses()) {
      this.send(packet, { address, port: this.port })
      this.send(profile, { address, port: this.port })
    }
  }

  /** Private extension: tell peers our avatar, ignored by FeiQ. */
  sendProfile(target) {
    if (!this.socket) return
    this.send(
      buildPacket({
        feiqHeader: this.ver,
        packetNo: String(++this.packetNo),
        user: this.nick,
        host: this.hostName,
        command: 0xe1,
        extra: 'avatar:' + this.avatar,
      }),
      target,
    )
  }

  send(buffer, target) {
    const address = target?.address ?? target?.ip
    if (!this.socket || !address) return
    this.socket.send(buffer, target.port || this.port, address, () => {})
  }

  sendPacketToPeer(buffer, peerKey) {
    const peer = this.peers.get(peerKey)
    if (peer) this.send(buffer, peer)
  }

  handlePacket(buffer, rinfo) {
    const packet = parsePacket(buffer, { keepTrailingNuls: true })
    if (!packet) {
      this.debug('udp parse fail len=' + buffer.length + ' from=' + rinfo.address + ' head=' + buffer.subarray(0, 96).toString('hex'))
      return
    }
    const selfHeader = packet.header?.[2]
    if (packet.user === this.nick && selfHeader && selfHeader.toUpperCase() === this.mac.toUpperCase()) return

    const mode = packet.mode
    const knownModes = new Set([
      COMMAND.BR_ENTRY,
      COMMAND.ANSENTRY,
      COMMAND.BR_EXIT,
      COMMAND.SENDMSG,
      COMMAND.RECVMSG,
      COMMAND.READMSG,
      COMMAND.SENDIMAGE,
      COMMAND.KNOCK,
      0xd2,
      0xc1,
      0xe1,
    ])
    if (!knownModes.has(mode) || mode === COMMAND.GETFILEDATA) {
      this.debug(
        'udp cmd=0x' + mode.toString(16) + ' len=' + buffer.length + ' from=' + rinfo.address + ' text=' + JSON.stringify(packet.text).slice(0, 100),
      )
    }
    if (mode === COMMAND.BR_ENTRY || mode === COMMAND.ANSENTRY) {
      this.upsertPeer(packet, rinfo)
      if (mode === COMMAND.BR_ENTRY) {
        this.send(
          buildPacket({
            feiqHeader: this.ver,
            packetNo: Math.floor(Date.now() / 1000),
            user: this.nick,
            host: this.hostName,
            command: COMMAND.ANSENTRY,
            extra: this.nick,
          }),
          rinfo,
        )
      }
      this.sendProfile(rinfo)
      return
    }
    if (mode === COMMAND.BR_EXIT) {
      const peer = this.peers.get(this.peerKey(packet))
      if (peer) {
        peer.online = false
        peer.lastSeen = 0
        this.scheduleState()
        this.persist()
      }
      return
    }
    if (mode === COMMAND.SENDMSG) {
      this.debug(
        'sendmsg from=' +
          rinfo.address +
          ' user=' +
          JSON.stringify(packet.user) +
          ' cmd=0x' +
          packet.command.toString(16) +
          ' len=' +
          (typeof packet.text === 'string' ? packet.text.length : -1),
      )
      return this.onSendMsg(packet, rinfo)
    }
    if (mode === COMMAND.RECVMSG) return this.onReceipt(packet, 'delivered')
    if (mode === COMMAND.READMSG) return this.onReceipt(packet, 'read')
    if (mode === 0xe1) {
      const match = /^avatar:([a-z0-9-]{1,24})$/i.exec(packet.text)
      const peer = this.upsertPeer(packet, rinfo)
      if (match && peer.avatar !== match[1]) {
        peer.avatar = match[1]
        this.scheduleState()
        this.persist()
      }
      return
    }
    if (mode === COMMAND.KNOCK) {
      this.emit('knock', { peerKey: this.peerKey(packet), nick: packet.user })
      this.send(
        buildPacket({
          feiqHeader: this.ver,
          packetNo: String(++this.packetNo),
          user: this.nick,
          host: this.hostName,
          command: COMMAND.KNOCK_ACK,
          extra: '',
        }),
        rinfo,
      )
      return
    }
    if (mode === COMMAND.SENDIMAGE) return this.onImageChunk(packet, rinfo)
    if (mode === 0xc1) return this.onImageAck(packet)
    if (mode === COMMAND.GETPUBKEY) return // never advertise a key: keeps the session plaintext
  }

  peerKey(packet) {
    return `${packet.user}@${packet.host}`
  }

  /** Register a peer manually (tests, "send to IP", and cross-subnet adds). */
  injectPeer({ nick, host, ip, port }) {
    const key = `${nick}@${host}`
    const peer = { key, nick, host, ip, port: port || this.port, lastSeen: Date.now(), online: true }
    this.peers.set(key, peer)
    if (!this.convs.has(key)) this.convs.set(key, { key, unread: 0, lastAt: 0 })
    this.scheduleState()
    return peer
  }

  upsertPeer(packet, rinfo) {
    const key = this.peerKey(packet)
    const now = Date.now()
    let peer = this.peers.get(key)
    if (!peer) {
      peer = { key, nick: packet.user, host: packet.host, ip: rinfo.address, port: rinfo.port, lastSeen: now, online: true }
      this.peers.set(key, peer)
    }
    peer.ip = rinfo.address
    peer.port = rinfo.port || this.port
    peer.nick = packet.user
    peer.host = packet.host
    peer.ver = String(packet.header?.[0] ?? packet.ver ?? '')
    peer.kind = /_lbt\d/i.test(peer.ver) ? 'feiq' : 'plugin'
    peer.lastSeen = now
    peer.online = true
    // FeiQ puts the display nickname in the extra of ANSENTRY / BR_ENTRY
    // (`user` is only the Windows account name).
    const display = typeof packet.text === 'string' ? packet.text.trim() : ''
    if (display && display.length <= 64 && !/[\u0000-\u001f]/.test(display)) {
      peer.displayName = display
    }
    if (!this.convs.has(key)) this.convs.set(key, { key, unread: 0, lastAt: 0 })
    this.scheduleState()
    this.persist()
    return peer
  }

  prune() {
    const now = Date.now()
    let changed = false
    for (const peer of this.peers.values()) {
      if (peer.online && now - (peer.lastSeen || 0) > this.rosterTtlMs) {
        peer.online = false
        changed = true
      }
    }
    for (const [id, pending] of this.pendingImages) {
      if (now - (pending.at || 0) > 5 * 60_000) this.pendingImages.delete(id)
    }
    this.receiver.sweep(60_000)
    for (const [key, info] of this.servedFiles) {
      if (now - (info.at || 0) > 24 * 3600_000) this.servedFiles.delete(key)
    }
    while (this.servedFiles.size > 300) this.servedFiles.delete(this.servedFiles.keys().next().value)
    while (this.filePaths.size > 800) this.filePaths.delete(this.filePaths.keys().next().value)
    while (this.byPacketNo.size > 500) this.byPacketNo.delete(this.byPacketNo.keys().next().value)
    if (changed) this.scheduleState()
  }

  debug(message) {
    if (!this.debugFile) return
    try {
      const stat = fs.statSync(this.debugFile)
      if (stat.size > 1_000_000) fs.writeFileSync(this.debugFile, '')
    } catch {
      /* no file yet */
    }
    try {
      fs.appendFileSync(this.debugFile, new Date().toISOString() + ' ' + message + '\n')
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------ */
  /* text                                                                */
  /* ------------------------------------------------------------------ */

  ackReceive(rinfo, packetNo) {
    this.send(
      buildPacket({
        feiqHeader: this.ver,
        packetNo: String(++this.packetNo),
        user: this.nick,
        host: this.hostName,
        command: COMMAND.RECVMSG,
        extra: String(packetNo),
      }),
      rinfo,
    )
  }

  onSendMsg(packet, rinfo) {
    const key = this.peerKey(packet)
    this.upsertPeer(packet, rinfo)

    if ((packet.command & OPTION.FILEATTACH) === OPTION.FILEATTACH && packet.extra.includes(0)) {
      const files = parseFileList(packet.extra)
      this.debug('incoming file offer from=' + rinfo.address + ' files=' + JSON.stringify(files))
      if (files.length > 0) {
        for (const file of files) {
          const message = {
            id: randomUUID(),
            convId: key,
            peerKey: key,
            dir: 'in',
            kind: 'file',
            file: { ...file, packetNo: packet.packetNo, ip: rinfo.address, port: rinfo.port || this.port },
            ts: Date.now(),
            status: 'offered',
          }
          this.pushMessage(message)
          const conv = this.convs.get(key)
          if (conv) conv.unread = (conv.unread || 0) + 1
        }
        this.scheduleState()
        if (packet.command & OPTION.SENDCHECK) this.ackReceive(rinfo, packet.packetNo)
        return
      }
    }

    // Image placeholder: `/~#><id><B~{/font;...}`. Some FeiQ builds send only
    // the formatting tail (`...{/font;...}`), so treat both as an image marker
    // and never render them as text.
    const text = packet.text
    if (isImagePlaceholder(text)) {
      const marker = /\/~#>([0-9a-fA-F]{1,16})<B~/.exec(text)
      if (marker) this.pendingImages.set(marker[1].toLowerCase(), { peerKey: key, at: Date.now() })
      this.scheduleState()
      return
    }
    if (text === '') return
    const message = {
      id: randomUUID(),
      convId: key,
      peerKey: key,
      dir: 'in',
      kind: 'text',
      text: packet.text,
      packetNo: packet.packetNo,
      ts: Date.now(),
      status: 'unread',
    }
    this.pushMessage(message)
    const conv = this.convs.get(key)
    if (conv) conv.unread = (conv.unread || 0) + 1
    this.scheduleState()
    if (packet.command & OPTION.SENDCHECK) this.ackReceive(rinfo, packet.packetNo)
  }

  onReceipt(packet, status) {
    const id = String(packet.text).trim()
    const message = this.byPacketNo.get(id) ?? this.findByPacketNo(id)
    if (!message) return
    if (message.status === 'read') return
    message.status = status
    if (status === 'read') message.readAt = Date.now()
    if (status === 'delivered') message.deliveredAt = Date.now()
    this.byPacketNo.delete(id)
    this.rememberStatus(message)
    this.emit('message', message)
    this.scheduleState()
    this.persist()
  }

  /** Receipts may arrive after a reload; fall back to the persisted history. */
  findByPacketNo(packetNo) {
    const wanted = String(packetNo)
    for (const convId of this.convs.keys()) {
      this.ensureLoaded(convId)
      const found = (this.messages.get(convId) ?? []).find(
        (message) => message.dir === 'out' && String(message.packetNo) === wanted,
      )
      if (found) return found
    }
    return null
  }

  rememberStatus(message) {
    if (message.dir !== 'out') return
    this.statuses.set(message.id, {
      status: message.status,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
    })
    if (this.statuses.size > 2000) {
      const drop = this.statuses.size - 1500
      let index = 0
      for (const key of this.statuses.keys()) {
        if (index++ >= drop) break
        this.statuses.delete(key)
      }
    }
  }

  sendText(peerKey, text) {
    const peer = this.peers.get(peerKey)
    if (!peer) throw new Error('unknown peer')
    const conv = this.convs.get(peerKey) ?? { key: peerKey, unread: 0, lastAt: 0 }
    this.convs.set(peerKey, conv)
    const seq = (this.seq.get(peerKey) ?? 0) + 1
    this.seq.set(peerKey, seq)
    const packetNo = String(++this.packetNo)
    const message = {
      id: randomUUID(),
      convId: peerKey,
      peerKey,
      dir: 'out',
      kind: 'text',
      text,
      seq,
      packetNo,
      ts: Date.now(),
      status: 'sending',
    }
    this.pushMessage(message)
    this.byPacketNo.set(packetNo, message)
    this.send(
      buildPacket({
        feiqHeader: this.ver,
        packetNo,
        user: this.nick,
        host: this.hostName,
        command: COMMAND.SENDMSG | OPTION.SENDCHECK,
        extra: text,
      }),
      peer,
    )
    this.setTimeout(() => {
      if (message.status === 'sending') {
        message.status = 'failed'
        this.rememberStatus(message)
        this.emit('message', message)
        this.scheduleState()
        this.persist()
      }
    }, ACK_TIMEOUT_MS)
    return message
  }

  sendKnock(peerKey) {
    const peer = this.peers.get(peerKey)
    if (!peer) throw new Error('unknown peer')
    this.send(
      buildPacket({
        feiqHeader: this.ver,
        packetNo: String(++this.packetNo),
        user: this.nick,
        host: this.hostName,
        command: COMMAND.KNOCK,
        extra: '',
      }),
      peer,
    )
    return true
  }

  sendImage(peerKey, buffer, { code = 2 } = {}) {
    if (!this.peers.get(peerKey)) throw new Error('unknown peer')
    const message = {
      id: randomUUID(),
      convId: peerKey,
      peerKey,
      dir: 'out',
      kind: 'image',
      image: { id: '', ext: code === 2 ? 'jpg' : 'bin', size: buffer.length, file: null },
      progress: { done: 0, total: 0 },
      ts: Date.now(),
      status: 'sending',
    }
    try {
      message.image.file = this.store.saveImage(message.id, message.image.ext, buffer)
    } catch {
      message.image.file = null
    }
    this.pushMessage(message)
    this.deliverImage(message, buffer, code)
    return message
  }

  deliverImage(message, buffer, code = 2) {
    const peer = this.peers.get(message.peerKey)
    if (!peer) {
      message.status = 'failed'
      this.emit('message', message)
      return
    }
    const id = newImageId()
    message.image.id = id
    message.image.size = buffer.length
    message.image.ext = code === 2 ? 'jpg' : 'bin'
    message.status = 'sending'
    const chunks = buildImageChunks({
      data: buffer,
      id,
      code,
      user: this.nick,
      host: this.hostName,
      feiqHeader: this.ver,
      packetNo: () => String(++this.packetNo),
    })
    message.progress = { done: 0, total: chunks.length }
    this.emit('message', message)
    this.send(
      buildPacket({
        feiqHeader: this.ver,
        packetNo: String(++this.packetNo),
        user: this.nick,
        host: this.hostName,
        command: COMMAND.SENDMSG | OPTION.SENDCHECK,
        extra: `/~#>${id}<B~{/font;-16 0 0 0 400 0 0 0 134 0 0 2 32 微软雅黑 8404992;}`,
      }),
      peer,
    )
    const sender = new ImageSender({ chunks, retryMs: 800, maxTries: 10 })
    this.imageSenders.set(id, sender)
    for (const chunk of chunks) {
      this.send(chunk.packet, peer)
      sender.markSent(chunk.index)
    }
    const finish = (status) => {
      clearInterval(timer)
      this.intervals.delete(timer)
      this.imageSenders.delete(id)
      this.transfers.delete(message.id)
      if (message.status === status) return
      message.status = status
      if (status === 'delivered') message.deliveredAt = Date.now()
      this.rememberStatus(message)
      this.emit('message', message)
      this.scheduleState()
      this.persist()
    }
    const timer = this.setInterval(() => {
      for (const chunk of sender.retryList()) {
        this.send(chunk.packet, peer)
        sender.markSent(chunk.index)
      }
      const done = sender.ackCount()
      if (!message.progress || message.progress.done !== done) {
        message.progress = { done, total: sender.total() }
        this.emit('message', message)
      }
      if (!sender.isDone()) return
      finish('delivered')
    }, 250)
    this.transfers.set(message.id, {
      kind: 'image',
      stop: () => finish('canceled'),
    })
    this.setTimeout(() => {
      if (message.status === 'sending') finish('failed')
    }, 20_000)
  }

  /* ------------------------------------------------------------------ */
  /* images                                                              */
  /* ------------------------------------------------------------------ */

  onImageChunk(packet, rinfo) {
    const parsed = parseImageExtra(packet.extra)
    if (!parsed) return
    this.receiver.accept(packet.extra)
    this.send(
      buildPacket({
        feiqHeader: this.ver,
        packetNo: String(++this.packetNo),
        user: this.nick,
        host: this.hostName,
        command: 0xc1,
        extra: `${parsed.id}|${parsed.index}#`,
      }),
      rinfo,
    )
    const missing = this.receiver.missing(parsed.id)
    if (missing.length !== 0) return
    const image = this.receiver.take(parsed.id)
    if (!image) return
    const pending = this.pendingImages.get(parsed.id)
    this.pendingImages.delete(parsed.id)
    const ext = image.code === 2 ? 'jpg' : 'bin'
    let file = null
    try {
      file = this.store.saveImage(image.id, ext, image.data)
    } catch {
      file = null
    }
    const key = pending?.peerKey ?? this.peerKey(packet)
    const message = {
      id: randomUUID(),
      convId: key,
      peerKey: key,
      dir: 'in',
      kind: 'image',
      image: { id: image.id, ext, size: image.data.length, file },
      packetNo: packet.packetNo,
      ts: Date.now(),
      status: 'unread',
    }
    this.pushMessage(message)
    const conv = this.convs.get(key)
    if (conv) conv.unread = (conv.unread || 0) + 1
    this.scheduleState()
  }

  onImageAck(packet) {
    const [id, index] = String(packet.text).replace('#', '').split('|')
    const sender = this.imageSenders?.get(id)
    if (!sender) return
    sender.ack(Number(index))
  }

  /* ------------------------------------------------------------------ */
  /* files                                                               */
  /* ------------------------------------------------------------------ */

  /** TCP peer asking for a file we offered: GETFILEDATA (hex fields) + raw body. */
  onTcp(socket) {
    this.debug('tcp connect from=' + socket.remoteAddress)
    let buffer = Buffer.alloc(0)
    let started = false
    const fail = () => {
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
    }
    socket.setTimeout(15000, fail)
    socket.on('error', fail)
    socket.on('data', (chunk) => {
      if (started) return
      buffer = Buffer.concat([buffer, chunk])
      this.debug('tcp ' + socket.remoteAddress + ' got=' + chunk.length + ' head=' + buffer.subarray(0, Math.min(buffer.length, 120)).toString('hex'))
      if (buffer.length > 64 * 1024) return fail()
      // FeiQ's TCP GETFILEDATA request has no trailing NUL, unlike UDP
      // packets. Wait until it looks like a complete `packetNo:fileId:offset:`
      // triple (or a NUL-terminated standard packet arrives).
      const nul = buffer.indexOf(0)
      const raw = nul >= 0 ? buffer.subarray(0, nul) : buffer
      if (nul < 0) {
        const text = raw.toString('latin1')
        const fields = text.split(':')
        if (!(text.endsWith(':') && fields.length >= 4)) return
      }
      started = true
      const packet = parsePacket(Buffer.concat([raw, Buffer.from([0])]), { keepTrailingNuls: true })
      let text = packet ? String(packet.text) : raw.toString('latin1')
      text = text.replace(/#.*$/, '').replace(/\0+$/, '')
      const parts = text.split(':').filter((part) => part.length > 0)
      if (parts.length < 2) return fail()
      const toKey = (a, b) => `${Number.parseInt(a, 16)}:${Number.parseInt(b, 16)}`
      let key = toKey(parts[0], parts[1])
      let info = this.servedFiles.get(key)
      if (!info) {
        // Tolerate clients that write the three fields in decimal.
        key = `${Number.parseInt(parts[0], 10)}:${Number.parseInt(parts[1], 10)}`
        info = this.servedFiles.get(key)
      }
      this.debug(
        'tcp request cmd=' +
          (packet ? '0x' + packet.command.toString(16) : 'raw') +
          ' text=' +
          JSON.stringify(text) +
          ' key=' +
          key +
          ' served=' +
          JSON.stringify([...this.servedFiles.keys()]),
      )
      if (!info) return fail()
      const start = Math.max(0, Number.parseInt(parts[2] ?? '0', 16) || 0)
      socket.setTimeout(0)
      const stream = fs.createReadStream(info.path, { start })
      stream.on('error', fail)
      stream.pipe(socket)
    })
  }

  fileExtension(name) {
    const ext = path.extname(String(name ?? '')).replace('.', '')
    const safe = ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8)
    return safe || 'bin'
  }

  sendFile(peerKey, name, data) {
    const peer = this.peers.get(peerKey)
    if (!peer) throw new Error('unknown peer')
    const id = randomUUID()
    const fileId = this.fileSeq++
    const packetNo = String(++this.packetNo)
    const safeName = String(name || 'file.bin').slice(0, 128)
    const filePath = this.store.saveImage(id, this.fileExtension(safeName), data)
    this.servedFiles.set(`${packetNo}:${fileId}`, { path: filePath, size: data.length, at: Date.now() })
    this.filePaths.set(id, filePath)
    const extra = buildFileAttachExtra(
      [{ fileId, name: safeName, size: data.length, mtime: Math.floor(Date.now() / 1000), fileType: 1 }],
      { message: '' },
    )
    this.debug('offer pkt=' + packetNo + ' fileId=' + fileId + ' size=' + data.length + ' extra=' + extra.toString('hex').slice(0, 240))
    const message = {
      id,
      convId: peerKey,
      peerKey,
      dir: 'out',
      kind: 'file',
      file: { name: safeName, size: data.length, fileId, path: filePath, packetNo },
      ts: Date.now(),
      status: 'sending',
    }
    this.pushMessage(message)
    this.byPacketNo.set(packetNo, message)
    this.send(
      buildPacket({
        feiqHeader: this.ver,
        packetNo,
        user: this.nick,
        host: this.hostName,
        command: COMMAND.SENDMSG | OPTION.FILEATTACH | OPTION.SENDCHECK,
        extraBuffer: extra,
      }),
      peer,
    )
    this.setTimeout(() => {
      if (message.status === 'sending') {
        message.status = 'failed'
        this.rememberStatus(message)
        this.emit('message', message)
        this.scheduleState()
        this.persist()
      }
    }, ACK_TIMEOUT_MS)
    return message
  }

  acceptFile(convId, messageId) {
    this.ensureLoaded(convId)
    const message = (this.messages.get(convId) ?? []).find((item) => item.id === messageId)
    if (!message || message.kind !== 'file') return null
    if (message.status === 'received' || message.status === 'receiving') return message
    const file = message.file
    const peer = this.peers.get(message.peerKey)
    const host = file.ip || peer?.ip
    const port = file.port || peer?.port || this.port
    if (!host) return null
    this.debug('acceptFile host=' + host + ':' + port + ' offer=' + file.packetNo + ' fileId=' + file.fileId + ' size=' + file.size)
    message.status = 'receiving'
    message.progress = { done: 0, total: file.size }
    this.emit('message', message)
    const chunks = []
    let received = 0
    const socket = net.connect({ host, port })
    const request = buildFileRequestPacket({
      requestPacketNo: String(++this.packetNo),
      offerPacketNo: file.packetNo,
      fileId: file.fileId,
      offset: 0,
      user: this.nick,
      host: this.hostName,
    })
    socket.write(request)
    const timeout = Math.max(20_000, Math.ceil(file.size / (1024 * 1024)) * 10_000)
    socket.setTimeout(timeout, () => socket.destroy(new Error('timeout')))
    const fail = () => {
      if (message.status === 'received' || message.status === 'canceled') return
      this.debug('acceptFile failed at ' + received + '/' + file.size)
      message.status = 'failed'
      this.transfers.delete(message.id)
      this.rememberStatus(message)
      this.emit('message', message)
      this.scheduleState()
      this.persist()
    }
    socket.on('data', (chunk) => {
      chunks.push(chunk)
      received += chunk.length
      if (received === chunk.length) this.debug('acceptFile first chunk=' + chunk.length)
      if (!message.progress || message.progress.done !== received) {
        message.progress = { done: Math.min(received, file.size), total: file.size }
        this.emit('message', message)
      }
      if (received >= file.size) socket.end()
    })
    socket.on('error', (error) => {
      this.debug('acceptFile socket error ' + (error?.message ?? error))
      fail()
    })
    socket.on('close', () => {
      if (message.status === 'received' || message.status === 'canceled') return
      const buffer = Buffer.concat(chunks).subarray(0, file.size)
      if (buffer.length !== file.size || buffer.length === 0) return fail()
      const saved = this.store.saveImage(message.id, this.fileExtension(file.name), buffer)
      message.file.path = saved
      message.progress = { done: buffer.length, total: file.size }
      this.filePaths.set(message.id, saved)
      message.status = 'received'
      this.transfers.delete(message.id)
      this.rememberStatus(message)
      this.emit('message', message)
      this.scheduleState()
      this.persist()
    })
    this.transfers.set(message.id, {
      kind: 'file',
      stop: () => {
        try {
          socket.destroy()
        } catch {
          /* ignore */
        }
        if (message.status === 'received') return
        message.status = 'canceled'
        this.transfers.delete(message.id)
        this.rememberStatus(message)
        this.emit('message', message)
        this.scheduleState()
        this.persist()
      },
    })
    return message
  }

  cancel(convId, messageId) {
    this.ensureLoaded(convId)
    const message = (this.messages.get(convId) ?? []).find((item) => item.id === messageId)
    if (!message) return null
    const transfer = this.transfers.get(message.id)
    if (transfer) {
      transfer.stop()
      return message
    }
    if (message.dir === 'out' && message.status === 'sending') {
      message.status = 'canceled'
      this.rememberStatus(message)
      this.emit('message', message)
      this.scheduleState()
      this.persist()
    }
    return message
  }

  filePathFor(messageId) {
    return this.filePaths.get(messageId) ?? null
  }

  /** Copy a received file into the OS Downloads folder so the browser can just say where it went. */
  exportFile(messageId, name) {
    const source = this.filePathFor(messageId)
    if (!source || !fs.existsSync(source)) return null
    const downloads = path.join(os.homedir(), 'Downloads')
    fs.mkdirSync(downloads, { recursive: true })
    const base = path
      .basename(String(name || path.basename(source)))
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .slice(0, 180) || 'file.bin'
    const ext = path.extname(base)
    const stem = path.basename(base, ext)
    let target = path.join(downloads, base)
    let index = 1
    while (fs.existsSync(target)) {
      target = path.join(downloads, stem + ' (' + index + ')' + ext)
      index += 1
    }
    fs.copyFileSync(source, target)
    return target
  }

  /* ------------------------------------------------------------------ */
  /* conversations                                                       */
  /* ------------------------------------------------------------------ */

  pushMessage(message) {
    const list = this.messages.get(message.convId) ?? []
    list.push(message)
    if (list.length > MAX_MESSAGES) list.splice(0, list.length - MAX_MESSAGES)
    this.messages.set(message.convId, list)
    const conv = this.convs.get(message.convId) ?? { key: message.convId, unread: 0, lastAt: 0 }
    conv.lastAt = message.ts
    conv.lastText =
      message.kind === 'image'
        ? '[图片]'
        : message.kind === 'file'
          ? '[文件] ' + (message.file?.name ?? '')
          : message.text
    this.convs.set(message.convId, conv)
    this.store.appendMessage(message.convId, message)
    this.emit('message', message)
    this.scheduleState()
  }

  ensureLoaded(convId) {
    if (this.messages.has(convId)) return
    const stored = this.store.readMessages(convId, MAX_MESSAGES)
    const now = Date.now()
    const list = stored
      .filter((message) => !(message.kind === 'text' && isImagePlaceholder(message.text)))
      .map((message) => {
        const patch = this.statuses.get(message.id)
        let next = patch ? { ...message, ...patch } : message
        // A "sending" record without a receipt is stale after a restart.
        if (message.dir === 'out' && next.status === 'sending' && now - (message.ts ?? 0) > 60_000) {
          // A receipt we can no longer verify: do not claim delivered, and do
          // not leave it stuck on "sending" either.
          next = { ...next, status: 'unknown' }
        }
        // Read receipts used to clobber the file offer state; restore it.
        if (
          next.kind === 'file' &&
          next.dir === 'in' &&
          !next.file?.path &&
          (next.status === 'read' || next.status === 'unread')
        ) {
          next = { ...next, status: 'offered' }
        }
        return next
      })
    this.messages.set(convId, list)
  }

  retry(convId, messageId) {
    this.ensureLoaded(convId)
    const message = (this.messages.get(convId) ?? []).find((item) => item.id === messageId)
    if (!message) return null
    if (message.dir === 'in') {
      return message.kind === 'file' ? this.acceptFile(convId, messageId) : null
    }
    const peer = this.peers.get(message.peerKey)
    if (!peer) return null
    if (message.kind === 'image') {
      const file = message.image?.file
      if (!file || !fs.existsSync(file)) return null
      this.deliverImage(message, fs.readFileSync(file), message.image.ext === 'jpg' ? 2 : 1)
      return message
    }
    if (message.kind === 'file') {
      const file = message.file?.path
      if (!file || !fs.existsSync(file)) return null
      this.sendFile(message.peerKey, message.file.name, fs.readFileSync(file))
      message.status = 'canceled'
      this.rememberStatus(message)
      this.emit('message', message)
      return message
    }
    if (message.kind === 'text') {
      message.status = 'sending'
      this.rememberStatus(message)
      this.byPacketNo.set(message.packetNo, message)
      this.send(
        buildPacket({
          feiqHeader: this.ver,
          packetNo: message.packetNo,
          user: this.nick,
          host: this.hostName,
          command: COMMAND.SENDMSG | OPTION.SENDCHECK,
          extra: message.text,
        }),
        peer,
      )
      this.setTimeout(() => {
        if (message.status === 'sending') {
          message.status = 'failed'
          this.emit('message', message)
          this.scheduleState()
        }
      }, ACK_TIMEOUT_MS)
    }
    this.emit('message', message)
    return message
  }

  markRead(convId) {
    this.ensureLoaded(convId)
    const list = this.messages.get(convId) ?? []
    const peer = this.peers.get(convId)
    let sent = 0
    for (const message of list) {
      if (message.dir !== 'in' || message.status === 'read') continue
      // Files have their own lifecycle (offered -> receiving -> received);
      // a read receipt must not overwrite it.
      if (message.kind === 'file') {
        if (peer && message.packetNo && sent < 50) {
          this.send(
            buildPacket({
              feiqHeader: this.ver,
              packetNo: String(++this.packetNo),
              user: this.nick,
              host: this.hostName,
              command: COMMAND.READMSG,
              extra: String(message.packetNo),
            }),
            peer,
          )
          sent++
        }
        continue
      }
      message.status = 'read'
      this.emit('message', message)
      if (peer && message.packetNo && sent < 50) {
        this.send(
          buildPacket({
            feiqHeader: this.ver,
            packetNo: String(++this.packetNo),
            user: this.nick,
            host: this.hostName,
            command: COMMAND.READMSG,
            extra: String(message.packetNo),
          }),
          peer,
        )
        sent++
      }
    }
    const conv = this.convs.get(convId)
    if (conv) conv.unread = 0
    this.scheduleState()
    this.persist()
  }

  scheduleState() {
    if (this.stateScheduled) return
    this.stateScheduled = true
    this.setTimeout(() => {
      this.stateScheduled = false
      this.emit('state', this.snapshot())
    }, 120)
  }

  snapshot() {
    const peers = [...this.peers.values()].map((peer) => ({ ...peer }))
    const convs = [...this.convs.values()]
      .map((conv) => {
        this.ensureLoaded(conv.key)
        const peer = this.peers.get(conv.key)
        return {
          ...conv,
          nick: peer?.nick ?? conv.key,
          displayName: peer?.displayName ?? '',
          avatar: peer?.avatar ?? '',
          online: Boolean(peer?.online),
        }
      })
      .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
    const unreadTotal = convs.reduce((sum, conv) => sum + (conv.unread || 0), 0)
    return {
      self: {
        nick: this.nick,
        avatar: this.avatar,
        host: this.hostName,
        ip: this.localIp,
        mac: this.mac,
        port: this.port,
      },
      status: { ...this.status },
      unreadTotal,
      peers,
      convs,
    }
  }

  history(convId, limit = 100) {
    this.ensureLoaded(convId)
    return (this.messages.get(convId) ?? []).slice(-limit)
  }

  setSettings(patch = {}) {
    if (typeof patch.nick === 'string' && patch.nick.trim() !== '') {
      this.nick = patch.nick.trim()
      this.persist(true)
      this.announce()
    }
    if (typeof patch.avatar === 'string' && /^[a-z0-9-]{1,24}$/i.test(patch.avatar)) {
      this.avatar = patch.avatar
      this.persist(true)
      this.announce()
    }
    return this.snapshot()
  }

  /** Re-broadcast presence so peers answer again, then return the new roster. */
  refresh() {
    this.announce()
    this.scheduleState()
    return this.snapshot()
  }
}

export function createFeiqApp(options) {
  return new FeiqApp(options)
}
