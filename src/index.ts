import { Hono } from 'hono'
import { Env } from './types'

export { LobbyDO } from './lobby'
export { RoomDO } from './room'

const app = new Hono<{ Bindings: Env }>()

app.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade') || ''
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket', 426)
  }

  const doId = c.env.LOBBY_DO.idFromName('global')
  const stub = c.env.LOBBY_DO.get(doId)
  return stub.fetch(c.req.raw)
})

app.get('/room/:id', async (c) => {
  const doId = c.env.ROOM_DO.idFromName('room:' + c.req.param('id'))
  const stub = c.env.ROOM_DO.get(doId)
  return stub.fetch(c.req.raw)
})

export default app
