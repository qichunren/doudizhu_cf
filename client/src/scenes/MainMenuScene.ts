import { Application, Container, Text, TextStyle, Graphics } from 'pixi.js'
import { Scene, SceneManager } from '../core/SceneManager'
import { WebSocketManager } from '../core/WebSocketManager'
import { Button } from '../ui/Button'

function makeInput(placeholder: string, y: number, width: number, height: number): Container {
  const c = new Container()
  const bg = new Graphics()
  bg.roundRect(0, 0, width, height, 8)
  bg.fill({ color: 0xffffff })
  bg.stroke({ width: 1, color: 0xcccccc })
  c.addChild(bg)

  const text = new Text({
    text: placeholder,
    style: new TextStyle({ fontFamily: 'Arial', fontSize: 18, fill: '#999999' }),
  })
  text.x = 12
  text.y = height / 2 - 10
  c.addChild(text)
  c.addChild(text)
  return c
}

export class MainMenuScene extends Scene {
  private loginContainer = new Container()
  private menuContainer = new Container()

  private ws: WebSocketManager
  private sm: SceneManager
  private onJoinRoom: ((roomId: string, userId: string, nickname: string) => void) | null = null

  private userId = ''
  private token = ''
  private nickname = ''

  constructor(app: Application, sm: SceneManager, ws: WebSocketManager, onJoinRoom?: (roomId: string, userId: string, nickname: string) => void) {
    super(app)
    this.sm = sm
    this.ws = ws
    this.onJoinRoom = onJoinRoom || null

    this.buildLogin()
    this.buildMenu()

    this.container.addChild(this.loginContainer, this.menuContainer)
    this.showLogin()
  }

  private buildLogin(): void {
    const { width, height } = this.app.screen

    const title = new Text({
      text: '斗地主',
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 48, fill: '#ffd700', fontWeight: 'bold' }),
    })
    title.anchor.set(0.5)
    title.x = width / 2
    title.y = height * 0.15

    const accountInput = this.createInputField('账号', width / 2 - 120, height * 0.30, 240, 40)
    const passInput = this.createInputField('密码', width / 2 - 120, height * 0.30 + 52, 240, 40)
    const nickInput = this.createInputField('昵称(新用户自动注册)', width / 2 - 120, height * 0.30 + 104, 240, 40)

    const loginBtn = new Button({
      text: '登录/注册', width: 200,
      onClick: async () => {
        const account = accountInput.text
        const password = passInput.text
        const nickname = nickInput.text || account
        if (!account || !password) return

        try {
          await this.ws.connect(`/ws`)
          const res = await this.ws.send('login', { account, password })
          this.userId = res.user_id as string
          this.token = res.token as string
          this.nickname = (res.nickname as string) || nickname
          this.showMenu()
        } catch (e: any) {
          if (e.message === 'user not found') {
            const res = await this.ws.send('register', { account, password, nickname })
            this.userId = res.user_id as string
            this.token = res.token as string
            this.nickname = nickname
            this.showMenu()
          } else {
            alert('登录失败: ' + e.message)
          }
        }
      },
    })
    loginBtn.x = (width - loginBtn.width) / 2
    loginBtn.y = height * 0.30 + 170

    this.loginContainer.addChild(title, accountInput, passInput, nickInput, loginBtn)
  }

  private createInputField(placeholder: string, x: number, y: number, w: number, h: number): Text {
    const bg = new Graphics()
    bg.roundRect(0, 0, w, h, 8)
    bg.fill({ color: 0xffffff })
    bg.stroke({ width: 1, color: 0xcccccc })

    const t = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 16, fill: '#333333' }),
    })
    t.x = 10
    t.y = h / 2 - 10

    const c = new Container()
    c.addChild(bg, t)
    c.x = x
    c.y = y
    c.eventMode = 'static'
    c.cursor = 'text'

    let active = false
    c.on('pointertap', () => { active = true })
    c.on('pointertapoutside', () => { active = false })

    window.addEventListener('keydown', (e) => {
      if (!active) return
      if (e.key === 'Backspace') {
        t.text = t.text.slice(0, -1)
      } else if (e.key.length === 1) {
        t.text += e.key
      }
    })

    this.loginContainer.addChild(c)
    return t
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

    const userInfo = new Text({ text: '', style: new TextStyle({ fontFamily: 'Arial', fontSize: 18, fill: '#ffffff' }) })
    userInfo.anchor.set(0.5)
    userInfo.x = width / 2
    userInfo.y = height * 0.20

    const createBtn = new Button({
      text: '创建房间', width: 240,
      onClick: async () => {
        try {
          const res = await this.ws.send('create_room', { title: '新手房', user_id: this.userId, token: this.token })
          const roomId = res.room_id as string
          this.ws.disconnect()
          if (this.onJoinRoom) {
            this.onJoinRoom(roomId, this.userId, this.nickname)
            this.sm.switchTo('room')
          }
        } catch (e: any) {
          alert('创建失败: ' + e.message)
        }
      },
    })
    createBtn.x = (width - createBtn.width) / 2
    createBtn.y = height * 0.35

    const roomListTitle = new Text({
      text: '房间列表', style: new TextStyle({ fontFamily: 'Arial', fontSize: 22, fill: '#ffffff' }),
    })
    roomListTitle.anchor.set(0.5)
    roomListTitle.x = width / 2
    roomListTitle.y = height * 0.48

    const roomContainer = new Container()
    roomContainer.x = width / 2 - 150
    roomContainer.y = height * 0.52

    this.menuContainer.addChild(title, userInfo, createBtn, roomListTitle, roomContainer)

    // Load room list
    this.loadRoomList(roomContainer, height)
  }

  private async loadRoomList(container: Container, screenHeight: number): Promise<void> {
    try {
      const res = await this.ws.send('get_room_list')
      const rooms = res.rooms as any[] || []
      container.removeChildren()

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
          if (this.onJoinRoom) {
            this.onJoinRoom(roomId, this.userId, this.nickname)
            this.sm.switchTo('room')
          }
          } catch (e: any) {
            alert('加入失败: ' + e.message)
          }
        })

        container.addChild(btn)
      })
    } catch (e) {
      console.error('load room list failed', e)
    }
  }

  private showLogin(): void {
    this.loginContainer.visible = true
    this.menuContainer.visible = false
  }

  private showMenu(): void {
    this.loginContainer.visible = false
    this.menuContainer.visible = true
  }

  onResize(): void {
    // Relayout handled in constructor for simplicity
  }
}
