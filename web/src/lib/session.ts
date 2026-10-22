import type { Station, User } from '@/types/api'

/**
 * Session ฝั่ง client เก็บใน sessionStorage (แยกตามแท็บ) — ห้ามเก็บ PIN
 * สิทธิ์จริงตรวจที่ server ทุกคำสั่ง ค่าตรงนี้ใช้แสดงผลเท่านั้น
 */
export interface ClientSession {
  token: string
  user: User
  station: Station | null
  mustChangePin: boolean
}

const KEY = 'smc.session'

export function loadSession(): ClientSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ClientSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: ClientSession) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // private mode: session อยู่ใน memory ของแท็บนี้เท่านั้น
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** Station ที่เลือกล่าสุดบนเครื่องนี้ (ไม่ใช่ข้อมูลอ่อนไหว) */
const LAST_STATION_KEY = 'smc.lastStation'

export function loadLastStation(): string {
  try {
    return localStorage.getItem(LAST_STATION_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveLastStation(stationId: string) {
  try {
    localStorage.setItem(LAST_STATION_KEY, stationId)
  } catch {
    // ignore
  }
}
