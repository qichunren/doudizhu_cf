import { Env } from './types'

interface WSMsg {
  msg_id?: string
  action: string
  data: Record<string, unknown>
  timestamp?: number
}
import {
  ActionRegister, ActionLogin, ActionGetRoomList,
  ActionCreateRoom, ActionJoinRoom,
} from './protocol/action'
import {
  CodeOK, CodeInvalidAction, CodeInvalidParams, CodeAccountExists,
  CodeUserNotFound, CodeWrongPassword, CodeServerError, CodeUnauthorized,
  CodeRoomNotFound, CodeRoomFull, CodeRoomAlreadyStart,
  errorMessages,
} from './protocol/error'

interface UserData {
  account: string
  password: string
  nickname: string
  score: number
}

interface SessionData {
  userId: string
  token: string
}

interface RoomMeta {
  roomId: string
  title: string
  ownerId: string
  playerCount: number
  maxPlayers: number
  status: string
  needPassword: boolean
  doId: string
}

function generateId(prefix: string): string {
  const buf = new Uint8Array(8)
  crypto.getRandomValues(buf)
  return prefix + '_' + Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateToken(): string {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export class LobbyDO implements DurableObject {
  private state: DurableObjectState
  private users = new Map<string, UserData>()
  private accounts = new Map<string, string>()
  private sessions = new Map<string, SessionData>()
  private rooms = new Map<string, RoomMeta>()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage?.list()
      if (stored) {
        for (const [key, val] of stored) {
          if (key.startsWith('user:')) this.users.set(key.slice(5), val as UserData)
          else if (key.startsWith('acct:')) this.accounts.set(key.slice(5), val as string)
          else if (key.startsWith('session:')) this.sessions.set(key.slice(8), val as SessionData)
          else if (key.startsWith('room:')) this.rooms.set(key.slice(5), val as RoomMeta)
        }
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()

    server.addEventListener('message', async (event: MessageEvent) => {
      try {
        const msg: WSMsg = JSON.parse(event.data as string)
        await this.handleMessage(msg, server)
      } catch (e) {
        server.send(JSON.stringify({ code: CodeServerError, message: errorMessages[CodeServerError] }))
      }
    })

    server.addEventListener('close', () => {})

    return new Response(null, { status: 101, webSocket: client })
  }

  private async handleMessage(msg: WSMsg, ws: WebSocket): Promise<void> {
    const { action, data, msg_id } = msg
    let code = CodeOK
    let message = 'ok'
    let respData: Record<string, unknown> = {}

    try {
      switch (action) {
        case ActionRegister:
          respData = await this.register(data as { account: string; password: string; nickname: string })
          break
        case ActionLogin:
          respData = await this.login(data as { account: string; password: string })
          break
        case ActionGetRoomList:
          respData = this.getRoomList()
          break
        case ActionCreateRoom:
          respData = await this.createRoom(data as { title?: string; user_id: string; token: string })
          break
        case ActionJoinRoom:
          respData = await this.joinRoom(data as { room_id: string; user_id: string; token: string })
          break
        default:
          code = CodeInvalidAction
          message = errorMessages[CodeInvalidAction]
      }
    } catch (e: any) {
      code = e.code || CodeServerError
      message = e.message || errorMessages[CodeServerError]
    }

    ws.send(JSON.stringify({ msg_id, action, code, message, data: respData }))
  }

  private async register(data: { account: string; password: string; nickname: string }): Promise<Record<string, unknown>> {
    if (!data.account || !data.password || !data.nickname) {
      throw { code: CodeInvalidParams, message: errorMessages[CodeInvalidParams] }
    }
    if (this.accounts.has(data.account)) {
      throw { code: CodeAccountExists, message: errorMessages[CodeAccountExists] }
    }

    const userId = generateId('u')
    const passwordHash = await hashPassword(data.password)
    const userData: UserData = {
      account: data.account, password: passwordHash,
      nickname: data.nickname, score: 1000,
    }

    this.users.set(userId, userData)
    this.accounts.set(data.account, userId)
    const token = generateToken()
    this.sessions.set(userId, { userId, token })

    await this.state.storage?.put({
      [`user:${userId}`]: userData,
      [`acct:${data.account}`]: userId,
      [`session:${userId}`]: { userId, token },
    })

    return { user_id: userId, token, nickname: data.nickname, score: 1000 }
  }

  private async login(data: { account: string; password: string }): Promise<Record<string, unknown>> {
    if (!data.account || !data.password) {
      throw { code: CodeInvalidParams, message: errorMessages[CodeInvalidParams] }
    }

    const userId = this.accounts.get(data.account)
    if (!userId) {
      throw { code: CodeUserNotFound, message: errorMessages[CodeUserNotFound] }
    }

    const user = this.users.get(userId)
    if (!user) {
      throw { code: CodeServerError, message: errorMessages[CodeServerError] }
    }

    const passwordHash = await hashPassword(data.password)
    if (user.password !== passwordHash) {
      throw { code: CodeWrongPassword, message: errorMessages[CodeWrongPassword] }
    }

    const token = generateToken()
    this.sessions.set(userId, { userId, token })
    await this.state.storage?.put(`session:${userId}`, { userId, token })

    return { user_id: userId, token, nickname: user.nickname, score: user.score }
  }

  private getRoomList(): Record<string, unknown> {
    const roomList = Array.from(this.rooms.values()).filter(r => r.status !== 'closed')
    return { rooms: roomList, total: roomList.length }
  }

  private async createRoom(data: { title?: string; user_id: string; token: string }): Promise<Record<string, unknown>> {
    const session = this.sessions.get(data.user_id)
    if (!session || session.token !== data.token) {
      throw { code: CodeUnauthorized, message: errorMessages[CodeUnauthorized] }
    }

    const roomId = generateId('r')
    const doId = `room:${roomId}`
    const meta: RoomMeta = {
      roomId, title: data.title || '新手房', ownerId: data.user_id,
      playerCount: 0, maxPlayers: 3, status: 'waiting',
      needPassword: false, doId,
    }

    this.rooms.set(roomId, meta)
    await this.state.storage?.put(`room:${roomId}`, meta)

    return { room_id: roomId, do_id: doId }
  }

  private async joinRoom(data: { room_id: string; user_id: string; token: string }): Promise<Record<string, unknown>> {
    const session = this.sessions.get(data.user_id)
    if (!session || session.token !== data.token) {
      throw { code: CodeUnauthorized, message: errorMessages[CodeUnauthorized] }
    }

    const meta = this.rooms.get(data.room_id)
    if (!meta) {
      throw { code: CodeRoomNotFound, message: errorMessages[CodeRoomNotFound] }
    }
    if (meta.playerCount >= meta.maxPlayers) {
      throw { code: CodeRoomFull, message: errorMessages[CodeRoomFull] }
    }
    if (meta.status !== 'waiting') {
      throw { code: CodeRoomAlreadyStart, message: errorMessages[CodeRoomAlreadyStart] }
    }

    meta.playerCount++
    this.rooms.set(data.room_id, meta)
    await this.state.storage?.put(`room:${data.room_id}`, meta)

    return { room_id: data.room_id, do_id: meta.doId }
  }
}
