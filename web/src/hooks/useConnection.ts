import { useEffect, useState } from 'react'
import { subscribeConnection } from '@/services/api'

/** online = เบราว์เซอร์ออนไลน์ และ request ล่าสุดคุยกับ server ได้ */
export function useConnection() {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [serverOk, setServerOk] = useState(true)

  useEffect(() => {
    const on = () => setBrowserOnline(true)
    const off = () => setBrowserOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const unsubscribe = subscribeConnection(setServerOk)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      unsubscribe()
    }
  }, [])

  return { online: browserOnline && serverOk, browserOnline, serverOk }
}
