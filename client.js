window.__ModuleLoader__.load({
  id: 'dsh-feiq-im',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React
    const API = '/feiq-im'

    const CSS = [
      '.fq-root{position:fixed;inset:0;z-index:900;pointer-events:none;font-family:inherit}',
      '.fq-root>*{pointer-events:auto}',
      '.fq-panel{position:absolute;width:400px;height:min(560px,76vh);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.2);overflow:hidden;color:var(--dsw-alias-label-primary)}',
      '.fq-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}',
      '.fq-title{font-size:14px;font-weight:700}',
      '.fq-muted{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.fq-spacer{flex:1}',
      '.fq-iconbtn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:18px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:8px;flex:0 0 auto}',
      '.fq-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.fq-iconbtn svg{display:block}',
      '.fq-linkbtn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:6px}',
      '.fq-linkbtn:hover{color:var(--dsw-alias-brand-primary)}',
      '.fq-body{flex:1;overflow:auto;padding:6px 8px}',
      '.fq-section{font-size:10px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary);opacity:.75;padding:8px 6px 4px}',
      '.fq-row{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:8px;cursor:pointer}',
      '.fq-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.fq-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.fq-avatar-badge{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;border-radius:8px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid var(--dsw-alias-bg-overlay)}',
      '.fq-rail{width:64px;flex:0 0 64px;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0;overflow-y:auto;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l1)}',
      '.fq-rail-item{position:relative;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid transparent;flex:0 0 auto}',
      '.fq-rail-item:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.fq-rail-item.active{background:var(--dsw-alias-bg-overlay);border-color:var(--dsw-alias-border-l1);border-right-color:transparent}',
      '.fq-rail-item.active::after{content:"";position:absolute;right:-13px;top:0;bottom:0;width:13px;background:var(--dsw-alias-bg-overlay)}',
      '.fq-row-main{min-width:0;flex:1}',
      '.fq-name{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fq-snippet{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fq-count{min-width:18px;height:16px;border-radius:9px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px}',
      '.fq-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:0 0 auto}',
      '.fq-dot.off{background:var(--dsw-alias-state-error-primary)}',
      '.fq-section-toggle{cursor:pointer;user-select:none}',
      '.fq-section-toggle:hover{color:var(--dsw-alias-label-primary)}',
      '.fq-bubble{width:48px;height:48px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;color:var(--dsw-alias-brand-primary)}',
      '.fq-bubble:hover{border-color:var(--dsw-alias-border-l2)}',
      '.fq-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid var(--dsw-alias-bg-base)}',
      '.fq-shake{animation:fqshake .5s}',
      '@keyframes fqshake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}',
      '.fq-msgs{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}',
      '.fq-msg{display:flex;flex-direction:column;max-width:86%}',
      '.fq-msg.in{align-self:flex-start}.fq-msg.out{align-self:flex-end;align-items:flex-end}',
      '.fq-text{font-size:12px;line-height:1.45;padding:7px 10px;border-radius:10px;white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-2)}',
      '.fq-msg.out .fq-text{background:var(--dsw-alias-brand-primary);color:#fff}',
      '.fq-meta{font-size:10px;color:var(--dsw-alias-label-secondary);margin-top:3px}',
      '.fq-meta.read{color:var(--dsw-alias-brand-primary)}',
      '.fq-text-status.sent{color:var(--dsw-alias-state-success-primary)}',
      '.fq-text-status.unread{color:var(--dsw-alias-state-warn-primary)}',
      '.fq-text-status.read{color:var(--dsw-alias-state-error-primary)}',
      '.fq-meta.fail{color:var(--dsw-alias-state-error-primary);cursor:pointer}',
      '.fq-img{max-width:220px;border-radius:10px;display:block}',
      '.fq-file{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-size:12px;max-width:240px}',
      '.fq-msg.out .fq-file{background:var(--dsw-alias-brand-primary);color:#fff}',
      '.fq-file-name{font-weight:600;word-break:break-all}',
      '.fq-progress{display:flex;flex-direction:column;gap:4px;margin-top:5px;width:190px}',
      '.fq-progress-bar{height:4px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.fq-msg.out .fq-progress-bar{background:rgba(255,255,255,.35)}',
      '.fq-progress-fill{height:100%;background:var(--dsw-alias-brand-primary)}',
      '.fq-msg.out .fq-progress-fill{background:#fff}',
      '.fq-progress-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.fq-lightbox{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;cursor:zoom-out}',
      '.fq-lightbox-img{max-width:88vw;max-height:88vh;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.5)}',
      '.fq-trigger{position:relative;width:26px;height:26px;border-radius:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}',
      '.fq-trigger:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.fq-trigger-badge{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;border-radius:8px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;border:1.5px solid var(--dsw-alias-bg-overlay)}',
      '.fq-resize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;border-right:2px solid var(--dsw-alias-border-l2);border-bottom:2px solid var(--dsw-alias-border-l2);border-bottom-right-radius:12px;opacity:.65;touch-action:none}',
      '.fq-resize:hover{opacity:1}',
      '.fq-compose{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1);align-items:flex-end;flex:0 0 auto}',
      '.fq-input{flex:1;min-height:34px;max-height:96px;resize:none;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:8px;font-family:inherit;outline:none}',
      '.fq-send{height:30px;padding:0 12px;border-radius:8px;border:0;background:var(--dsw-alias-brand-primary);color:#fff;font-size:12px;cursor:pointer}',
      '.fq-send:disabled{opacity:.5;cursor:default}',
      '.fq-toast{position:absolute;top:8px;left:50%;transform:translateX(-50%);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-size:11px;padding:5px 10px;border-radius:999px;z-index:2}',
      '.fq-empty{font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center;padding:28px 12px;line-height:1.7}',
      '.fq-foot{display:flex;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.fq-nick{width:100%;box-sizing:border-box;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:8px}',
      '.fq-option{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer}',
      '.fq-option:hover{color:var(--dsw-alias-label-primary)}',
      '.fq-option.active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:transparent}',
      '.fq-avatar-grid{display:flex;flex-wrap:wrap;gap:8px}',
      '.fq-avatar-option{border:2px solid transparent;border-radius:50%;background:transparent;padding:0;line-height:0;cursor:pointer}',
      '.fq-avatar-option:hover{border-color:var(--dsw-alias-border-l2)}',
      '.fq-avatar-option.active{border-color:var(--dsw-alias-brand-primary)}',
      '.fq-settings{display:flex;flex-direction:column;gap:10px;padding:14px 12px}',
      '.fq-banner{font-size:11px;padding:8px 12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
    ].join('\n')

    function api(pathname, options) {
      return fetch(API + pathname, options).then((res) => res.json())
    }

    function post(pathname, body) {
      return api(pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
    }

    function timeText(ts) {
      const date = new Date(ts)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    function formatSize(bytes) {
      const value = Number(bytes) || 0
      if (value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB'
      if (value >= 1024) return (value / 1024).toFixed(0) + ' KB'
      return value + ' B'
    }

    function initial(nick) {
      const text = String(nick ?? '')
      return text ? text.slice(0, 1).toUpperCase() : '?'
    }

    const AVATAR_COLORS = ['#4f7df3', '#e8833a', '#2ea36b', '#8b6cf0', '#d6455d', '#0ea5b7', '#b45309', '#7c3aed']

    function colorFor(name) {
      let hash = 0
      for (const ch of String(name ?? '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
      return AVATAR_COLORS[hash % AVATAR_COLORS.length]
    }

    // Built-in avatar set ("fat fish" pack). Only exchanged between dsh-feiq-im
    // peers via the private 0xE1 profile packet; FeiQ itself does not render it.
    const FISH = {
      'fish-1': { bg: '#fff4e5', body: '#f2a33a', fin: '#e08b22', name: '胖胖鱼' },
      'fish-2': { bg: '#eaf2ff', body: '#5aa6f0', fin: '#3b82d6', name: '泡泡鱼' },
      'fish-3': { bg: '#ffe9ef', body: '#f06b8a', fin: '#d64d6f', name: '锦鲤' },
      'fish-4': { bg: '#eafaf0', body: '#48b57b', fin: '#2f9463', name: '河豚' },
      'fish-5': { bg: '#f3ecff', body: '#8b6cf0', fin: '#7050d8', name: '小丑鱼' },
      'fish-6': { bg: '#e8f7fb', body: '#2fa8c4', fin: '#1f8aa3', name: '蓝鲸鱼' },
    }

    function FishAvatar({ id, size = 30 }) {
      const fish = FISH[id] ?? FISH['fish-1']
      return h(
        'div',
        { className: 'fq-avatar', style: { width: size, height: size, background: fish.bg } },
        h(
          'svg',
          { width: Math.round(size * 0.86), height: Math.round(size * 0.86), viewBox: '0 0 40 40', 'aria-hidden': true },
          h('ellipse', { cx: 21, cy: 21, rx: 13, ry: 10, fill: fish.body }),
          h('path', { d: 'M8 21 L2 14 L2 28 Z', fill: fish.fin }),
          h('path', { d: 'M18 11 L22 5 L27 12 Z', fill: fish.fin }),
          h('circle', { cx: 29, cy: 18, r: 2.4, fill: '#1f2328' }),
          h('circle', { cx: 29.8, cy: 17.2, r: 0.8, fill: '#ffffff' }),
          h('path', { d: 'M30 24 q3 1 4 -1', stroke: fish.fin, strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' }),
          h('circle', { cx: 24, cy: 25, r: 1.6, fill: fish.fin, opacity: 0.35 }),
        ),
      )
    }

    function FqAvatar({ name, avatar, size = 30 }) {
      if (avatar && FISH[avatar]) return h(FishAvatar, { id: avatar, size })
      return h(
        'div',
        {
          className: 'fq-avatar',
          style: {
            width: size,
            height: size,
            background: colorFor(name),
            color: '#fff',
            fontSize: Math.round(size * 0.42),
          },
        },
        initial(name),
      )
    }

    function Icon({ name, size = 18 }) {
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }
      if (name === 'back') return h('svg', common, h('path', { d: 'M15 5 8 12l7 7' }))
      if (name === 'close') return h('svg', common, h('path', { d: 'M6 6l12 12M18 6L6 18' }))
      if (name === 'shake') {
        return h(
          'svg',
          common,
          h('rect', { x: 8, y: 6, width: 8, height: 12, rx: 2 }),
          h('path', { d: 'M4.5 9v6M2.5 11v2M19.5 9v6M21.5 11v2' }),
        )
      }
      return null
    }

    function ChatIcon({ size = 18 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
        h('path', { d: 'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' }),
      )
    }

    // Shared state between the composer trigger and the overlay panel: they are
    // rendered into two different slots, so React context cannot reach across.
    const bridge = {
      open: false,
      unread: 0,
      dock: false,
      dockRect: null,
      mode: (() => {
        try {
          return localStorage.getItem('dsh-feiq-im.entry') === 'composer' ? 'composer' : 'float'
        } catch {
          return 'float'
        }
      })(),
      listeners: new Set(),
      subscribe(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      set(patch) {
        Object.assign(this, patch)
        for (const listener of this.listeners) listener()
      },
    }

    function useBridge() {
      const [, force] = useState(0)
      useEffect(() => bridge.subscribe(() => force((value) => value + 1)), [])
      return bridge
    }

    function ComposerTrigger() {
      const state = useBridge()
      const ref = useRef(null)
      const report = () => {
        if (ref.current) bridge.set({ dock: true, dockRect: ref.current.getBoundingClientRect() })
      }
      useEffect(() => {
        if (state.mode !== 'composer') {
          if (bridge.dock || bridge.dockRect) bridge.set({ dock: false, dockRect: null })
          return undefined
        }
        report()
        window.addEventListener('resize', report)
        return () => {
          window.removeEventListener('resize', report)
          bridge.set({ dock: false, dockRect: null })
        }
      }, [state.mode])
      if (state.mode !== 'composer') return null
      return h(
        'button',
        {
          ref,
          type: 'button',
          className: 'fq-trigger',
          title: 'DSH飞秋' + (state.unread ? ' · ' + state.unread + ' 条未读' : ''),
          'aria-label': 'DSH飞秋',
          onClick: () => {
            report()
            bridge.set({ open: !bridge.open })
          },
        },
        h(ChatIcon, { size: 18 }),
        state.unread
          ? h('span', { className: 'fq-trigger-badge' }, state.unread > 99 ? '99+' : String(state.unread))
          : null,
      )
    }

    function FeiqBubble() {
      const [snap, setSnap] = useState(null)
      const bridged = useBridge()
      const open = bridged.open
      const setOpen = (value) => bridge.set({ open: typeof value === 'function' ? value(bridge.open) : value })
      const [active, setActive] = useState(null)
      const [messages, setMessages] = useState({})
      const [draft, setDraft] = useState('')
      const [shakeAt, setShakeAt] = useState(0)
      const [toast, setToast] = useState('')
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [recentOpen, setRecentOpen] = useState(false)
      const [nickDraft, setNickDraft] = useState('')
      const [lightbox, setLightbox] = useState(null)
      const rootRef = useRef(null)
      const panelRef = useRef(null)
      const bubbleRef = useRef(null)
      const dragRef = useRef(null)
      const [pos, setPos] = useState(() => {
        try {
          const saved = JSON.parse(localStorage.getItem('dsh-feiq-im.pos.v2') || 'null')
          if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved
        } catch {
          /* ignore broken storage */
        }
        return { x: 296, y: Math.max(8, window.innerHeight - 200) }
      })
      const [size, setSize] = useState(() => {
        try {
          const saved = JSON.parse(localStorage.getItem('dsh-feiq-im.size') || 'null')
          if (saved && Number.isFinite(saved.w) && Number.isFinite(saved.h)) return saved
        } catch {
          /* ignore broken storage */
        }
        return { w: 460, h: 610 }
      })
      const sizeRef = useRef(size)
      sizeRef.current = size
      const resizeRef = useRef(null)
      const scrollRef = useRef(null)
      const fileRef = useRef(null)
      const fileAnyRef = useRef(null)
      const activeRef = useRef(null)
      const openRef = useRef(false)
      activeRef.current = active
      openRef.current = open

      useEffect(() => {
        let alive = true
        fetch(API + '/api/bootstrap')
          .then((res) => res.json())
          .then((value) => {
            if (alive) setSnap(value)
          })
          .catch(() => {})
        const source = new EventSource(API + '/stream')
        source.addEventListener('hello', (event) => setSnap(JSON.parse(event.data)))
        source.addEventListener('state', (event) => setSnap(JSON.parse(event.data)))
        source.addEventListener('message', (event) => {
          const message = JSON.parse(event.data)
          setMessages((prev) => {
            const list = prev[message.convId]
            if (!list) return prev
            const index = list.findIndex((item) => item.id === message.id)
            const next = index >= 0 ? list.map((item) => (item.id === message.id ? message : item)) : [...list, message]
            return { ...prev, [message.convId]: next }
          })
          if (message.dir === 'in' && activeRef.current === message.convId && openRef.current && document.hasFocus()) {
            post('/api/read', { convId: message.convId }).catch(() => {})
          }
        })
        source.addEventListener('knock', (event) => {
          const data = JSON.parse(event.data)
          setShakeAt(Date.now())
          setToast('⚡ ' + (data.nick || '对方') + ' 抖了你一下')
          setTimeout(() => setToast(''), 2600)
        })
        return () => {
          alive = false
          source.close()
        }
      }, [])

      useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            setLightbox(null)
            setOpen(false)
          }
        }
        const onDown = (event) => {
          const inside = (ref) => ref.current && ref.current.contains(event.target)
          if (!inside(bubbleRef) && !inside(panelRef)) setOpen(false)
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('mousedown', onDown)
        return () => {
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('mousedown', onDown)
        }
      }, [open])

      useEffect(() => {
        const onResize = () => {
          setPos((current) => ({
            x: Math.min(current.x, Math.max(8, window.innerWidth - 56)),
            y: Math.min(current.y, Math.max(8, window.innerHeight - 56)),
          }))
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, [active, messages])

      useEffect(() => {
        if (!shakeAt) return undefined
        const timer = setTimeout(() => setShakeAt(0), 700)
        return () => clearTimeout(timer)
      }, [shakeAt])

      const convs = snap?.convs ?? []
      const peers = snap?.peers ?? []
      const unreadTotal = snap?.unreadTotal ?? 0
      const onlineCount = peers.filter((peer) => peer.online).length

      useEffect(() => {
        if (bridge.unread !== unreadTotal) bridge.set({ unread: unreadTotal })
      }, [unreadTotal])

      const openChat = (convId) => {
        setActive(convId)
        setSettingsOpen(false)
        fetch(API + '/api/history?convId=' + encodeURIComponent(convId) + '&limit=120')
          .then((res) => res.json())
          .then((value) => setMessages((prev) => ({ ...prev, [convId]: value.messages ?? [] })))
          .catch(() => {})
        if (document.hasFocus()) post('/api/read', { convId }).catch(() => {})
      }

      const sendText = () => {
        const text = draft.trim()
        if (!text || !active) return
        setDraft('')
        post('/api/send', { peerKey: active, kind: 'text', text })
          .then((value) => {
            if (value.message) {
              setMessages((prev) => ({ ...prev, [active]: [...(prev[active] ?? []), value.message] }))
            }
          })
          .catch(() => {})
      }

      const sendImage = (file) => {
        if (!file || !active) return
        const reader = new FileReader()
        reader.onload = () => {
          const data = String(reader.result).split(',')[1] ?? ''
          post('/api/send', { peerKey: active, kind: 'image', data })
            .then((value) => {
              if (value.message) {
                setMessages((prev) => ({ ...prev, [active]: [...(prev[active] ?? []), value.message] }))
              }
            })
            .catch(() => {})
        }
        reader.readAsDataURL(file)
      }

      const sendFile = (file) => {
        if (!file || !active) return
        const reader = new FileReader()
        reader.onload = () => {
          const data = String(reader.result).split(',')[1] ?? ''
          post('/api/send-file', { peerKey: active, name: file.name, data })
            .then((value) => {
              if (value.message) {
                setMessages((prev) => ({ ...prev, [active]: [...(prev[active] ?? []), value.message] }))
              }
            })
            .catch(() => {})
        }
        reader.readAsDataURL(file)
      }

      const acceptFileMsg = (messageId) => {
        post('/api/accept-file', { convId: active, messageId })
          .then((value) => {
            if (value.message) {
              setMessages((prev) => ({
                ...prev,
                [active]: (prev[active] ?? []).map((item) => (item.id === value.message.id ? value.message : item)),
              }))
            }
          })
          .catch(() => {})
      }

      const transferProgress = (message) => {
        if (message.status !== 'sending' && message.status !== 'receiving') return null
        const progress = message.progress
        if (!progress || !progress.total) return null
        const pct = Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)))
        return h(
          'div',
          { className: 'fq-progress' },
          h('div', { className: 'fq-progress-bar' }, h('div', { className: 'fq-progress-fill', style: { width: pct + '%' } })),
          h(
            'div',
            { className: 'fq-progress-row' },
            h('span', null, (message.status === 'sending' ? '发送 ' : '接收 ') + pct + '%'),
            h(
              'button',
              { className: 'fq-linkbtn', title: '取消传输', onClick: () => post('/api/cancel', { convId: active, messageId: message.id }).catch(() => {}) },
              '取消',
            ),
          ),
        )
      }

      const closeFeiq = () => {        post('/api/port/close-feiq', { confirm: true })
          .then((value) => {
            if (value.snapshot) setSnap(value.snapshot)
            if (value.error) setToast('无法自动关闭：' + value.error)
            else {
              setToast('已关闭飞秋，互通已开启')
              setTimeout(() => setToast(''), 2600)
            }
          })
          .catch(() => setToast('操作失败'))
      }

      const refreshList = () => {
        post('/api/refresh')
          .then((value) => {
            if (value && value.self) setSnap(value)
          })
          .catch(() => {})
      }

      const renderRow = (conv) => {
        const peer = peers.find((item) => item.key === conv.key)
        const online = Boolean(peer?.online)
        return h(
          'div',
          { className: 'fq-row', key: conv.key, onClick: () => openChat(conv.key) },
          h(FqAvatar, { name: conv.displayName || conv.nick || conv.key, avatar: conv.avatar, size: 32 }),
          h(
            'div',
            { className: 'fq-row-main' },
            h('div', { className: 'fq-name' }, conv.displayName || conv.nick || conv.key),
            h('div', { className: 'fq-snippet' }, conv.lastText || (online ? '在线' : '离线')),
          ),
          conv.unread ? h('div', { className: 'fq-count' }, conv.unread > 99 ? '99+' : conv.unread) : h('div', { className: 'fq-dot' + (online ? '' : ' off') }),
        )
      }

      const listView = () => {
        const onlineKeys = new Set(peers.filter((peer) => peer.online).map((peer) => peer.key))
        const unread = convs.filter((conv) => conv.unread > 0 && !onlineKeys.has(conv.key))
        const recent = convs.filter((conv) => conv.lastAt && !conv.unread && !onlineKeys.has(conv.key))
        const idle = peers.filter((peer) => peer.online)
        return h(
          'div',
          { className: 'fq-body' },
          unread.length ? h('div', { className: 'fq-section' }, '未读 · ' + unread.reduce((sum, conv) => sum + conv.unread, 0)) : null,
          ...unread.map(renderRow),
          idle.length
            ? h('div', { className: 'fq-section' }, '在线列表 · ' + idle.length)
            : null,
          ...idle.map((peer) => {
            const conv = convs.find((item) => item.key === peer.key)
            return h(
              'div',
              { className: 'fq-row', key: peer.key, onClick: () => openChat(peer.key) },
              h(FqAvatar, { name: peer.displayName || peer.nick || peer.key, avatar: peer.avatar, size: 32 }),
              h('div', { className: 'fq-row-main' },
                h('div', { className: 'fq-name' }, peer.displayName || peer.nick || peer.key),
                h('div', { className: 'fq-snippet' }, conv?.lastText || (peer.displayName ? peer.nick + ' · ' : '') + (peer.ip || '在线')),
              ),
              conv?.unread
                ? h('div', { className: 'fq-count' }, conv.unread > 99 ? '99+' : conv.unread)
                : h('div', { className: 'fq-dot' }),
            )
          }),
          recent.length
            ? h(
                'div',
                {
                  className: 'fq-section fq-section-toggle',
                  onClick: () => setRecentOpen((value) => !value),
                  title: recentOpen ? '收起最近会话' : '展开最近会话',
                },
                '最近会话 · ' + recent.length + (recentOpen ? '  ▾' : '  ▸'),
              )
            : null,
          ...(recentOpen ? recent.map(renderRow) : []),
          !unread.length && !idle.length && !recent.length
            ? h('div', { className: 'fq-empty' }, '同网段的飞秋 / 飞鸽上线后会自动出现在这里，', h('br'), '不需要添加好友。')
            : null,
        )
      }

      const chatView = () => {
        const list = messages[active] ?? []
        const peer = peers.find((item) => item.key === active)
        const conv = convs.find((item) => item.key === active)
        const title = peer?.displayName || peer?.nick || conv?.displayName || conv?.nick || active || ''
        const onlinePeers = peers.filter((person) => person.online)
        const unreadByKey = new Map(convs.filter((item) => item.unread > 0).map((item) => [item.key, item.unread]))
        return h(
          'div',
          { style: { display: 'flex', flex: 1, minHeight: 0 } },
          h(
            'div',
            { className: 'fq-rail' },
            ...onlinePeers.map((person) => {
              const name = person.displayName || person.nick || person.key
              const count = unreadByKey.get(person.key) || 0
              return h(
                'div',
                {
                  key: person.key,
                  className: 'fq-rail-item' + (person.key === active ? ' active' : ''),
                  title: name,
                  onClick: () => openChat(person.key),
                },
                h(FqAvatar, { name, avatar: person.avatar, size: 36 }),
                count ? h('span', { className: 'fq-avatar-badge' }, count > 99 ? '99+' : String(count)) : null,
              )
            }),
          ),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 } },
          h(
            'div',
            { className: 'fq-head' },
            h('button', { className: 'fq-iconbtn', onClick: () => setActive(null), title: '返回' }, h(Icon, { name: 'back' })),
            h(FqAvatar, { name: title, avatar: peer?.avatar, size: 30 }),
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'fq-title' }, title),
              h('div', { className: 'fq-muted' }, peer?.online ? '在线 · ' + (peer.ip || '') : '离线'),
            ),
            h('div', { className: 'fq-spacer' }),
            h('button', { className: 'fq-iconbtn', title: '发送闪屏震动', onClick: () => post('/api/knock', { peerKey: active }).catch(() => {}) }, h(Icon, { name: 'shake' })),
            h('button', { className: 'fq-iconbtn', title: '关闭', onClick: () => setOpen(false) }, h(Icon, { name: 'close' })),
          ),
          h(
            'div',
            { className: 'fq-msgs', ref: scrollRef },
            ...list.map((message) => {
              const canAcceptFile =
                message.kind === 'file' &&
                message.dir === 'in' &&
                !message.file?.path &&
                message.status !== 'receiving' &&
                message.status !== 'failed' &&
                message.status !== 'canceled'
              const imageSrc =
                message.kind === 'image'
                  ? API + '/api/image?id=' + encodeURIComponent(message.image?.id ?? '') + '&ext=' + (message.image?.ext ?? 'jpg')
                  : null
              const body =
                message.kind === 'image'
                  ? h('img', {
                      className: 'fq-img',
                      src: imageSrc,
                      alt: '图片',
                      style: { cursor: 'zoom-in' },
                      onClick: () => setLightbox(imageSrc),
                    })
                  : message.kind === 'file'
                    ? h(
                        'div',
                        { className: 'fq-file' },
                        h('div', { className: 'fq-file-name' }, message.file?.name || '文件'),
                        h('div', { className: 'fq-meta' }, formatSize(message.file?.size)),
                        canAcceptFile
                          ? h('button', { className: 'fq-send', onClick: () => acceptFileMsg(message.id) }, '接收')
                          : message.status === 'failed' || message.status === 'canceled'
                            ? h('button', { className: 'fq-send', onClick: () => post('/api/retry', { convId: active, messageId: message.id }).catch(() => {}) }, '重试')
                            : message.file?.path
                              ? h(
                                  'a',
                                  {
                                    className: 'fq-send',
                                    style: { textDecoration: 'none', textAlign: 'center', lineHeight: '30px' },
                                    href: API + '/api/file?id=' + encodeURIComponent(message.id),
                                    target: '_blank',
                                    rel: 'noreferrer',
                                  },
                                  '保存',
                                )
                              : null,
                      )
                    : h('div', { className: 'fq-text' }, message.text)
              const progress = transferProgress(message)
              const retryable = message.status === 'failed' || message.status === 'unknown'
              let metaClass = 'fq-meta'
              let metaText = timeText(message.ts)
              if (message.dir === 'out') {
                const time = timeText(message.ts)
                if (message.status === 'sending') {
                  if (message.kind === 'text') {
                    metaClass += ' fq-text-status sent'
                    metaText = '已发送 · ' + time
                  } else metaText = '发送中…'
                } else if (message.status === 'delivered') {
                  if (message.kind === 'text') {
                    metaClass += ' fq-text-status unread'
                    metaText = '未读 · ' + time
                  } else metaText = '✓ 已送达 ' + time
                } else if (message.status === 'read') {
                  if (message.kind === 'text') {
                    metaClass += ' fq-text-status read'
                    metaText = '已读 · ' + time
                  } else {
                    metaClass += ' read'
                    metaText = '✓✓ 已读 ' + time
                  }
                } else if (message.status === 'unknown') {
                  metaClass += ' fail'
                  metaText = '已发送 · 未确认 · 点击重试'
                } else if (message.status === 'canceled') {
                  metaText = '已取消 ' + time
                } else {
                  metaClass += ' fail'
                  metaText = '发送失败 · 点击重试'
                }
              }
              const meta = h(
                'div',
                {
                  className: metaClass,
                  onClick: retryable
                    ? () => post('/api/retry', { convId: active, messageId: message.id }).catch(() => {})
                    : undefined,
                },
                metaText,
              )
              return h(
                'div',
                { className: 'fq-msg ' + (message.dir === 'out' ? 'out' : 'in'), key: message.id },
                message.dir === 'in'
                  ? h(
                      'div',
                      { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
                      h(FqAvatar, { name: peer?.displayName || peer?.nick || title, avatar: peer?.avatar, size: 26 }),
                      h('div', { style: { minWidth: 0 } }, body, progress),
                    )
                  : h('div', null, body, progress),
                meta,
              )
            }),
            list.length ? null : h('div', { className: 'fq-empty' }, '和 ', title, ' 开始聊天吧。'),
          ),
          h(
            'div',
            { className: 'fq-compose' },
            h('button', { className: 'fq-iconbtn', style: { fontSize: 20 }, title: '发送文件', onClick: () => fileAnyRef.current?.click() }, '📎'),
            h('button', { className: 'fq-iconbtn', style: { fontSize: 20 }, title: '发送图片', onClick: () => fileRef.current?.click() }, '🖼'),
            h('textarea', {
              className: 'fq-input',
              value: draft,
              placeholder: 'Enter 发送，Shift+Enter 换行',
              onChange: (event) => setDraft(event.target.value),
              onPaste: (event) => {
                const items = event.clipboardData?.items ?? []
                for (const item of items) {
                  if (item.type && item.type.startsWith('image/')) {
                    const file = item.getAsFile()
                    if (file) {
                      event.preventDefault()
                      sendImage(file)
                      return
                    }
                  }
                }
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendText()
                }
              },
            }),
            h('button', { className: 'fq-send', onClick: sendText, disabled: !draft.trim() }, '发送'),
            h('input', {
              ref: fileRef,
              type: 'file',
              accept: 'image/*',
              style: { display: 'none' },
              onChange: (event) => {
                const file = event.target.files?.[0]
                if (file) sendImage(file)
                event.target.value = ''
              },
            }),
            h('input', {
              ref: fileAnyRef,
              type: 'file',
              style: { display: 'none' },
              onChange: (event) => {
                const file = event.target.files?.[0]
                if (file) sendFile(file)
                event.target.value = ''
              },
            }),
          ),
          ),
        )
      }

      const setEntryMode = (mode) => {
        try {
          localStorage.setItem('dsh-feiq-im.entry', mode)
        } catch {
          /* storage may be unavailable */
        }
        bridge.set({ mode })
      }

      const saveAvatar = (avatar) => {
        post('/api/settings', { avatar })
          .then((next) => setSnap(next))
          .catch(() => {})
      }

      const settingsView = () => {
        const nick = snap?.self?.nick ?? ''
        if (nickDraft === '' || nickDraft === snap?.self?.nick) {
          /* keep draft in sync when opening */
        }
        return h(
          'div',
          { className: 'fq-settings' },
          h('div', { className: 'fq-title' }, '设置'),
          h('div', { className: 'fq-muted' }, '昵称会显示给飞秋 / 飞鸽用户'),
          h('input', {
            className: 'fq-nick',
            value: nickDraft || nick,
            onChange: (event) => setNickDraft(event.target.value),
            placeholder: nick,
          }),
          h('button', {
            className: 'fq-send',
            onClick: () => {
              const value = (nickDraft || nick).trim()
              if (value) post('/api/settings', { nick: value }).then((next) => setSnap(next)).catch(() => {})
              setSettingsOpen(false)
            },
          }, '保存'),
          h('div', { className: 'fq-muted', style: { marginTop: 6 } }, '入口位置'),
          h(
            'div',
            { style: { display: 'flex', gap: 8 } },
            h('button', { className: 'fq-option' + (bridged.mode === 'float' ? ' active' : ''), onClick: () => setEntryMode('float') }, '浮动气泡'),
            h('button', { className: 'fq-option' + (bridged.mode === 'composer' ? ' active' : ''), onClick: () => setEntryMode('composer') }, '输入框按钮'),
          ),
          h(
            'div',
            { className: 'fq-muted' },
            bridged.mode === 'composer' ? '输入框工具行里的按钮，带红色未读角标' : '会话区左侧、输入框上方的浮动气泡',
          ),
          h('div', { className: 'fq-muted', style: { marginTop: 6 } }, '头像（仅 dsh-feiq-im 之间可见）'),
          h(
            'div',
            { className: 'fq-avatar-grid' },
            h(
              'button',
              {
                className: 'fq-avatar-option' + ((snap?.self?.avatar ?? 'initial') === 'initial' ? ' active' : ''),
                title: '默认（名字首字）',
                onClick: () => saveAvatar('initial'),
              },
              h(FqAvatar, { name: nick, size: 34 }),
            ),
            ...Object.keys(FISH).map((id) =>
              h(
                'button',
                {
                  key: id,
                  className: 'fq-avatar-option' + (snap?.self?.avatar === id ? ' active' : ''),
                  title: FISH[id].name,
                  onClick: () => saveAvatar(id),
                },
                h(FishAvatar, { id, size: 34 }),
              ),
            ),
          ),
          h('button', { className: 'fq-linkbtn', onClick: () => setSettingsOpen(false) }, '返回'),
          h('button', { className: 'fq-iconbtn', title: '关闭', onClick: () => setOpen(false) }, h(Icon, { name: 'close' })),
        )
      }

      let panelContent
      if (settingsOpen) panelContent = settingsView()
      else if (active) panelContent = chatView()
      else {
        panelContent = h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
          h(
            'div',
            { className: 'fq-head' },
            h('div', { className: 'fq-title' }, 'DSH飞秋'),
            h('div', { className: 'fq-spacer' }),
            h('div', { className: 'fq-muted' }, onlineCount + ' 人在线'),
            h('button', { className: 'fq-iconbtn', title: '刷新列表', onClick: refreshList }, '↻'),
            h('button', { className: 'fq-iconbtn', title: '设置', onClick: () => { setNickDraft(''); setSettingsOpen(true) } }, '⚙'),
            h('button', { className: 'fq-iconbtn', title: '收起', onClick: () => setOpen(false) }, h(Icon, { name: 'close' })),
          ),
          listView(),
          h(
            'div',
            { className: 'fq-foot' },
            h(FqAvatar, { name: snap?.self?.nick ?? '', avatar: snap?.self?.avatar, size: 20 }),
            h('div', null, '我 · ' + (snap?.self?.nick ?? '') + ' · ' + (snap?.self?.ip ?? '')),
          ),
        )
      }

      const BUBBLE = 48
      const PANEL_W = Math.min(Math.max(360, size.w), Math.max(360, window.innerWidth - 24))
      const panelHeight = Math.min(Math.max(420, size.h), Math.max(420, window.innerHeight - 24))
      const dockRect = bridged.dock && bridged.dockRect ? bridged.dockRect : null
      const spaceRight = window.innerWidth - (pos.x + BUBBLE)
      const openLeft = spaceRight < PANEL_W + 16
      let panelLeft
      let panelTop
      if (dockRect) {
        panelLeft = Math.min(
          Math.max(8, dockRect.left),
          Math.max(8, window.innerWidth - PANEL_W - 8),
        )
        panelTop = Math.max(8, dockRect.top - panelHeight - 12)
      } else {
        panelLeft = Math.min(
          Math.max(8, openLeft ? pos.x + BUBBLE - PANEL_W : pos.x),
          Math.max(8, window.innerWidth - PANEL_W - 8),
        )
        panelTop = Math.min(
          Math.max(8, pos.y + BUBBLE / 2 - panelHeight / 2),
          Math.max(8, window.innerHeight - panelHeight - 8),
        )
      }

      const startDrag = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          origin: { x: pos.x, y: pos.y },
          moved: false,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }

      const moveDrag = (event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return
        drag.moved = true
        setPos({
          x: Math.min(Math.max(8, drag.origin.x + dx), Math.max(8, window.innerWidth - BUBBLE - 8)),
          y: Math.min(Math.max(8, drag.origin.y + dy), Math.max(8, window.innerHeight - BUBBLE - 8)),
        })
      }

      const endDrag = (event) => {
        const drag = dragRef.current
        dragRef.current = null
        if (!drag) return
        if (drag.pointerId === event.pointerId) event.currentTarget.releasePointerCapture?.(event.pointerId)
        if (!drag.moved) {
          setOpen((value) => !value)
          return
        }
        try {
          localStorage.setItem('dsh-feiq-im.pos.v2', JSON.stringify(pos))
        } catch {
          /* storage may be unavailable */
        }
      }

      const startResize = (event) => {
        event.stopPropagation()
        resizeRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          origin: { w: PANEL_W, h: panelHeight },
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }

      const moveResize = (event) => {
        const resize = resizeRef.current
        if (!resize || resize.pointerId !== event.pointerId) return
        setSize({
          w: Math.min(
            Math.max(360, resize.origin.w + (event.clientX - resize.startX)),
            Math.max(360, window.innerWidth - 24),
          ),
          h: Math.min(
            Math.max(420, resize.origin.h + (event.clientY - resize.startY)),
            Math.max(420, window.innerHeight - 24),
          ),
        })
      }

      const endResize = (event) => {
        const resize = resizeRef.current
        resizeRef.current = null
        if (!resize) return
        event.currentTarget.releasePointerCapture?.(resize.pointerId)
        try {
          localStorage.setItem('dsh-feiq-im.size', JSON.stringify(sizeRef.current))
        } catch {
          /* storage may be unavailable */
        }
      }

      const panel = open
        ? h(
            'div',
            { className: 'fq-panel', ref: panelRef, style: { left: panelLeft, top: panelTop, width: PANEL_W, height: panelHeight } },
            toast ? h('div', { className: 'fq-toast' }, toast) : null,
            snap && !snap.status?.listening
              ? h(
                  'div',
                  { className: 'fq-banner' },
                  '2425 端口不可用' + (snap.status?.error ? '（' + snap.status.error + '）' : '') + '，飞秋互通需要它。',
                  h('div', { style: { marginTop: 6 } },
                    h('button', { className: 'fq-send', onClick: closeFeiq }, '关闭飞秋并启用'),
                  ),
                )
              : snap && snap.status?.fileService === false
                ? h('div', { className: 'fq-banner' }, '文件服务未启动（TCP 2425 被占用），暂时无法收发文件。')
                : null,
            panelContent,
            h('div', {
              className: 'fq-resize',
              onPointerDown: startResize,
              onPointerMove: moveResize,
              onPointerUp: endResize,
              onPointerCancel: endResize,
              title: '拖动调整大小',
            }),
          )
        : null

      return h(
        'div',
        { className: 'fq-root', ref: rootRef },
        h('style', null, CSS),
        lightbox
          ? h(
              'div',
              { className: 'fq-lightbox', onClick: () => setLightbox(null) },
              h('img', { className: 'fq-lightbox-img', src: lightbox, alt: '' }),
            )
          : null,
        panel,
        !open && !dockRect
          ? h(
          'button',
          {
            type: 'button',
            ref: bubbleRef,
            className: 'fq-bubble' + (shakeAt ? ' fq-shake' : ''),
            style: { left: pos.x, top: pos.y },
            onPointerDown: startDrag,
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onClick: (event) => {
              if (event.detail === 0) setOpen((value) => !value)
            },
            title: 'DSH飞秋' + (unreadTotal ? ' · ' + unreadTotal + ' 条未读' : ''),
            'aria-label': 'DSH飞秋',
          },
          h(
            'svg',
            { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
            h('path', { d: 'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' }),
          ),
          unreadTotal ? h('span', { className: 'fq-badge' }, unreadTotal > 99 ? '99+' : String(unreadTotal)) : null,
        )
          : null,
      )
    }

    return {
      name: 'dsh-feiq-im/client',
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (!slots) return
        slots.inject('shell.overlay', () =>
          slots.register(
            { name: 'shell.overlay', id: 'dsh-feiq-im-bubble', order: 890, label: 'DSH飞秋' },
            FeiqBubble,
          ),
        )
        slots.inject('conversation.input.left', () =>
          slots.register(
            { name: 'conversation.input.left', id: 'dsh-feiq-im-trigger', order: 30, label: 'DSH飞秋' },
            ComposerTrigger,
          ),
        )
      },
    }
  },
})
