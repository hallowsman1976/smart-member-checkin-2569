import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/services/api'
import type { ActionName, ApiActions } from '@/types/api'

interface Options {
  /** poll ทุก n ms และหยุดเมื่อแท็บถูกซ่อน */
  pollMs?: number
  enabled?: boolean
}

/** โหลดข้อมูลจาก action หนึ่ง พร้อม reload และ polling */
export function useApiQuery<A extends ActionName>(action: A, payload: ApiActions[A]['payload'], options: Options = {}) {
  const { pollMs, enabled = true } = options
  const [data, setData] = useState<ApiActions[A]['data'] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const key = JSON.stringify(payload)
  const keyRef = useRef(key)
  keyRef.current = key

  const reload = useCallback(async () => {
    const requested = key
    setLoading(true)
    const res = await api(action, JSON.parse(requested) as ApiActions[A]['payload'])
    if (keyRef.current !== requested) return // payload เปลี่ยนระหว่างรอ
    setLoading(false)
    if (res.success) {
      setData(res.data as ApiActions[A]['data'])
      setError('')
      setUpdatedAt(new Date())
    } else {
      setError(res.message)
    }
  }, [action, key])

  useEffect(() => {
    if (!enabled) return
    void reload()
    if (!pollMs) return
    let timer: number | undefined
    const start = () => {
      window.clearInterval(timer)
      timer = window.setInterval(() => void reload(), pollMs)
    }
    const onVisibility = () => {
      if (document.hidden) window.clearInterval(timer)
      else {
        void reload()
        start()
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reload, pollMs, enabled])

  return { data, error, loading, updatedAt, reload }
}
