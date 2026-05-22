import { Env } from './types'
import { generateId } from './api/utils'
import {
  ActionGetRoomList, ActionCreateRoom, ActionJoinRoom,
} from './protocol/action'
import {
  CodeOK, CodeInvalidAction, CodeServerError, CodeUnauthorized,
  CodeRoomNotFound, CodeRoomFull, CodeRoomAlreadyStart,
  errorMessages,
} from './protocol/error'

interface WSMsg {
  msg_id?: string
  action: string
  data: Record<string, unknown>
  timestamp?: number
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

export class LobbyDO implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private rooms = new Map<string, RoomMeta>()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage?.list()
      if (stored) {
        for (const [key, val] of stored) {
          if (key.startsWith('room:')) this.rooms.set(key.slice(5), val as RoomMeta)
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

  private getRoomList(): Record<string, unknown> {
    const roomList = Array.from(this.rooms.values())
      .filter(r => r.status !== 'closed')
      .map(r => ({
        room_id: r.roomId,
        title: r.title,
        owner_id: r.ownerId,
        player_count: r.playerCount,
        max_players: r.maxPlayers,
        status: r.status,
        need_password: r.needPassword,
        do_id: r.doId,
      }))
    return { rooms: roomList, total: roomList.length }
  }

  private async createRoom(data: { title?: string; user_id: string; token: string }): Promise<Record<string, unknown>> {
    const session = await this.env.DB.prepare(
      'SELECT token FROM sessions WHERE user_id = ?',
    ).bind(data.user_id).first<{ token: string }>()
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
    const session = await this.env.DB.prepare(
      'SELECT token FROM sessions WHERE user_id = ?',
    ).bind(data.user_id).first<{ token: string }>()
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
