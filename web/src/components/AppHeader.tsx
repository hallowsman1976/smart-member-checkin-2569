import { CalendarCheck, LogOut, MapPin, UserRound, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConnection } from '@/hooks/useConnection'
import type { OpenEvent, Station, User } from '@/types/api'

const ROLE_LABEL = { ADMIN: 'ผู้ดูแลระบบ', SUPERVISOR: 'ผู้ควบคุม', STAFF: 'เจ้าหน้าที่ลงทะเบียน' } as const

interface Props {
  user: User
  station: Station | null
  openEvent: OpenEvent | null
  onLogout: () => void
}

export function AppHeader({ user, station, openEvent, onLogout }: Props) {
  const { online } = useConnection()
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-white px-4 py-2.5 shadow-sm">
      <div className="mr-auto min-w-0">
        <div className="text-base font-semibold text-primary">Smart Member Check-in 2569</div>
        <div className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
          <CalendarCheck className="size-4 shrink-0" />
          {openEvent ? openEvent.eventName : <span className="text-destructive">ยังไม่มีงานประชุมที่เปิดรับลงทะเบียน</span>}
        </div>
      </div>

      {station && (
        <div className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium">
          <MapPin className="size-4 text-primary" />
          {station.stationName} ({station.stationId})
        </div>
      )}

      <div className="flex items-center gap-1.5 text-sm">
        <UserRound className="size-4 text-muted-foreground" />
        <span className="font-medium">{user.fullName}</span>
        <span className="text-muted-foreground">· {ROLE_LABEL[user.role]}</span>
      </div>

      <div
        role="status"
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${online ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
      >
        {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        {online ? 'เชื่อมต่อแล้ว' : 'ขาดการเชื่อมต่อ'}
      </div>

      <Button variant="outline" onClick={onLogout}>
        <LogOut />
        ออกจากระบบ
      </Button>
    </header>
  )
}
