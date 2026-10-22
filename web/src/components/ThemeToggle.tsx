import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

const LABEL = { system: 'ตามระบบ', light: 'โหมดสว่าง', dark: 'โหมดมืด' } as const

/** กดวนสามสถานะ: ตามระบบ → สว่าง → มืด */
export function ThemeToggle() {
  const { pref, cycle } = useTheme()
  const Icon = pref === 'dark' ? MoonIcon : pref === 'light' ? SunIcon : DesktopIcon
  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={`ธีม: ${LABEL[pref]} (กดเพื่อเปลี่ยน)`} title={`ธีม: ${LABEL[pref]}`}>
      <Icon />
    </Button>
  )
}
