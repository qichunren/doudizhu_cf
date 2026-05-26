# Room Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add room password, owner controls (kick/close), auto-cleanup on empty, and room list QoL improvements.

**Architecture:** Extend existing LobbyDO/RoomDO with new fields and actions. RoomDO calls back to LobbyDO via HTTP fetch for room removal. Client adds password prompt, auto-refresh, and owner UI.

**Tech Stack:** Cloudflare Workers + Durable Objects, Pixi.js client, WebSocket protocol

---

### Task 1: Add action constants for kick/close

**Files:**
- Modify: `src/protocol/action.ts:30`

- [ ] **Add new action and push constants**

Edit `src/protocol/action.ts` — add after `ActionReconnect`:

```typescript
export const ActionKickPlayer = 'kick_player'
export const ActionCloseRoom = 'close_room'
export const ActionRemoveRoom = 'remove_room'
```

Add after `PushRobLandlord`:

```typescript
export const PushPlayerKicked = 'player_kicked'
```

- [ ] **Verify the file reads correctly**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No type errors (or only unrelated errors).

- [ ] **Commit**

```bash
git add src/protocol/action.ts
git commit -m "feat: add kick_player, close_room, remove_room action constants"
```

---

### Task 2: LobbyDO — RoomMeta password/owner fields + create/join password logic

**Files:**
- Modify: `src/lobby.ts`

- [ ] **Update RoomMeta interface**

In `src/lobby.ts`, replace the `RoomMeta` interface with:

```typescript
interface RoomMeta {
  roomId: string
  title: string
  password: string
  ownerId: string
  ownerNickname: string
  playerCount: number
  maxPlayers: number
  status: string
  needPassword: boolean
  doId: string
}
```

- [ ] **Update createRoom to accept password and nickname**

Replace the `createRoom` method signature and body:

```typescript
private async createRoom(data: { title?: string; password?: string; nickname: string; user_id: string; token: string }): Promise<Record<string, unknown>> {
  const session = await this.env.DB.prepare(
    'SELECT token FROM sessions WHERE user_id = ?',
  ).bind(data.user_id).first<{ token: string }>()
  if (!session || session.token !== data.token) {
    throw { code: CodeUnauthorized, message: errorMessages[CodeUnauthorized] }
  }

  const roomId = generateId('r')
  const doId = `room:${roomId}`
  const hashedPassword = data.password ? await hashPassword(data.password) : ''
  const meta: RoomMeta = {
    roomId, title: data.title || '新手房',
    password: hashedPassword,
    ownerId: data.user_id,
    ownerNickname: data.nickname || '',
    playerCount: 0, maxPlayers: 3, status: 'waiting',
    needPassword: !!data.password, doId,
  }

  this.rooms.set(roomId, meta)
  await this.state.storage?.put(`room:${roomId}`, meta)

  return { room_id: roomId, do_id: doId, need_password: !!data.password }
}
```

- [ ] **Update joinRoom to check password**

Replace the `joinRoom` method:

```typescript
private async joinRoom(data: { room_id: string; password?: string; user_id: string; token: string }): Promise<Record<string, unknown>> {
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
  if (meta.needPassword) {
    if (!data.password) {
      throw { code: CodeRoomPasswordWrong, message: errorMessages[CodeRoomPasswordWrong] }
    }
    const inputHash = await hashPassword(data.password)
    if (inputHash !== meta.password) {
      throw { code: CodeRoomPasswordWrong, message: errorMessages[CodeRoomPasswordWrong] }
    }
  }

  meta.playerCount++
  this.rooms.set(data.room_id, meta)
  await this.state.storage?.put(`room:${data.room_id}`, meta)

  return { room_id: data.room_id, do_id: meta.doId }
}
```

- [ ] **Update getRoomList to include owner_nickname**

Replace the `getRoomList` method's map to add `owner_nickname`:

