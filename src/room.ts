import { Env } from './types'
import { Card, CardType, cardToString, stringToCard } from './game/card'
import { newDeck, shuffle, deal } from './game/deck'
import { canBeat, isBomb } from './game/compare'
import { classifyCards } from './game/classifier'
import { GameState, gameStateString } from './game/statemachine'
import {
  ActionJoinRoomConfirm, ActionReady, ActionLeaveRoom,
  ActionRobLandlord, ActionPlayCard, ActionPass,
  PushPlayerJoined, PushPlayerLeft, PushPlayerReady,
  PushGameStart, PushLandlordConfirm, PushCardPlayed,
  PushPlayerPass, PushTurnChanged, PushGameOver,
  PushRoomClosed, PushRobLandlord,
} from './protocol/action'
import {
  CodeOK, CodeInvalidAction, CodeInvalidParams, CodeNotYourTurn,
  CodeInvalidCards, CodeCardsNotBeat, CodeServerError, errorMessages,
} from './protocol/error'

interface WSMsg {
  msg_id?: string
  action: string
  data: Record<string, unknown>
  timestamp?: number
}

interface PlayerInfo {
  userId: string
  nickname: string
  seat: number
  isReady: boolean
  isOnline: boolean
  ws: WebSocket
}

interface PlayLog {
  userId: string
  cards: string[]
  cardType: CardType
  rank: number
  length: number
}

export class RoomDO implements DurableObject {
  private state: DurableObjectState
  private roomId = ''
  private players: PlayerInfo[] = []
  private gameState: GameState = GameState.Dealing
  private hands = new Map<string, Card[]>()
  private bottomCards: Card[] = []
  private landlordId = ''
  private currentTurn = 0
  private lastPlay: PlayLog | null = null
  private passCount = 0
  private multiplier = 1
  private robCount = 0
  private robBids: boolean[] = []
  private startSeat = 0

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
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

