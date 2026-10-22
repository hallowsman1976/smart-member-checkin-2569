import type { MemberType } from '@/types/api'

export const MEMBER_TYPE_LABEL: Record<MemberType, string> = {
  ORDINARY: 'สามัญ',
  ASSOCIATE: 'สมทบ',
}

/** "2026-10-21T08:15:09+07:00" → "08:15:09 น." (เวลาไทยตามที่ server บันทึก) */
export function formatTime(iso: string | undefined): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso ?? '')
  return m ? `${m[1]} น.` : iso ?? ''
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
}
