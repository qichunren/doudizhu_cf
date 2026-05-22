# 斗地主 (Fight the Landlord) — Cloudflare Edition

一款部署在 **Cloudflare Workers + Durable Objects** 边缘网络上的在线三人斗地主卡牌游戏。前端基于 **Vite + Pixi.js (v8)** 构建，支持 WebSocket 实时通信。

## 功能特性

- **账号系统** — 注册/登录，密码 SHA-256 加密存储，localStorage 保持登录态
- **房间系统** — 创建房间（可设密码）、加入房间、房间列表滚动浏览
- **匹配系统** — 快速匹配对手，取消匹配
- **完整斗地主规则**
  - 发牌（54 张，每人 17 张 + 3 张底牌）
  - 叫地主（轮流抢地主）
  - 出牌（支持全部标准牌型：单张、对子、三带一/对、顺子、连对、飞机、炸弹、火箭、四带二）
  - 炸弹翻倍，积分结算
- **实时通信** — WebSocket + JSON 协议，服务端推送状态变更
- **掉线重连** — 断开后可重新加入房间，恢复游戏状态
- **Pixi.js 渲染** — 手牌展示、选中高亮、出牌动画

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | [Cloudflare Workers](https://workers.cloudflare.com/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/) |
| 服务端框架 | [Hono](https://hono.dev/) |
| 前端框架 | [Vite](https://vitejs.dev/) + [Pixi.js](https://pixijs.com/) v8 |
| 通信协议 | WebSocket — JSON 消息 |
| 包管理 | npm workspaces |

## 架构概览

```
┌──────────────┐     WebSocket      ┌─────────────────────────────┐
│   Browser    │ ─────────────────→  │  LobbyDO (global singleton) │
│  (Pixi.js)   │                    │  - 认证 / 注册              │
│              │                    │  - 房间列表                 │
│              │                    │  - 创建 / 加入房间          │
│              │                    │  - 快速匹配                 │
│              │                    └──────────┬──────────────────┘
│              │                               │
│              │     WebSocket      ┌──────────▼──────────────────┐
│              │ ─────────────────→  │  RoomDO (per-room instance)│
│              │                    │  - 游戏状态机               │
│              │                    │  - 发牌 / 叫地主 / 出牌    │
│              │                    │  - 校验 & 结算              │
│              │                    └─────────────────────────────┘
```

- **LobbyDO** — 全局唯一的 Durable Object，处理 WebSocket 握手、用户认证、房间 CRUD 和匹配队列
- **RoomDO** — 每个房间一个独立的 Durable Object，运行完整的游戏状态机（发牌 → 叫地主 → 出牌 → 结算）
- 客户端先连接 `/ws` 进入 LobbyDO，加入房间后通过 `/room/:id` 连接到具体 RoomDO

## 项目结构

```
doudizhu_cf/
├── src/                          # 服务端 (Cloudflare Worker)
│   ├── index.ts                  # Hono 入口：WS 升级、房间路由
│   ├── lobby.ts                  # LobbyDO：用户认证、房间管理、匹配
│   ├── room.ts                   # RoomDO：完整游戏逻辑
│   ├── types.ts                  # Env 类型定义 (LOBBY_DO, ROOM_DO)
│   ├── game/
│   │   ├── card.ts               # Card/Suit/CardType 枚举与序列化
│   │   ├── classifier.ts         # classifyCards() — 牌型识别
│   │   ├── compare.ts            # canBeat() / isBomb() — 牌型比较
│   │   ├── deck.ts               # newDeck() / shuffle() / deal()
│   │   ├── index.ts              # barrel export
│   │   └── statemachine.ts       # GameState 枚举
│   └── protocol/
│       ├── action.ts             # Action/Push 字符串常量
│       ├── error.ts              # 错误码与消息
│       └── message.ts            # Request / Response / Push 接口
├── client/                       # 前端 (Vite + Pixi.js)
│   ├── index.html                # 入口 HTML：登录页 + 游戏 canvas
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts               # 启动流程：登录 → Pixi 初始化 → 场景切换
│       ├── core/
│       │   ├── SceneManager.ts   # 场景基类 + 管理器（淡入淡出过渡）
│       │   └── WebSocketManager.ts  # WS 客户端：请求/响应/推送/心跳
│       ├── scenes/
│       │   ├── MainMenuScene.ts  # 大厅 UI：房间列表、创建/加入房间
│       │   └── RoomScene.ts      # 游戏内 UI：手牌、出牌按钮、叫地主
│       └── ui/
│           └── Button.ts         # 可复用 Pixi 按钮组件
├── wrangler.toml                 # Cloudflare Worker 配置
├── package.json                  # 根工作区配置
└── tsconfig.json                 # 服务端 TypeScript 配置
```

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动服务端 (wrangler dev)
npm run dev

# 3. 新开终端，启动前端开发服务器
cd client && npm run dev
```

访问 `http://localhost:5173` 即可看到登录页面。

## WebSocket 协议

通信采用 JSON 格式，包含三种消息类型：

### 消息格式

```typescript
// 客户端请求
interface Request {
  msg_id: string
  action: string
  data: Record<string, unknown>
  timestamp: number
}

// 服务端响应
interface Response {
  msg_id: string
  action: string
  code: number       // 0 = 成功, 其他见 error.ts
  message: string
  data?: Record<string, unknown>
}

// 服务端推送
interface Push {
  action: string
  data: Record<string, unknown>
  timestamp: number
}
```

### 请求动作 (Client → Server)

| Action | 说明 |
|---|---|
| `register` | 注册账号 (account, password, nickname) |
| `login` | 登录 (account, password) |
| `get_room_list` | 获取房间列表 |
| `create_room` | 创建房间 (title, password?) |
| `join_room` | 加入房间 (roomId, password?) |
| `match` | 开始匹配 |
| `cancel_match` | 取消匹配 |
| `ready` | 准备 |
| `leave_room` | 离开房间 |
| `rob_landlord` | 抢地主 (bid: boolean) |
| `play_card` | 出牌 (cards: string[]) |
| `pass` | 过牌 |
| `reconnect` | 断线重连 |

### 推送事件 (Server → Client)

| Action | 说明 |
|---|---|
| `player_joined` | 有玩家加入房间 |
| `player_left` | 有玩家离开房间 |
| `player_ready` | 有玩家准备 |
| `game_start` | 游戏开始，发牌完成 |
| `landlord_confirmed` | 地主确定 |
| `rob_landlord` | 叫地主结果 |
| `card_played` | 有玩家出牌 |
| `player_pass` | 有玩家过牌 |
| `turn_changed` | 轮到某玩家出牌 |
| `game_over` | 游戏结束，结算结果 |
| `room_closed` | 房间关闭 |

### 错误码

| Code | 说明 |
|---|---|
| `0` | OK |
| `1001` | Action 不存在 |
| `1002` | 参数错误 |
| `1003` | 未认证 |
| `2001` | 房间不存在 |
| `2002` | 房间已满 |
| `2003` | 房间密码错误 |
| `2004` | 游戏已开始 |
| `2005` | 未轮到你 |
| `2006` | 无效牌型 |
| `2007` | 管不上 |
| `4001` | 用户不存在 |
| `4002` | 账号已存在 |
| `4003` | 密码错误 |
| `5001` | 服务端内部错误 |

## 游戏规则

### 发牌
- 54 张牌 (4 花色 3-2 共 52 张 + 小王 + 大王)
- 每人 17 张，留 3 张底牌

### 牌型

| 牌型 | 说明 |
|---|---|
| 单张 | 任意 1 张牌 |
| 对子 | 两张同点数牌 |
| 三不带 | 三张同点数牌 |
| 三带一 | 三张同点数 + 一张单牌 |
| 三带对 | 三张同点数 + 一对 |
| 顺子 | 5 张或以上连续单牌 (3-A，不含 2 和王) |
| 连对 | 3 对或以上连续对子 |
| 飞机 | 2 组或以上连续三张 |
| 飞机带单 | 飞机 + 同数量单牌 |
| 飞机带对 | 飞机 + 同数量对子 |
| 炸弹 | 四张同点数牌 |
| 火箭 | 小王 + 大王 |
| 四带二 | 四张同点数 + 两张单牌 (或两对) |

### 叫地主
- 随机指定起始玩家，轮流选择"不抢"或"抢地主"
- 第一个抢地主的玩家成为地主
- 若无人抢地主，重新发牌
- 地主获得 3 张底牌

### 结算
- 基础分为房间设定值
- 每出一个炸弹，积分 ×2
- 火箭 ×2
- 地主赢：农民各输 1 倍；地主输：农民各赢 1 倍

## 部署

```bash
# 构建前端
npm run build

# 部署到 Cloudflare
npm run deploy
```

需要先配置 `wrangler.toml` 中的 `account_id`，或通过 `wrangler login` 登录。

## 开发计划

- [ ] AI 机器人（单机模式）
- [ ] 游戏回放
- [ ] 语音/表情互动
- [ ] 排行榜

## License

MIT
