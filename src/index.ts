import { Hono, type Context } from 'hono'
import { Env } from './types'
import { handleRegister, handleLogin } from './api/auth'
import { CodeServerError } from './protocol/error'

export { LobbyDO } from './lobby'
export { RoomDO } from './room'

type AppContext = Context<{ Bindings: Env }>

const app = new Hono<{ Bindings: Env }>()

function getLobbyStub(c: AppContext) {
  const doId = c.env.LOBBY_DO.idFromName('global')
  return c.env.LOBBY_DO.get(doId)
}

app.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade') || ''
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket', 426)
  }
  return getLobbyStub(c).fetch(c.req.raw)
})

app.post('/api/register', async (c) => {
  try {
    const data = await c.req.json() as { account: string; password: string; nickname: string }
    const result = await handleRegister(c.env.DB, data)
    return c.json({ code: 0, message: 'ok', data: result })
  } catch (e: any) {
    return c.json({ code: e.code || CodeServerError, message: e.message || 'server error' })
  }
})

app.post('/api/login', async (c) => {
  try {
    const data = await c.req.json() as { account: string; password: string }
    const result = await handleLogin(c.env.DB, data)
    return c.json({ code: 0, message: 'ok', data: result })
  } catch (e: any) {
    return c.json({ code: e.code || CodeServerError, message: e.message || 'server error' })
  }
})

app.get('/room/:id', async (c) => {
  const doId = c.env.ROOM_DO.idFromName('room:' + c.req.param('id'))
  const stub = c.env.ROOM_DO.get(doId)
  return stub.fetch(c.req.raw)
})

export default app