```typescript
private getRoomList(): Record<string, unknown> {
  const roomList = Array.from(this.rooms.values())
    .filter(r => r.status !== 'closed')
    .map(r => ({
      room_id: r.roomId,
      title: r.title,
      owner_id: r.ownerId,
      owner_nickname: r.ownerNickname,
      player_count: r.playerCount,
      max_players: r.maxPlayers,
      status: r.status,
      need_password: r.needPassword,
      do_id: r.doId,
    }))
  return { rooms: roomList, total: roomList.length }
}
```

- [ ] **Update LobbyDO fetch to handle internal remove_room calls**

Replace the `fetch` method to accept both WebSocket and JSON:

```typescript
async fetch(request: Request): Promise<Response> {
  if (request.headers.get('Upgrade') === 'websocket') {
    return this.handleWebSocket(request)
  }
  // Internal JSON API (called by RoomDO)
  const body = await request.json() as { action: string; room_id: string }
  if (body.action === ActionRemoveRoom) {
    const meta = this.rooms.get(body.room_id)
    if (meta) {
      meta.status = 'closed'
      this.rooms.delete(body.room_id)
      await this.state.storage?.delete(`room:${body.room_id}`)
    }
    return Response.json({ code: CodeOK })
  }
  return Response.json({ code: CodeInvalidAction }, { status: 400 })
}
```

Add the `handleWebSocket` method extracted from the current fetch:

```typescript
private async handleWebSocket(request: Request): Promise<Response> {
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

  return new Response(null, { status: 101, webSocket: client })
}
```

- [ ] **Import hashPassword at top of file**

Add to imports:

```typescript
import { generateId, hashPassword } from './api/utils'
import { ActionGetRoomList, ActionCreateRoom, ActionJoinRoom, ActionRemoveRoom } from './protocol/action'
```

- [ ] **Verify types**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No type errors.

- [ ] **Commit**

```bash
git add src/lobby.ts
git commit -m "feat: add room password support and removeRoom endpoint in LobbyDO"
```

---

### Task 3: RoomDO — owner tracking, kick, close, auto-close

**Files:**
- Modify: `src/room.ts`

- [ ] **Add ownerId field and import new action constants**

Add to imports in `src/room.ts`:

```typescript
import {
  ActionJoinRoomConfirm, ActionReady, ActionLeaveRoom,
  ActionRobLandlord, ActionPlayCard, ActionPass,
  ActionKickPlayer, ActionCloseRoom,
  PushPlayerJoined, PushPlayerLeft, PushPlayerReady,
  PushGameStart, PushLandlordConfirm, PushCardPlayed,
  PushPlayerPass, PushTurnChanged, PushGameOver,
  PushRoomClosed, PushRobLandlord, PushPlayerKicked,
} from './protocol/action'
```

Add `ownerId` field to RoomDO class (near `roomId`):

```typescript
private ownerId = ''
```

- [ ] **Update joinRoomConfirm to detect owner**

In `joinRoomConfirm`, after seat assignment, add owner detection. When the first player joins (players.length was 0 before push), they're the owner:

```typescript
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
  const isOwner = this.players.length === 0 // first player is owner
  if (isOwner) {
    this.ownerId = data.user_id
  }
  const player: PlayerInfo = {
    userId: data.user_id, nickname: data.nickname,
    seat, isReady: false, isOnline: true, ws,
  }
  this.players.push(player)

  ws.send(JSON.stringify({ msg_id, action: ActionJoinRoomConfirm, code: CodeOK, message: 'ok', data: this.getRoomSnapshot(data.user_id) }))
  this.broadcast({ action: PushPlayerJoined, data: { user_id: data.user_id, nickname: data.nickname, seat, is_owner: isOwner } }, ws)
}
```

- [ ] **Update getRoomSnapshot to include is_owner**

In `getRoomSnapshot`, add `is_owner` field to player entries:

```typescript
const snap: Record<string, unknown> = {
  room_id: this.roomId,
  players: this.players.map(p => ({
    user_id: p.userId, nickname: p.nickname, seat: p.seat,
    hand_count: this.hands.get(p.userId)?.length || 0,
    is_landlord: p.userId === this.landlordId,
    is_owner: p.userId === this.ownerId,
    ready: p.isReady,
    online: p.isOnline,
  })),
  // ... rest unchanged
}
```

