import { Application } from 'pixi.js'
import { SceneManager } from './core/SceneManager'
import { MainMenuScene } from './scenes/MainMenuScene'
import { RoomScene } from './scenes/RoomScene'
import { WebSocketManager } from './core/WebSocketManager'

const app = new Application()
const ws = new WebSocketManager()

async function init() {
  await app.init({
    resizeTo: window,
    backgroundColor: 0x1a6b3c,
    antialias: true,
  })

  document.getElementById('game')!.appendChild(app.canvas)

  const sm = new SceneManager(app)
  const roomScene = new RoomScene(app, sm, ws)
  const menuScene = new MainMenuScene(app, sm, ws, (roomId, userId, nickname) => {
    roomScene.connectToRoom(roomId, userId, nickname)
  })

  sm.add('menu', menuScene)
  sm.add('room', roomScene)

  sm.switchTo('menu')
}

init()
