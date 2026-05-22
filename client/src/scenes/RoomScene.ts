import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { Scene, SceneManager } from '../core/SceneManager'
import { WebSocketManager } from '../core/WebSocketManager'
import { Button } from '../ui/Button'

const ROOM_STORAGE_KEY = 'doudizhu_current_room_id'

interface PlayerView {
  userId: string
  nickname: string
  seat: number
  handCount: number
  isLandlord: boolean
  ready: boolean
  online: boolean
}

export class RoomScene extends Scene {
  private ws: WebSocketManager
  private sm: SceneManager

  private roomId = ''
  private userId = ''
  private nickname = ''
  private myHand: string[] = []
  private players: PlayerView[] = []
  private landlordId = ''
  private bottomCards: string[] = []
  private currentTurn = ''
  private gameState = ''
  private lastPlay: { userId: string; cards: string[]; cardType: string } | null = null
  private multiplier = 1

  private statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'Arial', fontSize: 18, fill: '#ffffff' }) })
  private handContainer = new Container()
  private playArea = new Container()
  private actionContainer = new Container()
  private playerLabels: Text[] = []
  private selectedCards = new Set<number>()
  private cardSprites: Container[] = []
  private infoText = new Text({ text: '', style: new TextStyle({ fontFamily: 'Arial', fontSize: 14, fill: '#cccccc' }) })
  private readyBtn: Button | null = null

  constructor(app: Application, sm: SceneManager, ws: WebSocketManager) {
    super(app)
    this.sm = sm
    this.ws = ws

    this.infoText.anchor.set(0.5)
    this.infoText.x = app.screen.width / 2
    this.infoText.y = app.screen.height / 2

    this.statusText.anchor.set(0.5)
    this.statusText.x = app.screen.width / 2
    this.statusText.y = app.screen.height * 0.12

    this.container.addChild(this.statusText, this.playArea, this.handContainer, this.actionContainer, this.infoText)
  }

  connectToRoom(roomId: string, userId: string, nickname: string): void {
    this.roomId = roomId
    this.userId = userId
    this.nickname = nickname
    this.myHand = []
    this.players = []
    this.landlordId = ''
    this.bottomCards = []
    this.currentTurn = ''
    this.gameState = ''
    this.lastPlay = null
    this.selectedCards.clear()
    this.cardSprites = []
    this.playerLabels = []

    this.ws.connect(`/room/${roomId}`).then(async () => {
      this.ws.onPush('player_joined', (d) => this.onPlayerJoined(d))
      this.ws.onPush('player_left', (d) => this.onPlayerLeft(d))
      this.ws.onPush('player_ready', (d) => this.onPlayerReady(d))
      this.ws.onPush('game_start', (d) => this.onGameStart(d))
      this.ws.onPush('landlord_confirmed', (d) => this.onLandlordConfirmed(d))
      this.ws.onPush('rob_landlord', (d) => this.onRobLandlord(d))
      this.ws.onPush('card_played', (d) => this.onCardPlayed(d))
      this.ws.onPush('player_pass', (d) => this.onPlayerPass(d))
      this.ws.onPush('turn_changed', (d) => this.onTurnChanged(d))
      this.ws.onPush('game_over', (d) => this.onGameOver(d))

      const resp = await this.ws.send('join_room_confirm', { user_id: userId, nickname })
      const snapshot = resp as any
      if (snapshot.players) {
        this.players = (snapshot.players as any[]).map((p: any) => ({
          userId: p.user_id, nickname: p.nickname, seat: p.seat,
          handCount: p.hand_count || 0, isLandlord: p.is_landlord || false,
          ready: p.ready || false, online: p.online !== false,
        }))
        this.renderPlayers()
      }

      if (snapshot.my_hand) {
        this.myHand = snapshot.my_hand as string[]
        this.landlordId = (snapshot.landlord_id as string) || ''
        this.bottomCards = (snapshot.bottom_cards as string[]) || []
        this.currentTurn = (snapshot.current_turn as string) || ''
        this.gameState = (snapshot.status as string) || ''
        this.lastPlay = snapshot.last_play ? { userId: (snapshot.last_play as any).user_id, cards: (snapshot.last_play as any).cards, cardType: (snapshot.last_play as any).cardType } : null
        this.multiplier = (snapshot.multiplier as number) || 1

        this.renderHand()
        this.renderPlayers()
        this.renderBottomCards(this.bottomCards)
        if (this.lastPlay) {
          const p = this.players.find(p => p.userId === this.lastPlay!.userId)
          this.renderPlayedCards(p?.nickname || '', this.lastPlay.cards, this.lastPlay.cardType)
        }
        this.renderPlayButtons()
      } else {
        const me = this.players.find(p => p.userId === userId)
        if (snapshot.status && snapshot.status !== 'waiting') {
          this.gameState = snapshot.status
        }
        if (!me?.ready && (!snapshot.status || snapshot.status === 'waiting')) {
          this.renderReady()
        }
      }

      localStorage.setItem(ROOM_STORAGE_KEY, this.roomId)
    }).catch((e) => {
      localStorage.removeItem(ROOM_STORAGE_KEY)
      this.ws.disconnect()
      this.sm.switchTo('menu')
    })
  }

  private renderReady(): void {
    this.actionContainer.removeChildren()
    this.readyBtn = new Button({ text: '准备', width: 160, onClick: () => {
      this.ws.send('ready', {})
      this.readyBtn!.visible = false
    }})
    this.readyBtn.x = (this.app.screen.width - 160) / 2
    this.readyBtn.y = this.app.screen.height * 0.75
    this.actionContainer.addChild(this.readyBtn)
  }

  private onPlayerJoined(d: any): void {
    this.infoText.text = `${d.nickname} 加入了房间`
    if (!this.players.find(p => p.userId === d.user_id)) {
      this.players.push({ userId: d.user_id, nickname: d.nickname, seat: d.seat, handCount: 0, isLandlord: false, ready: false, online: true })
    }
    this.renderPlayers()
  }

  private onPlayerLeft(d: any): void {
    this.players = this.players.filter(p => p.userId !== d.user_id)
    this.renderPlayers()
  }

  private onPlayerReady(d: any): void {
    const p = this.players.find(p => p.userId === d.user_id)
    if (p) p.ready = true
    this.infoText.text = `${d.nickname} 已准备`
  }

  private onGameStart(d: any): void {
    this.gameState = 'calling'
    this.myHand = d.my_hand as string[]
    this.currentTurn = d.current_turn as string
    this.players = (d.players as any[]).map(p => ({
      ...p, isLandlord: false, ready: true, online: true,
    }))
    this.renderHand()
    this.renderPlayers()
    this.renderBottomCards([])
    this.renderCallButtons()
  }

  private onRobLandlord(d: any): void {
    this.infoText.text = `${d.nickname} ${d.rob ? '抢地主!' : '不抢'}`
    this.renderCallButtons()
  }

  private onLandlordConfirmed(d: any): void {
    this.gameState = 'playing'
    this.landlordId = d.landlord_id as string
    this.bottomCards = d.bottom_cards as string[] || []
    if (d.my_hand) this.myHand = d.my_hand as string[]
    this.currentTurn = d.current_turn as string

    this.renderHand()
    this.renderPlayers()
    this.renderBottomCards(this.bottomCards)
    this.actionContainer.removeChildren()
    this.renderPlayButtons()
  }

  private onCardPlayed(d: any): void {
    this.lastPlay = { userId: d.user_id as string, cards: d.cards as string[], cardType: d.card_type as string }
    this.playArea.removeChildren()
    this.renderPlayedCards(d.nickname as string, d.cards as string[], d.card_type as string)

    const p = this.players.find(p => p.userId === d.user_id)
    if (p) p.handCount = d.remain as number
    this.renderPlayers()
  }

  private onPlayerPass(d: any): void {
    this.playArea.removeChildren()
    const t = new Text({
      text: `${d.nickname} 不出`,
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 20, fill: '#ff9999' }),
    })
    t.anchor.set(0.5)
    t.x = this.app.screen.width / 2
    t.y = this.app.screen.height / 2 - 30
    this.playArea.addChild(t)
    setTimeout(() => {
      t.destroy()
    }, 1500)
  }

  private onTurnChanged(d: any): void {
    this.currentTurn = d.user_id as string
    if (d.free_turn) {
      this.lastPlay = null
      this.playArea.removeChildren()
    }
    this.renderPlayButtons()
  }

  private onGameOver(d: any): void {
    this.gameState = 'settling'
    this.actionContainer.removeChildren()

    const isWin = d.winner === this.userId
    const resultText = new Text({
      text: isWin ? '你赢了!' : '你输了',
      style: new TextStyle({
        fontFamily: 'Arial', fontSize: 48, fontWeight: 'bold',
        fill: isWin ? '#ffd700' : '#ff4444',
      }),
    })
    resultText.anchor.set(0.5)
    resultText.x = this.app.screen.width / 2
    resultText.y = this.app.screen.height / 2

    const scores = d.scores as Record<string, number>
    const scoreText = new Text({
      text: `分数变化: ${scores[this.userId] || 0}`,
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 24, fill: '#ffffff' }),
    })
    scoreText.anchor.set(0.5)
    scoreText.x = this.app.screen.width / 2
    scoreText.y = this.app.screen.height / 2 + 50

    const backBtn = new Button({
      text: '返回大厅', width: 200,
      onClick: () => {
        localStorage.removeItem(ROOM_STORAGE_KEY)
        this.ws.disconnect()
        this.sm.switchTo('menu')
      },
    })
    backBtn.x = (this.app.screen.width - 200) / 2
    backBtn.y = this.app.screen.height * 0.7

    this.playArea.addChild(resultText, scoreText, backBtn)
  }

  private renderHand(): void {
    this.handContainer.removeChildren()
    this.cardSprites = []

    const sorted = [...new Set(this.myHand)].sort((a, b) => {
      const rankOrder: Record<string, number> = {
        '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
        '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
        'XJ': 16, 'DJ': 17,
      }
      const aRank = rankOrder[a.replace(/[SHCD]/, '')] || 0
      const bRank = rankOrder[b.replace(/[SHCD]/, '')] || 0
      return aRank - bRank
    })

    const cardWidth = 60
    const cardHeight = 85
    const spacing = 40
    const totalWidth = sorted.length * spacing
    const startX = (this.app.screen.width - totalWidth) / 2
    const y = this.app.screen.height - 100

    sorted.forEach((card, i) => {
      const c = this.createCardSprite(card, cardWidth, cardHeight)
      c.x = startX + i * spacing
      c.y = y
      c.eventMode = 'static'
      c.cursor = 'pointer'

      const idx = i
      c.on('pointertap', () => {
        if (this.selectedCards.has(idx)) {
          this.selectedCards.delete(idx)
          c.y = y
        } else {
          this.selectedCards.add(idx)
          c.y = y - 20
        }
      })

      this.handContainer.addChild(c)
      this.cardSprites.push(c)
    })
  }

  private createCardSprite(card: string, w: number, h: number): Container {
    const c = new Container()
    const bg = new Graphics()
    bg.roundRect(0, 0, w, h, 6)
    bg.fill({ color: 0xffffff })
    bg.stroke({ width: 1, color: 0x333333 })

    const isJoker = card === 'XJ' || card === 'DJ'
    const isRed = card.includes('H') || card.includes('D') || card === 'DJ'
    const display = card.replace(/[SHCD]/, (m) => {
      return { S: '♠', H: '♥', C: '♣', D: '♦' }[m] || ''
    })

    const t = new Text({
      text: display,
      style: new TextStyle({
        fontFamily: 'Arial', fontSize: isJoker ? 14 : 16,
        fill: isRed ? '#cc0000' : '#000000',
        fontWeight: 'bold',
      }),
    })
    t.x = 4
    t.y = 4
    c.addChild(bg, t)
    return c
  }

  private renderPlayers(): void {
    for (const label of this.playerLabels) {
      label.destroy()
    }
    this.playerLabels = []

    const { width, height } = this.app.screen
    this.players.forEach((p, i) => {
      let x = 0, y = 0
      if (i === 0) { x = width / 2; y = 20 }
      else if (i === 1) { x = 20; y = height / 2 }
      else { x = width - 20; y = height / 2 }

      const isLandlord = p.userId === this.landlordId
      const label = new Text({
        text: `${p.nickname} (${p.handCount})${isLandlord ? ' 👑' : ''}${p.userId === this.currentTurn ? ' ▶' : ''}`,
        style: new TextStyle({
          fontFamily: 'Arial', fontSize: 16,
          fill: p.userId === this.userId ? '#ffd700' : '#ffffff',
        }),
      })
      label.anchor.set(i === 0 ? 0.5 : i === 1 ? 0 : 1, 0.5)
      label.x = x
      label.y = y
      this.playerLabels.push(label)
      this.container.addChild(label)
    })
  }

  private renderBottomCards(cards: string[]): void {
    const { width, height } = this.app.screen
    const startX = width / 2 - (cards.length * 35) / 2
    cards.forEach((card, i) => {
      const c = this.createCardSprite(card, 50, 70)
      c.x = startX + i * 38
      c.y = height / 2 - 80
      this.playArea.addChild(c)
    })
  }

  private renderPlayedCards(nickname: string, cards: string[], cardType: string): void {
    const { width, height } = this.app.screen
    const startX = width / 2 - (cards.length * 35) / 2
    cards.forEach((card, i) => {
      const c = this.createCardSprite(card, 50, 70)
      c.x = startX + i * 35
      c.y = height / 2 - 30
      this.playArea.addChild(c)
    })
    const t = new Text({
      text: `${nickname}: ${cardType}`,
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 14, fill: '#cccccc' }),
    })
    t.anchor.set(0.5)
    t.x = width / 2
    t.y = height / 2 + 50
    this.playArea.addChild(t)
  }

  private renderCallButtons(): void {
    if (this.currentTurn !== this.userId) {
      this.actionContainer.removeChildren()
      return
    }
    if (this.gameState !== 'calling') return

    this.actionContainer.removeChildren()
    const { width, height } = this.app.screen

    const robBtn = new Button({ text: '抢地主', width: 120, onClick: () => {
      this.ws.send('rob_landlord', { rob: true })
      this.actionContainer.removeChildren()
    }})
    robBtn.x = width / 2 - 130
    robBtn.y = height * 0.75

    const passBtn = new Button({ text: '不抢', width: 120, onClick: () => {
      this.ws.send('rob_landlord', { rob: false })
      this.actionContainer.removeChildren()
    }})
    passBtn.x = width / 2 + 10
    passBtn.y = height * 0.75

    this.actionContainer.addChild(robBtn, passBtn)
  }

  private renderPlayButtons(): void {
    if (this.currentTurn !== this.userId || this.gameState !== 'playing') return

    this.actionContainer.removeChildren()
    const { width, height } = this.app.screen

    const playBtn = new Button({ text: '出牌', width: 120, onClick: () => {
      const cards = [...this.selectedCards].sort((a, b) => a - b).map(i => this.myHand[i])
      if (cards.length === 0) return
      this.ws.send('play_card', { cards }).then(() => {
        this.selectedCards.clear()
        this.renderHand()
      }).catch((e) => {
        this.infoText.text = e.message
      })
    }})
    playBtn.x = width / 2 - 130
    playBtn.y = height * 0.75

    const passBtn = new Button({ text: '不出', width: 120, onClick: () => {
      this.ws.send('pass', {})
    }})
    passBtn.x = width / 2 + 10
    passBtn.y = height * 0.75

    this.actionContainer.addChild(playBtn, passBtn)
  }

  onResize(): void {
    if (this.gameState) {
      this.renderHand()
      this.renderPlayers()
    }
  }
}