- [ ] **Add kick_player handler**

Add before `handleDisconnect`:

```typescript
private async kickPlayer(data: { user_id: string; target_user_id: string }, ws: WebSocket, msg_id?: string): Promise<void> {
  const p = this.findPlayer(ws)
  if (!p || p.userId !== this.ownerId) {
    ws.send(JSON.stringify({ msg_id, action: ActionKickPlayer, code: CodeUnauthorized, message: errorMessages[CodeUnauthorized] }))
    return
  }
  if (data.target_user_id === this.ownerId) {
    ws.send(JSON.stringify({ msg_id, action: ActionKickPlayer, code: CodeInvalidParams, message: 'cannot kick yourself' }))
    return
  }

  const targetIdx = this.players.findIndex(pl => pl.userId === data.target_user_id)
  if (targetIdx === -1) {
    ws.send(JSON.stringify({ msg_id, action: ActionKickPlayer, code: CodeInvalidParams, message: 'player not found' }))
    return
  }

  const target = this.players[targetIdx]
  try {
    target.ws.send(JSON.stringify({ action: PushPlayerKicked, data: { user_id: target.userId, nickname: target.nickname } }))
    target.ws.close()
  } catch {}
  this.players.splice(targetIdx, 1)
  this.broadcast({ action: PushPlayerLeft, data: { user_id: target.userId } })
  ws.send(JSON.stringify({ msg_id, action: ActionKickPlayer, code: CodeOK, message: 'ok' }))

  if (this.players.length === 0) {
    this.closeRoomInternal('room closed (all players left)')
  }
}
```

- [ ] **Add close_room handler**

```typescript
private async closeRoom(ws: WebSocket, msg_id?: string): Promise<void> {
  const p = this.findPlayer(ws)
  if (!p || p.userId !== this.ownerId) {
    ws.send(JSON.stringify({ msg_id, action: ActionCloseRoom, code: CodeUnauthorized, message: errorMessages[CodeUnauthorized] }))
    return
  }

  this.closeRoomInternal('room closed by owner')
  ws.send(JSON.stringify({ msg_id, action: ActionCloseRoom, code: CodeOK, message: 'ok' }))
}

private async closeRoomInternal(reason: string): Promise<void> {
  this.broadcast({ action: PushRoomClosed, data: { reason } })
  for (const pl of this.players) {
    try { pl.ws.close() } catch {}
  }
  this.players = []
  this.notifyLobbyRemoveRoom()
}

private async notifyLobbyRemoveRoom(): Promise<void> {
  try {
    const doId = this.env.LOBBY_DO.idFromName('global')
    const stub = this.env.LOBBY_DO.get(doId)
    await stub.fetch('http://internal', {
      method: 'POST',
      body: JSON.stringify({ action: ActionRemoveRoom, room_id: this.roomId }),
    })
  } catch (e) {
    console.error('Failed to notify LobbyDO:', e)
  }
}
```

- [ ] **Update leaveRoom to notify LobbyDO when empty**

Modify `leaveRoom` — after removing player, check if empty and notify:

```typescript
private async leaveRoom(ws: WebSocket, msg_id?: string): Promise<void> {
  const idx = this.players.findIndex(p => p.ws === ws)
  if (idx === -1) return

  const p = this.players[idx]
  this.players.splice(idx, 1)
  this.broadcast({ action: PushPlayerLeft, data: { user_id: p.userId } })
  ws.send(JSON.stringify({ msg_id, action: ActionLeaveRoom, code: CodeOK, message: 'ok' }))

  if (this.players.length === 0) {
    await this.notifyLobbyRemoveRoom()
  }
}
```

- [ ] **Add kick/close cases to handleMessage switch**

In `handleMessage`, add after `case ActionPass:`:

