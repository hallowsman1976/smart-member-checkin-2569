import { CalendarCheckIcon, MapPinIcon, SignOutIcon, UserCircleIcon } from '@phosphor-icons/react'
import { ThemeToggle } from '@/components/ThemeToggle'
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

/** แถวบน: ชื่อระบบ/งาน ซ้าย, จุด·ผู้ใช้·การเชื่อมต่อ·ธีม·ออก ขวา — บนมือถือเหลือเฉพาะไอคอน */
export function AppHeader({ user, station, openEvent, onLogout }: Props) {
  const { online } = useConnection()
  return (
    <header className="border-b bg-card">
      <div className="flex h-14 items-center gap-3 px-4">
        <img src="/logo.webp" alt="MPHSCC" className="size-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-tight">Smart Member Check-in 2569</div>
          <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <CalendarCheckIcon className="size-3.5 shrink-0" />
            {openEvent ? (
              <span className="truncate">{openEvent.eventName}</span>
            ) : (
              <span className="truncate text-destructive">ยังไม่มีงานที่เปิดรับลงทะเบียน</span>
            )}
          </div>
        </div>

        {station && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-sm font-medium text-accent-foreground">
            <MapPinIcon className="size-4" />
            <span className="sm:hidden">จุด {station.stationId}</span>
            <span className="hidden sm:inline">{station.stationName}</span>
          </div>
        )}

        <div className="hidden items-center gap-2 text-sm lg:flex" title={ROLE_LABEL[user.role]}>
          <UserCircleIcon className="size-5 text-muted-foreground" />
          <div className="leading-tight">
            <div className="font-medium">{user.fullName}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>

        <div
          role="status"
          aria-label={online ? 'เชื่อมต่อแล้ว' : 'ขาดการเชื่อมต่อ'}
          title={online ? 'เชื่อมต่อแล้ว' : 'ขาดการเชื่อมต่อ'}
          className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${online ? 'text-success' : 'text-destructive'}`}
        >
          <span className={`size-2 rounded-full ${online ? 'bg-success' : 'animate-pulse bg-destructive'}`} />
          <span className="hidden md:inline">{online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
        </div>

        <div className="flex shrink-0 items-center">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="ออกจากระบบ" title="ออกจากระบบ">
            <SignOutIcon />
          </Button>
        </div>
      </div>
    </header>
  )
}
