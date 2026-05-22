export interface Request {
  msg_id: string
  action: string
  data: Record<string, unknown>
  timestamp: number
}

export interface Response {
  msg_id: string
  action: string
  code: number
  message: string
  data?: Record<string, unknown>
}

export interface Push {
  action: string
  data: Record<string, unknown>
  timestamp: number
}