```typescript
case ActionKickPlayer:
  return this.kickPlayer(data as { user_id: string; target_user_id: string }, ws, msg_id)
case ActionCloseRoom:
  return this.closeRoom(ws, msg_id)
```

- [ ] **Import ActionRemoveRoom**

Add to import from `./protocol/action`:

```typescript
ActionRemoveRoom
```

- [ ] **Verify types**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No type errors.

- [ ] **Commit**

```bash
git add src/room.ts
git commit -m "feat: add owner tracking, kick/close actions, auto-close on empty"
```

---

### Task 4: Client — room list improvements (password, auto-refresh, owner nickname)

**Files:**
- Modify: `client/src/scenes/MainMenuScene.ts`

- [ ] **Update createRoom to pass password and nickname**

In the create button onClick handler, prompt for optional password and pass nickname:

```typescript
const createBtn = new Button({
  text: '创建房间', width: 240,
  onClick: async () => {
    const password = prompt('房间密码（可选，留空则公开）:') || ''
    try {
      const res = await this.ws.send('create_room', {
        title: '新手房', password,
        nickname: this.nickname,
        user_id: this.userId, token: this.token,
      })
      const roomId = res.room_id as string
      this.ws.disconnect()
      this.onJoinRoom(roomId)
      this.sm.switchTo('room')
    } catch (e: any) {
      alert('创建失败: ' + e.message)
    }
  },
})
```

- [ ] **Update joinRoom to prompt for password when needed**

Replace the join button onClick handler. First, we need to track `need_password` when rendering rooms. Update the room rendering: pass room data to the click handler:

```typescript
rooms.forEach((room, i) => {
  const bg = new Graphics()
  bg.roundRect(0, 0, 300, 50, 8)
  bg.fill({ color: 0x2d8c4e })

  const text = new Text({
    text: `${room.title} (${room.player_count}/3)${room.need_password ? ' 🔒' : ''}  ${room.owner_nickname || ''}`,
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
      let password = ''
      if (room.need_password) {
        password = prompt('请输入房间密码:') || ''
      }
      const res = await this.ws.send('join_room', {
        room_id: room.room_id, password,
        user_id: this.userId, token: this.token,
      })
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
```

- [ ] **Extract auto-refresh logic into onEnter**

Modify `onEnter` to add a polling interval:

```typescript
private refreshInterval: number | null = null

async onEnter(): Promise<void> {
  try {
    await this.ws.connect('/ws')
    this.loadRoomList()
    this.refreshInterval = window.setInterval(() => {
      this.loadRoomList()
    }, 8000)
  } catch (e) {
    console.error('Failed to connect to lobby', e)
  }
}

onLeave(): void {
  if (this.refreshInterval !== null) {
    clearInterval(this.refreshInterval)
    this.refreshInterval = null
  }
}
```

Note: The Scene class needs to support `onLeave`. Check `SceneManager.ts`:

- [ ] **Add onLeave to Scene base class if it doesn't exist**

Read `client/src/core/SceneManager.ts`:

```bash
cat client/src/core/SceneManager.ts
```

If `Scene` class doesn't have `onLeave()`, add it:

```typescript
// In Scene class
onLeave(): void {}
```

- [ ] **Verify no TypeScript errors**

