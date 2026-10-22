import type { ActionName, ApiActions, ApiResponse } from '@/types/api'

/**
 * Client ตัวเดียวของแอป — เรียกเฉพาะ POST /api (Pages Function proxy)
 * network error / timeout → UNKNOWN เสมอ (ไม่ทราบว่า server บันทึกแล้วหรือยัง)
 */

const CLIENT_TIMEOUT_MS = 30_000

let token: string | null = null
let onUnauthorized: (() => void) | null = null
const connectionListeners = new Set<(ok: boolean) => void>()

export function setApiToken(value: string | null) {
  token = value
}

/** เรียกเมื่อ server ตอบ UNAUTHORIZED ในคำสั่งที่ต้องมี session */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

/** แจ้งสถานะการเชื่อมต่อจากผลของ request ล่าสุด */
export function subscribeConnection(listener: (ok: boolean) => void) {
  connectionListeners.add(listener)
  return () => connectionListeners.delete(listener)
}

const notify = (ok: boolean) => connectionListeners.forEach((l) => l(ok))

export interface CallOptions {
  requestId?: string
}

export async function api<A extends ActionName>(
  action: A,
  payload: ApiActions[A]['payload'],
  options: CallOptions = {},
): Promise<ApiResponse<ApiActions[A]['data']>> {
  let res: Response
  try {
    res = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, requestId: options.requestId, payload }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })
  } catch {
    notify(false)
    return {
      success: false,
      code: 'UNKNOWN',
      message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต',
    }
  }

  let body: ApiResponse<ApiActions[A]['data']>
  try {
    body = (await res.json()) as ApiResponse<ApiActions[A]['data']>
  } catch {
    notify(false)
    return { success: false, code: 'UNKNOWN', message: 'ได้รับข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง' }
  }

  notify(body.code !== 'UNKNOWN')
  if (body.code === 'UNAUTHORIZED' && action !== 'auth.login' && onUnauthorized) onUnauthorized()
  return body
}

export function newRequestId(): string {
  return crypto.randomUUID()
}
