import type { ClientMessage, ServerMessage } from './protocol'

export function defaultWsUrl(): string {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('ws')
  if (fromQuery) return fromQuery
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname || 'localhost'
  return `${proto}//${host}:8787`
}

export class NetClient {
  private ws: WebSocket | null = null
  private readonly handlers = new Set<(msg: ServerMessage) => void>()
  playerId: string | null = null
  connected = false
  lastUrl = defaultWsUrl()

  connect(url = defaultWsUrl()): Promise<void> {
    this.disconnect()
    this.lastUrl = url
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
      } catch (e) {
        reject(e)
        return
      }
      const timer = window.setTimeout(() => {
        if (!this.connected) {
          this.ws?.close()
          reject(new Error('Timeout — zkontroluj WS adresu / tunnel / firewall'))
        }
      }, 8000)

      this.ws.addEventListener('open', () => {
        window.clearTimeout(timer)
        this.connected = true
        resolve()
      })
      this.ws.addEventListener('error', () => {
        if (!this.connected) {
          window.clearTimeout(timer)
          reject(new Error('Nelze se připojit k multiplayer serveru'))
        }
      })
      this.ws.addEventListener('close', () => {
        this.connected = false
      })
      this.ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMessage
          if (msg.type === 'welcome') this.playerId = msg.playerId
          for (const h of this.handlers) h(msg)
        } catch {
          /* ignore */
        }
      })
    })
  }

  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(msg))
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.connected = false
    this.playerId = null
  }
}

/** Odkaz pro kamarády na jiném PC / jiném internetu. */
export function roomLink(code: string, publicWsUrl?: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', code)
  const ws = publicWsUrl || defaultWsUrl()
  url.searchParams.set('ws', ws)
  return url.toString()
}

export function roomFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('room')
}

export function wsFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('ws')
}
