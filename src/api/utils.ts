export function generateId(prefix: string): string {
  const buf = new Uint8Array(8)
  crypto.getRandomValues(buf)
  return prefix + '_' + Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function generateToken(): string {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}
