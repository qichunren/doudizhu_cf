import { Application } from 'pixi.js'
import { SceneManager } from './core/SceneManager'
import { MainMenuScene } from './scenes/MainMenuScene'
import { RoomScene } from './scenes/RoomScene'
import { WebSocketManager } from './core/WebSocketManager'

interface UserInfo {
  userId: string
  token: string
  nickname: string
}

const STORAGE_KEY = 'doudizhu_user_info'
const ROOM_STORAGE_KEY = 'doudizhu_current_room_id'

function loadUserInfo(): UserInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as UserInfo
      if (data.userId && data.token && data.nickname) {
        return data
      }
    }
  } catch {}
  return null
}

function saveUserInfo(info: UserInfo) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(info))
}

function clearUserInfo() {
  localStorage.removeItem(STORAGE_KEY)
}

function loadRoomId(): string | null {
  return localStorage.getItem(ROOM_STORAGE_KEY)
}

function saveRoomId(roomId: string) {
  localStorage.setItem(ROOM_STORAGE_KEY, roomId)
}

function clearRoomId() {
  localStorage.removeItem(ROOM_STORAGE_KEY)
}

let userInfo: UserInfo | null = loadUserInfo()

const loginPage = document.getElementById('login-page')!
const gameDiv = document.getElementById('game')!
const accountInput = document.getElementById('account') as HTMLInputElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const nicknameInput = document.getElementById('nickname') as HTMLInputElement
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement
const loginError = document.getElementById('login-error')!

if (userInfo) {
  loginPage.classList.add('hidden')
  startGame()
}

async function handleLogin() {
  const account = accountInput.value.trim()
  const password = passwordInput.value.trim()
  const nickname = nicknameInput.value.trim() || account

  if (!account || !password) {
    loginError.textContent = '请输入账号和密码'
    return
  }

  loginBtn.disabled = true
  loginBtn.textContent = '登录中...'
  loginError.textContent = ''

  const ws = new WebSocketManager()
  try {
    await ws.connect('/ws')
    const res = await ws.send('login', { account, password })
    userInfo = {
      userId: res.user_id as string,
      token: res.token as string,
      nickname: (res.nickname as string) || nickname,
    }
    saveUserInfo(userInfo)
    ws.disconnect()
    startGame()
  } catch (e: any) {
    if (e.message === 'user not found') {
      try {
        const ws2 = new WebSocketManager()
        await ws2.connect('/ws')
        const res = await ws2.send('register', { account, password, nickname })
        userInfo = {
          userId: res.user_id as string,
          token: res.token as string,
          nickname: nickname,
        }
        saveUserInfo(userInfo)
        ws2.disconnect()
        startGame()
      } catch (e2: any) {
        loginError.textContent = '注册失败: ' + e2.message
      }
    } else {
      loginError.textContent = '登录失败: ' + e.message
    }
  } finally {
    loginBtn.disabled = false
    loginBtn.textContent = '登录 / 注册'
  }
}

async function startGame() {
  loginPage.classList.add('hidden')
  gameDiv.classList.remove('hidden')

  const app = new Application()
  const ws = new WebSocketManager()

  await app.init({
    resizeTo: window,
    backgroundColor: 0x1a6b3c,
    antialias: true,
  })

  gameDiv.appendChild(app.canvas)

  const sm = new SceneManager(app)
  const roomScene = new RoomScene(app, sm, ws)
  const menuScene = new MainMenuScene(app, sm, ws, userInfo!, (roomId) => {
    roomScene.connectToRoom(roomId, userInfo!.userId, userInfo!.nickname)
  })

  sm.add('menu', menuScene)
  sm.add('room', roomScene)

  const savedRoomId = loadRoomId()
  if (savedRoomId) {
    sm.switchTo('room')
    roomScene.connectToRoom(savedRoomId, userInfo!.userId, userInfo!.nickname)
  } else {
    sm.switchTo('menu')
  }
}

loginBtn.addEventListener('click', handleLogin)

accountInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') passwordInput.focus()
})
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin()
})
nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin()
})
