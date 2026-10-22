import { useCallback, useEffect, useMemo, useState } from 'react'
import { indexMembers, type IndexedMember } from '@/lib/search'
import { api } from '@/services/api'

const AUTO_REFRESH_MS = 5 * 60_000

/**
 * รายชื่อสมาชิกสำหรับค้นหา — เก็บใน memory เท่านั้น (ห้าม localStorage/IndexedDB)
 * รีเฟรชอัตโนมัติทุก 5 นาที เพื่อให้เห็น Walk-in Member ที่ Admin เพิ่ม
 */
export function useMembers() {
  const [items, setItems] = useState<IndexedMember[] | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await api('members.list', {})
    setLoading(false)
    if (res.success && res.data) {
      setItems(indexMembers(res.data.items))
      setLoadedAt(new Date())
      setError('')
    } else {
      setError(res.message || 'โหลดรายชื่อสมาชิกไม่สำเร็จ')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  return useMemo(() => ({ items, loadedAt, loading, error, refresh }), [items, loadedAt, loading, error, refresh])
}