    server.addEventListener('close', () => {
      this.handleDisconnect(server)
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  private findPlayer(ws: WebSocket): PlayerInfo | undefined {
    return this.players.find(p => p.ws === ws)
  }

  private broadcast(data: Record<string, unknown>, exclude?: WebSocket): void {
    for (const p of this.players) {
      if (p.ws !== exclude && p.ws.readyState === 1) {
        try { p.ws.send(JSON.stringify(data)) } catch {}
      }
    }
  }

  private async handleMessage(msg: WSMsg, ws: WebSocket): Promise<void> {
    const { action, data, msg_id } = msg

    try {
      switch (action) {
        case ActionJoinRoomConfirm:
          return this.joinRoomConfirm(data as { user_id: string; nickname: string }, ws, msg_id)
        case ActionReady:
          return this.playerReady(ws, msg_id)
        case ActionLeaveRoom:
          return this.leaveRoom(ws, msg_id)
        case ActionRobLandlord:
          return this.robLandlord(data as { rob: boolean }, ws, msg_id)
        case ActionPlayCard:
          return this.playCard(data as { cards: string[] }, ws, msg_id)
        case ActionPass:
          return this.playerPass(ws, msg_id)
        default:
          ws.send(JSON.stringify({ msg_id, action, code: CodeInvalidAction, message: errorMessages[CodeInvalidAction] }))
      }
    } catch (e: any) {
      ws.send(JSON.stringify({ msg_id, action, code: CodeServerError, message: errorMessages[CodeServerError] }))
    }
  }

  private async joinRoomConfirm(data: { user_id: string; nickname: string }, ws: WebSocket, msg_id?: string): Promise<void> {
    const existing = this.players.find(p => p.userId === data.user_id)
    if (existing) {
      existing.ws = ws
      existing.isOnline = true
      existing.nickname = data.nickname
      ws.send(JSON.stringify({ msg_id, action: ActionJoinRoomConfirm, code: CodeOK, message: 'ok', data: this.getRoomSnapshot(data.user_id) }))
      this.broadcast({ action: PushPlayerJoined, data: { user_id: data.user_id, nickname: data.nickname, seat: existing.seat } }, ws)
      return
    }

    if (this.players.length >= 3) {
      ws.send(JSON.stringify({ msg_id, action: ActionJoinRoomConfirm, code: 2002, message: 'room is full' }))
      return
    }

    const seat = this.players.length
    const player: PlayerInfo = {
      userId: data.user_id, nickname: data.nickname,
      seat, isReady: false, isOnline: true, ws,
    }
    this.players.push(player)

    ws.send(JSON.stringify({ msg_id, action: ActionJoinRoomConfirm, code: CodeOK, message: 'ok', data: this.getRoomSnapshot(data.user_id) }))
    this.broadcast({ action: PushPlayerJoined, data: { user_id: data.user_id, nickname: data.nickname, seat } }, ws)
  }

  private getRoomSnapshot(userId?: string): Record<string, unknown> {
    const snap: Record<string, unknown> = {
      room_id: this.roomId,
      players: this.players.map(p => ({
        user_id: p.userId, nickname: p.nickname, seat: p.seat,
        hand_count: this.hands.get(p.userId)?.length || 0,
        is_landlord: p.userId === this.landlordId,
        ready: p.isReady,
        online: p.isOnline,
      })),
      status: gameStateString(this.gameState),
      landlord_id: this.landlordId,
      bottom_cards: this.bottomCards.map(cardToString),
      current_turn: this.players[this.currentTurn]?.userId || '',
      last_play: this.lastPlay ? { ...this.lastPlay, cardType: CardType[this.lastPlay.cardType] } : null,
      multiplier: this.multiplier,
    }
    if (userId) {
      const hand = this.hands.get(userId)
      if (hand) {
        snap.my_hand = hand.map(cardToString)
      }
    }
    return snap
  }

  private async playerReady(ws: WebSocket, msg_id?: string): Promise<void> {
    const p = this.findPlayer(ws)
    if (!p) return

    p.isReady = true
    this.broadcast({ action: PushPlayerReady, data: { user_id: p.userId, nickname: p.nickname } })
    ws.send(JSON.stringify({ msg_id, action: ActionReady, code: CodeOK, message: 'ok' }))

    if (this.players.length === 3 && this.players.every(p => p.isReady)) {
      this.startGame()
    }
  }

  private async startGame(): Promise<void> {
    const cards = newDeck()
    shuffle(cards)
    const [h0, h1, h2, bottom] = deal(cards)
    this.hands.set(this.players[0].userId, h0)
    this.hands.set(this.players[1].userId, h1)
    this.hands.set(this.players[2].userId, h2)
    this.bottomCards = bottom
    this.gameState = GameState.Calling
    this.robCount = 0
    this.robBids = []
    this.startSeat = Math.floor(Math.random() * 3)
    this.currentTurn = this.startSeat

    for (const p of this.players) {
      const hand = this.hands.get(p.userId)!
      try {
        p.ws.send(JSON.stringify({
          action: PushGameStart,
          data: {
            players: this.players.map(pl => ({
              user_id: pl.userId, nickname: pl.nickname, seat: pl.seat,
              hand_count: this.hands.get(pl.userId)!.length,
            })),
            my_hand: hand.map(cardToString),
            current_turn: this.players[this.currentTurn].userId,
          },
        }))
      } catch {}
    }
  }

  private async robLandlord(data: { rob: boolean }, ws: WebSocket, msg_id?: string): Promise<void> {
    const p = this.findPlayer(ws)
    if (!p || this.gameState !== GameState.Calling) return
    if (this.players[this.currentTurn].userId !== p.userId) {
      ws.send(JSON.stringify({ msg_id, action: ActionRobLandlord, code: CodeNotYourTurn, message: errorMessages[CodeNotYourTurn] }))
      return
    }

    this.robBids.push(data.rob)
    this.robCount++
    this.broadcast({ action: PushRobLandlord, data: { user_id: p.userId, nickname: p.nickname, rob: data.rob } })
    ws.send(JSON.stringify({ msg_id, action: ActionRobLandlord, code: CodeOK, message: 'ok' }))

    if (this.robCount >= 3) {
      this.finishCalling()
    } else {
      this.currentTurn = (this.currentTurn + 1) % 3
      this.broadcast({ action: PushTurnChanged, data: { user_id: this.players[this.currentTurn].userId } })
    }
  }

  private finishCalling(): void {
    let landlordSeat = this.startSeat
    let found = false
    for (let i = 2; i >= 0; i--) {
      const idx = (this.startSeat + i) % 3
      if (this.robBids[idx]) {
        landlordSeat = idx
        found = true
        break
      }
    }

    if (!found) {
      this.resetGame()
      return
    }

    this.landlordId = this.players[landlordSeat].userId
    this.gameState = GameState.Playing
    this.currentTurn = landlordSeat
    this.lastPlay = null
    this.passCount = 0

    const landlordCards = this.hands.get(this.landlordId)!
    landlordCards.push(...this.bottomCards)
    landlordCards.sort((a, b) => a.rank - b.rank)

    for (const p of this.players) {
      try {
        p.ws.send(JSON.stringify({
          action: PushLandlordConfirm,
          data: {
            landlord_id: this.landlordId,
            bottom_cards: this.bottomCards.map(cardToString),
            my_hand: this.hands.get(p.userId)!.map(cardToString),
            current_turn: this.players[this.currentTurn].userId,
          },
        }))
      } catch {}
    }
  }

  private async playCard(data: { cards: string[] }, ws: WebSocket, msg_id?: string): Promise<void> {
    const p = this.findPlayer(ws)
    if (!p || this.gameState !== GameState.Playing) return
    if (this.players[this.currentTurn].userId !== p.userId) {
      ws.send(JSON.stringify({ msg_id, action: ActionPlayCard, code: CodeNotYourTurn, message: errorMessages[CodeNotYourTurn] }))
      return
    }

    const hand = this.hands.get(p.userId)!
    const playCards: Card[] = []
    const remaining = [...hand]

    if (data.cards.length === 0) {
      ws.send(JSON.stringify({ msg_id, action: ActionPlayCard, code: CodeInvalidCards, message: errorMessages[CodeInvalidCards] }))
      return
    }

    for (const cs of data.cards) {
      const c = stringToCard(cs)
      const idx = remaining.findIndex(r => r.suit === c.suit && r.rank === c.rank)
      if (idx === -1) {
        ws.send(JSON.stringify({ msg_id, action: ActionPlayCard, code: CodeInvalidCards, message: errorMessages[CodeInvalidCards] }))
        return
      }
      playCards.push(remaining[idx])
      remaining.splice(idx, 1)
    }

    const group = classifyCards(playCards)
    if (group.cardType === CardType.Invalid) {
      ws.send(JSON.stringify({ msg_id, action: ActionPlayCard, code: CodeInvalidCards, message: errorMessages[CodeInvalidCards] }))
      return
    }

    if (!canBeat(group, this.lastPlay ? {
      cards: [],
      cardType: this.lastPlay.cardType,
      rank: this.lastPlay.rank,
      length: this.lastPlay.length,
    } : null)) {
      ws.send(JSON.stringify({ msg_id, action: ActionPlayCard, code: CodeCardsNotBeat, message: errorMessages[CodeCardsNotBeat] }))
      return
    }

    this.hands.set(p.userId, remaining)
    this.lastPlay = { userId: p.userId, cards: data.cards, cardType: group.cardType, rank: group.rank, length: group.length }
    this.passCount = 0

    if (isBomb(group.cardType)) {
      this.multiplier *= 2
    }

    const remainCount = remaining.length
    this.broadcast({
      action: PushCardPlayed,
      data: { user_id: p.userId, nickname: p.nickname, cards: data.cards, card_type: CardType[group.cardType], remain: remainCount },
    })

    ws.send(JSON.stringify({ msg_id, action: ActionPlayCard, code: CodeOK, message: 'ok', data: { card_type: CardType[group.cardType] } }))

    if (remainCount === 0) {
      this.finishGame(p.userId)
      return
    }

    this.currentTurn = (this.currentTurn + 1) % 3
    this.broadcast({ action: PushTurnChanged, data: { user_id: this.players[this.currentTurn].userId } })
  }

  private async playerPass(ws: WebSocket, msg_id?: string): Promise<void> {
    const p = this.findPlayer(ws)
    if (!p || this.gameState !== GameState.Playing) return
    if (this.players[this.currentTurn].userId !== p.userId) {
      ws.send(JSON.stringify({ msg_id, action: ActionPass, code: CodeNotYourTurn, message: errorMessages[CodeNotYourTurn] }))
      return
    }
    if (!this.lastPlay) {
      ws.send(JSON.stringify({ msg_id, action: ActionPass, code: CodeInvalidParams, message: 'must play cards' }))
      return
    }

    this.passCount++
    this.broadcast({ action: PushPlayerPass, data: { user_id: p.userId, nickname: p.nickname } })
    ws.send(JSON.stringify({ msg_id, action: ActionPass, code: CodeOK, message: 'ok' }))

    if (this.passCount >= 2) {
      const lastPlayerIdx = this.players.findIndex(pl => pl.userId === this.lastPlay!.userId)
      this.currentTurn = lastPlayerIdx
      this.lastPlay = null
      this.passCount = 0
      this.broadcast({ action: PushTurnChanged, data: { user_id: this.players[this.currentTurn].userId, free_turn: true } })
    } else {
      this.currentTurn = (this.currentTurn + 1) % 3
      this.broadcast({ action: PushTurnChanged, data: { user_id: this.players[this.currentTurn].userId } })
    }
  }

  private finishGame(winnerId: string): void {
    this.gameState = GameState.Settling

    const scores: Record<string, number> = {}
    for (const p of this.players) {
      if (winnerId === this.landlordId) {
        scores[p.userId] = p.userId === this.landlordId ? this.multiplier * 2 : -this.multiplier
      } else {
        scores[p.userId] = p.userId === this.landlordId ? -this.multiplier * 2 : this.multiplier
      }
    }

    this.broadcast({
      action: PushGameOver,
      data: {
        winner: winnerId,
        landlord_id: this.landlordId,
        scores,
        multiplier: this.multiplier,
      },
    })
  }

  private async leaveRoom(ws: WebSocket, msg_id?: string): Promise<void> {
    const idx = this.players.findIndex(p => p.ws === ws)
    if (idx === -1) return

    const p = this.players[idx]
    this.players.splice(idx, 1)
    this.broadcast({ action: PushPlayerLeft, data: { user_id: p.userId } })
    ws.send(JSON.stringify({ msg_id, action: ActionLeaveRoom, code: CodeOK, message: 'ok' }))

    if (this.players.length === 0) {
      this.broadcast({ action: PushRoomClosed, data: { reason: 'all players left' } })
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    const p = this.findPlayer(ws)
    if (p) {
      p.isOnline = false
      this.broadcast({ action: PushPlayerLeft, data: { user_id: p.userId } })
    }
  }

  private resetGame(): void {
    this.gameState = GameState.Dealing
    this.hands.clear()
    this.bottomCards = []
    this.landlordId = ''
    this.lastPlay = null
    this.passCount = 0
    this.multiplier = 1
    for (const p of this.players) {
      p.isReady = false
    }
    this.startGame()
  }
}
