import { useEffect, useState } from 'react'

/** ธีมของเครื่องนี้ (ไม่ใช่ข้อมูลอ่อนไหว) — ค่าเริ่มต้นตามการตั้งค่าของระบบปฏิบัติการ */
export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'smc.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function loadThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(loadThemePreference)

  useEffect(() => {
    applyTheme(pref)
    try {
      if (pref === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, pref)
    } catch {
      // private mode: ใช้ได้เฉพาะแท็บนี้
    }
    if (pref !== 'system') return
    const mq = media()
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const cycle = () => setPref((p) => (p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system'))
  return { pref, setPref, cycle }
}
