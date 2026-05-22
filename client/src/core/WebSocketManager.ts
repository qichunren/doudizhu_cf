export interface PendingRequest {
  resolve: (data: Record<string, unknown>) => void
  reject: (err: any) => void
  timer: ReturnType<typeof setTimeout>
}

export class WebSocketManager {
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private pushHandlers = new Map<string, (data: Record<string, unknown>) => void>()
  private msgCounter = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private url = ''

  connect(url: string): Promise<void> {
    this.url = url
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)
      this.ws.onopen = () => {
        this.startHeartbeat()
        resolve()
      }
      this.ws.onclose = () => {
        this.stopHeartbeat()
        this.rejectAll()
      }
      this.ws.onerror = (e) => reject(e)
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.msg_id) {
            const pending = this.pending.get(msg.msg_id)
            if (pending) {
              clearTimeout(pending.timer)
              this.pending.delete(msg.msg_id)
              if (msg.code === 0) {
                pending.resolve(msg.data || {})
              } else {
                pending.reject(new Error(msg.message || 'unknown error'))
              }
            }
          } else if (msg.action) {
            const handler = this.pushHandlers.get(msg.action)
            if (handler) handler(msg.data || {})
          }
        } catch (e) {
          console.error('WS parse error', e)
        }
      }
    })
  }

  send(action: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'))
        return
      }
      const msg_id = `m_${++this.msgCounter}`
      const timer = setTimeout(() => {
        this.pending.delete(msg_id)
        reject(new Error('timeout'))
      }, 10000)

      this.pending.set(msg_id, { resolve, reject, timer })
      this.ws.send(JSON.stringify({ msg_id, action, data, timestamp: Date.now() }))
    })
  }

  onPush(action: string, handler: (data: Record<string, unknown>) => void): void {
    this.pushHandlers.set(action, handler)
  }

  offPush(action: string): void {
    this.pushHandlers.delete(action)
  }

  disconnect(): void {
    this.stopHeartbeat()
    this.ws?.close()
    this.ws = null
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'ping' }))
      }
    }, 10000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private rejectAll(): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('connection closed'))
    }
    this.pending.clear()
  }
}
