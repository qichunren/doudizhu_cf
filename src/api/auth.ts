import { generateId, generateToken, hashPassword } from './utils'
import {
  CodeInvalidParams, CodeAccountExists,
  CodeUserNotFound, CodeWrongPassword, CodeServerError,
  errorMessages,
} from '../protocol/error'

export async function handleRegister(
  db: D1Database,
  data: { account: string; password: string; nickname: string },
): Promise<Record<string, unknown>> {
  if (!data.account || !data.password || !data.nickname) {
    throw { code: CodeInvalidParams, message: errorMessages[CodeInvalidParams] }
  }

  const existing = await db.prepare('SELECT id FROM users WHERE account = ?').bind(data.account).first()
  if (existing) {
    throw { code: CodeAccountExists, message: errorMessages[CodeAccountExists] }
  }

  const userId = generateId('u')
  const passwordHash = await hashPassword(data.password)

  await db.prepare(
    'INSERT INTO users (id, account, password, nickname, score) VALUES (?, ?, ?, ?, 1000)',
  ).bind(userId, data.account, passwordHash, data.nickname).run()

  const token = generateToken()
  await db.prepare(
    'INSERT INTO sessions (user_id, token) VALUES (?, ?)',
  ).bind(userId, token).run()

  return { user_id: userId, token, nickname: data.nickname, score: 1000 }
}

export async function handleLogin(
  db: D1Database,
  data: { account: string; password: string },
): Promise<Record<string, unknown>> {
  if (!data.account || !data.password) {
    throw { code: CodeInvalidParams, message: errorMessages[CodeInvalidParams] }
  }

  const user = await db.prepare('SELECT * FROM users WHERE account = ?').bind(data.account).first() as { id: string; account: string; password: string; nickname: string; score: number } | null
  if (!user) {
    throw { code: CodeUserNotFound, message: errorMessages[CodeUserNotFound] }
  }

  const passwordHash = await hashPassword(data.password)
  if (user.password !== passwordHash) {
    throw { code: CodeWrongPassword, message: errorMessages[CodeWrongPassword] }
  }

  const token = generateToken()
  await db.prepare(
    'INSERT OR REPLACE INTO sessions (user_id, token) VALUES (?, ?)',
  ).bind(user.id, token).run()

  return { user_id: user.id, token, nickname: user.nickname, score: user.score }
}
