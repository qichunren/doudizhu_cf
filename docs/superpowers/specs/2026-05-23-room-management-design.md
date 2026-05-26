# Room Management Overhaul

Date: 2026-05-23

## Summary

Enhance the room management system in doudizhu_cf with configurable room passwords, owner controls (kick/close), proper lifecycle cleanup, and client-side quality-of-life improvements.

## Data Model

### RoomMeta (lobby.ts)

```typescript
interface RoomMeta {
  roomId: string
  title: string
  password: string           // SHA-256 hashed; '' if no password
  ownerId: string
  ownerNickname: string      // shown in room list
  playerCount: number
  maxPlayers: number         // always 3
  status: string             // 'waiting' | 'playing' | 'closed'
  needPassword: boolean      // derived: password !== ''
  doId: string
}
```

### RoomDO internal state

```typescript
private ownerId: string      // propagated from joinRoomConfirm
```

## Protocol Changes

### Modified actions

| Action | Changed fields |
|---|---|
| `create_room` | Request adds `password` (optional string), `nickname` (string) |
| `join_room` | Request adds `password` (optional string) |

### New actions (Client → RoomDO)

| Action | Request data | Response data | Description |
|---|---|---|---|
| `kick_player` | `{ user_id, target_user_id }` | — | Owner kicks target player |
| `close_room` | `{ user_id }` | — | Owner closes the room |

### New pushes (Server → Client)

| Action | Data | Description |
|---|---|---|
| `player_kicked` | `{ user_id, nickname }` | Sent to the kicked player |

### Response changes

- `create_room` response adds `need_password: boolean`
- `get_room_list` room entries add `owner_nickname: string`

## LobbyDO Changes

### createRoom
- Accept `password` field; if non-empty, hash with SHA-256 via `api/utils.ts`
- Accept `nickname` field; store as `ownerNickname`
- Set `needPassword` based on password presence
- Return `need_password` in response data

### joinRoom
- If `meta.needPassword`, require `password` in request
- Compare hash of provided password against stored hash
- Return `CodeRoomPasswordWrong` (2003) on mismatch

### removeRoom (new endpoint)
- HTTP POST endpoint within LobbyDO fetch handler (not WebSocket)
- Accepts `{ room_id }` body
- Deletes room from `this.rooms` map and DO storage
- Returns `{ code: 0 }`

### getRoomList
- Include `owner_nickname` in each room entry

## RoomDO Changes

### Owner ID propagation
- RoomDO stores `ownerId` set when room creator connects via `join_room_confirm`
- Pass `is_owner` flag in room snapshot for client display

### kick_player
- Validate sender is `ownerId`
- Look up target player by `user_id`
- Send `player_kicked` push to target's WebSocket
- Remove target from players array, close their WS
- Broadcast `player_left` to remaining players
- If room becomes empty after kick, auto-close

### close_room
- Validate sender is `ownerId`
- For each non-owner player, send kicked notification and close connection
- Broadcast `room_closed` with reason `'room closed by owner'`
- Notify LobbyDO to remove room metadata via `fetch` to lobby stub

### leaveRoom / handleDisconnect
- When last player leaves (after removal), notify LobbyDO via `removeRoom`
- Notify via HTTP POST to LobbyDO stub: `{ action: 'remove_room', room_id }`

### LobbyDO communication
- RoomDO accesses LobbyDO via `env.LOBBY_DO` binding
- Uses `idFromName('global')` to get stub
- Sends HTTP POST with JSON body `{ action: 'remove_room', room_id }`

## Client Changes

### MainMenuScene
- **Owner nickname**: Show `room.owner_nickname` in room list entries
- **Auto-refresh**: `setInterval` every 8 seconds calls `get_room_list`
- **Password prompt**: When joining a room with `need_password: true`, show a simple prompt (browser `prompt()` or a Pixi text input) before `join_room`

### RoomScene
- **Owner badge**: Show "(房主)" next to owner's name in player list
- **Kick button**: If current user is owner, show kick button; tapping a player row sends `kick_player`
- **Close room button**: If owner, show close button with confirmation
- **Kicked handling**: On `player_kicked` push, show alert and navigate back to lobby
- **Close handling**: On `room_closed` push, show toast and navigate back to lobby

### WebSocketManager
- After `leaveRoom` / kicked / closed, reconnect lobby WebSocket via `connect('/ws')`

## Implementation Order

1. Data model updates (RoomMeta + RoomDO ownerId)
2. LobbyDO: password support in create/join, removeRoom endpoint
3. RoomDO: owner tracking, kick/close actions, auto-close on empty
4. Client: password UI, auto-refresh, owner nickname display
5. Client: kick/close controls for owner
6. Integration testing

## Error Handling

- `kick_player` on non-existent target: return error code
- `kick_player`/`close_room` by non-owner: return `CodeUnauthorized`
- Room already closed: return `CodeRoomNotFound`
- LobbyDO removeRoom call failure: log and continue (non-critical)

## Not In Scope

- Room settings changes after creation
- Room password change / removal
- Transfer room ownership
- Room spectator mode
- D1 persistence for room list