```bash
cd client && npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: No type errors.

- [ ] **Commit**

```bash
git add client/src/scenes/MainMenuScene.ts client/src/core/SceneManager.ts
git commit -m "feat: add room password prompt, auto-refresh, owner nickname display"
```

---

### Task 5: Client — owner controls in RoomScene (kick + close)

**Files:**
- Modify: `client/src/scenes/RoomScene.ts`

- [ ] **Add ownerId tracking and isOwner flag**

Add field to RoomScene class:

```typescript
private ownerId = ''
```

In `connectToRoom`, after receiving snapshot, set ownerId:

```typescript
const owner = (snapshot.players as any[]).find((p: any) => p.is_owner)
if (owner) this.ownerId = owner.user_id
```

- [ ] **Register player_kicked push handler**

In `connectToRoom`, after existing onPush registrations:

```typescript
this.ws.onPush('player_kicked', (d) => {
  alert('你已被房主踢出房间')
  localStorage.removeItem(ROOM_STORAGE_KEY)
  this.ws.disconnect()
  this.sm.switchTo('menu')
})
```

- [ ] **Register room_closed push handler for non-owner notifications**

```typescript
this.ws.onPush('room_closed', (d) => {
  if (this.userId !== this.ownerId) {
    alert('房间已关闭')
    localStorage.removeItem(ROOM_STORAGE_KEY)
    this.ws.disconnect()
    this.sm.switchTo('menu')
  }
})
```

- [ ] **Add owner controls to renderPlayers or actionContainer**

Add a method `renderOwnerControls`:

```typescript
private renderOwnerControls(): void {
  if (this.userId !== this.ownerId || this.gameState !== '') return

  const { width, height } = this.app.screen

  const closeBtn = new Button({
    text: '关闭房间', width: 140,
    onClick: async () => {
      if (confirm('确定关闭房间？')) {
        await this.ws.send('close_room', { user_id: this.userId })
        localStorage.removeItem(ROOM_STORAGE_KEY)
        this.ws.disconnect()
        this.sm.switchTo('menu')
      }
    },
  })
  closeBtn.x = width - 160
  closeBtn.y = 10
  this.container.addChild(closeBtn)
}
```

Call `renderOwnerControls()` at the end of `connectToRoom` (after rendering players).

- [ ] **Make player names tappable for owner to kick**

In `renderPlayers`, make player labels interactive when current user is owner:

```typescript
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
    const isOwner = p.userId === this.ownerId
    const label = new Text({
      text: `${p.nickname}${isOwner ? ' (房主)' : ''} (${p.handCount})${isLandlord ? ' 👑' : ''}${p.userId === this.currentTurn ? ' ▶' : ''}`,
      style: new TextStyle({
        fontFamily: 'Arial', fontSize: 16,
        fill: p.userId === this.userId ? '#ffd700' : '#ffffff',
      }),
    })
    label.anchor.set(i === 0 ? 0.5 : i === 1 ? 0 : 1, 0.5)
    label.x = x
    label.y = y

    // Owner can tap on other players to kick
    if (this.userId === this.ownerId && p.userId !== this.userId) {
      label.eventMode = 'static'
      label.cursor = 'pointer'
      label.on('pointertap', async () => {
        if (confirm(`确定踢出 ${p.nickname}？`)) {
          try {
            await this.ws.send('kick_player', { user_id: this.userId, target_user_id: p.userId })
            this.players = this.players.filter(pl => pl.userId !== p.userId)
            this.renderPlayers()
          } catch (e: any) {
            alert('踢出失败: ' + e.message)
          }
        }
      })
    }

    this.playerLabels.push(label)
    this.container.addChild(label)
  })
}
```

- [ ] **Verify no TypeScript errors**

```bash
cd client && npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: No type errors.

- [ ] **Commit**

```bash
git add client/src/scenes/RoomScene.ts
git commit -m "feat: add owner kick/close controls in RoomScene"
```

---

### Task 6: Integration check

- [ ] **For all tasks above — verify the project builds**

```bash
npm run build 2>&1 | tail -20
```
Expected: Build succeeds with no errors.

- [ ] **If build succeeds, commit any remaining files**

```bash
git status
```
Verify all changed files are tracked and committed.

## Self-Review

**Spec coverage:**
- Room settings (title + password) → Task 2 (LobbyDO), Task 4 (client prompt)
- Owner controls (kick + close) → Task 3 (RoomDO), Task 5 (client UI)
- Auto-close when empty → Task 3 (notifyLobbyRemoveRoom)
- Room list auto-refresh → Task 4 (setInterval)
- Owner nickname in list → Task 2 (getRoomList), Task 4 (display)

**No placeholders:** All code in every step is complete and concrete.

**Type consistency:** Types used across tasks are consistent (RoomMeta fields, action names, push data shapes).
