import { Application, Container, Text, TextStyle, Graphics } from 'pixi.js'
import { Scene, SceneManager } from '../core/SceneManager'
import { WebSocketManager } from '../core/WebSocketManager'
import { Button } from '../ui/Button'

export class MainMenuScene extends Scene {
  private menuContainer = new Container()
  private roomContainer = new Container()
  private userInfoText = new Text({
    text: '',
    style: new TextStyle({ fontFamily: 'Arial', fontSize: 18, fill: '#ffffff' }),
  })

  private ws: WebSocketManager
  private sm: SceneManager
  private userId: string
  private token: string
  private nickname: string
  private onJoinRoom: (roomId: string) => void

  constructor(
    app: Application,
    sm: SceneManager,
    ws: WebSocketManager,
    userInfo: { userId: string; token: string; nickname: string },
    onJoinRoom: (roomId: string) => void,
  ) {
    super(app)
    this.sm = sm
    this.ws = ws
    this.userId = userInfo.userId
    this.token = userInfo.token
    this.nickname = userInfo.nickname
    this.onJoinRoom = onJoinRoom

    this.buildMenu()
    this.container.addChild(this.menuContainer)
  }

  async onEnter(): Promise<void> {
    try {
      await this.ws.connect('/ws')
      this.loadRoomList()
    } catch (e) {
      console.error('Failed to connect to lobby', e)
    }
  }

  private buildMenu(): void {
    const { width, height } = this.app.screen

    const title = new Text({
      text: '斗地主',
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 48, fill: '#ffd700', fontWeight: 'bold' }),
    })
    title.anchor.set(0.5)
    title.x = width / 2
    title.y = height * 0.10

    this.userInfoText.text = `玩家: ${this.nickname}`
    this.userInfoText.anchor.set(0.5)
    this.userInfoText.x = width / 2
    this.userInfoText.y = height * 0.20

    const createBtn = new Button({
      text: '创建房间', width: 240,
      onClick: async () => {
        try {
          const res = await this.ws.send('create_room', { title: '新手房', user_id: this.userId, token: this.token })
          const roomId = res.room_id as string
          this.ws.disconnect()
          this.onJoinRoom(roomId)
          this.sm.switchTo('room')
        } catch (e: any) {
          alert('创建失败: ' + e.message)
        }
      },
    })
    createBtn.x = (width - createBtn.width) / 2
    createBtn.y = height * 0.35

    const roomListTitle = new Text({
      text: '房间列表',
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 22, fill: '#ffffff' }),
    })
    roomListTitle.anchor.set(0.5)
    roomListTitle.x = width / 2
    roomListTitle.y = height * 0.48

    this.roomContainer.x = width / 2 - 150
    this.roomContainer.y = height * 0.52

    this.menuContainer.addChild(title, this.userInfoText, createBtn, roomListTitle, this.roomContainer)
  }

  private async loadRoomList(): Promise<void> {
    try {
      const res = await this.ws.send('get_room_list')
      const rooms = res.rooms as any[] || []
      this.roomContainer.removeChildren()

      if (rooms.length === 0) {
        const emptyText = new Text({
          text: '暂无房间，点击上方创建',
          style: new TextStyle({ fontFamily: 'Arial', fontSize: 16, fill: '#aaaaaa' }),
        })
        this.roomContainer.addChild(emptyText)
        return
      }

      rooms.forEach((room, i) => {
        const bg = new Graphics()
        bg.roundRect(0, 0, 300, 50, 8)
        bg.fill({ color: 0x2d8c4e })

        const text = new Text({
          text: `${room.title} (${room.player_count}/3)`,
          style: new TextStyle({ fontFamily: 'Arial', fontSize: 16, fill: '#ffffff' }),
        })
        text.x = 12
        text.y = 15

        const btn = new Container()
        btn.addChild(bg, text)
        btn.y = i * 56
        btn.eventMode = 'static'
        btn.cursor = 'pointer'

        btn.on('pointertap', async () => {
          try {
            const res = await this.ws.send('join_room', { room_id: room.room_id, user_id: this.userId, token: this.token })
            const roomId = res.room_id as string
            this.ws.disconnect()
            this.onJoinRoom(roomId)
            this.sm.switchTo('room')
          } catch (e: any) {
            alert('加入失败: ' + e.message)
          }
        })

        this.roomContainer.addChild(btn)
      })
    } catch (e) {
      console.error('load room list failed', e)
    }
  }

  onResize(): void {
  }
}
