import { useEffect, useState } from 'react'
import type { Role } from '@/types/api'

/** เมนูทั้งหมด (hash routing: #/dashboard) — ตรวจสิทธิ์จริงที่ server ทุกคำสั่ง ตรงนี้ใช้ซ่อน/แสดงเมนูเท่านั้น */
export const ROUTES = [
  { id: 'checkin', label: 'ลงทะเบียน', roles: ['STAFF'] },
  { id: 'dashboard', label: 'Dashboard', roles: ['ADMIN', 'SUPERVISOR'] },
  { id: 'display', label: 'จอแสดงยอด', roles: ['ADMIN', 'SUPERVISOR'] },
  { id: 'history', label: 'ประวัติ', roles: ['ADMIN', 'SUPERVISOR', 'STAFF'] },
  { id: 'members', label: 'สมาชิก', roles: ['ADMIN'] },
  { id: 'checkins', label: 'ยกเลิก / ใบกระดาษ', roles: ['ADMIN'] },
  { id: 'events', label: 'งานประชุม', roles: ['ADMIN'] },
  { id: 'users', label: 'ผู้ใช้', roles: ['ADMIN'] },
  { id: 'stations', label: 'จุดลงทะเบียน', roles: ['ADMIN'] },
  { id: 'reports', label: 'รายงาน', roles: ['ADMIN', 'SUPERVISOR'] },
  { id: 'audit', label: 'Audit Log', roles: ['ADMIN'] },
] as const satisfies readonly { id: string; label: string; roles: readonly Role[] }[]

export type RouteId = (typeof ROUTES)[number]['id']

export function routesFor(role: Role) {
  return ROUTES.filter((r) => (r.roles as readonly Role[]).includes(role))
}

const read = () => window.location.hash.replace(/^#\/?/, '')

export function useHashRoute(role: Role): [RouteId, (id: RouteId) => void] {
  const [hash, setHash] = useState(read)
  useEffect(() => {
    const onChange = () => setHash(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const allowed = routesFor(role)
  const current = allowed.find((r) => r.id === hash)?.id ?? allowed[0].id
  const navigate = (id: RouteId) => {
    window.location.hash = `/${id}`
  }
  return [current, navigate]
}
