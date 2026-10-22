import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AppHeader } from '@/components/AppHeader'
import { ChangePinPage } from '@/features/auth/ChangePinPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { AuditPage } from '@/features/admin/AuditPage'
import { CheckinsAdminPage } from '@/features/admin/CheckinsAdminPage'
import { EventsPage } from '@/features/admin/EventsPage'
import { MembersPage } from '@/features/admin/MembersPage'
import { ReportsPage } from '@/features/admin/ReportsPage'
import { StationsPage } from '@/features/admin/StationsPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { CheckinPage } from '@/features/checkin/CheckinPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DisplayPage } from '@/features/dashboard/DisplayPage'
import { HistoryPage } from '@/features/history/HistoryPage'
import { routesFor, useHashRoute } from '@/lib/route'
import { clearSession, loadSession, saveSession, type ClientSession } from '@/lib/session'
import { api, setApiToken, setUnauthorizedHandler } from '@/services/api'
import type { LoginData, OpenEvent } from '@/types/api'

/** ตรวจ session กับ server เป็นระยะ: ต่ออายุแบบ sliding และอัปเดต Open Event */
const SESSION_REFRESH_MS = 60_000

export default function App() {
  const [session, setSession] = useState<ClientSession | null>(() => {
    const s = loadSession()
    setApiToken(s?.token ?? null)
    return s
  })
  const [openEvent, setOpenEvent] = useState<OpenEvent | null>(null)
  const [checked, setChecked] = useState(false)
  const [notice, setNotice] = useState('')

  const logoutLocal = useCallback((message = '') => {
    clearSession()
    setApiToken(null)
    setSession(null)
    setOpenEvent(null)
    setNotice(message)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => logoutLocal('เซสชันหมดอายุหรือถูกปิดใช้งาน กรุณาเข้าสู่ระบบใหม่'))
    return () => setUnauthorizedHandler(null)
  }, [logoutLocal])

  const refreshSession = useCallback(async () => {
    const res = await api('session.me', {})
    if (res.success && res.data) {
      setOpenEvent(res.data.openEvent)
      setSession((prev) => {
        if (!prev) return prev
        const next = { ...prev, user: res.data!.user, station: res.data!.station, mustChangePin: res.data!.mustChangePin }
        saveSession(next)
        return next
      })
    }
    setChecked(true)
  }, [])

  const token = session?.token
  useEffect(() => {
    if (!token) {
      setChecked(true)
      return
    }
    setChecked(false)
    void refreshSession()
    const timer = window.setInterval(() => void refreshSession(), SESSION_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [token, refreshSession])

  const handleLoggedIn = (data: LoginData) => {
    const next: ClientSession = { token: data.token, user: data.user, station: data.station, mustChangePin: data.mustChangePin }
    saveSession(next)
    setApiToken(next.token)
    setNotice('')
    setChecked(false) // รอ session.me (ได้ Open Event) ก่อน mount หน้าหลัก
    setSession(next)
  }

  const logout = async () => {
    await api('auth.logout', {})
    logoutLocal()
  }

  if (!session) {
    return (
      <>
        {notice && (
          <div role="alert" className="bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground">
            {notice}
          </div>
        )}
        <LoginPage onLoggedIn={handleLoggedIn} />
      </>
    )
  }

  if (!checked) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" /> กำลังตรวจสอบเซสชัน…
      </div>
    )
  }

  if (session.mustChangePin) {
    return (
      <ChangePinPage
        fullName={session.user.fullName}
        onChanged={() => void refreshSession()}
        onLogout={() => void logout()}
      />
    )
  }

  return (
    <MainLayout
      session={session}
      openEvent={openEvent}
      onLogout={() => void logout()}
      onEventChanged={() => void refreshSession()}
    />
  )
}

function MainLayout({
  session,
  openEvent,
  onLogout,
  onEventChanged,
}: {
  session: ClientSession
  openEvent: OpenEvent | null
  onLogout: () => void
  onEventChanged: () => void
}) {
  const role = session.user.role
  const [route, navigate] = useHashRoute(role)
  const routes = routesFor(role)

  return (
    <div className="flex min-h-svh flex-col md:h-svh">
      <AppHeader user={session.user} station={session.station} openEvent={openEvent} onLogout={onLogout} />
      {routes.length > 1 && (
        <nav aria-label="เมนู" className="flex gap-1 overflow-x-auto border-b bg-white px-3">
          {routes.map((r) => (
            <a
              key={r.id}
              href={`#/${r.id}`}
              onClick={(e) => {
                e.preventDefault()
                navigate(r.id)
              }}
              aria-current={route === r.id ? 'page' : undefined}
              className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
                route === r.id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </a>
          ))}
        </nav>
      )}
      {route === 'checkin' ? (
        <CheckinPage openEvent={openEvent} />
      ) : (
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {route === 'dashboard' && <DashboardPage />}
          {route === 'display' && <DisplayPage />}
          {route === 'history' && <HistoryPage role={role} />}
          {route === 'members' && <MembersPage />}
          {route === 'checkins' && <CheckinsAdminPage />}
          {route === 'events' && <EventsPage onEventChanged={onEventChanged} />}
          {route === 'users' && <UsersPage currentUserId={session.user.userId} />}
          {route === 'stations' && <StationsPage />}
          {route === 'reports' && <ReportsPage />}
          {route === 'audit' && <AuditPage />}
        </main>
      )}
    </div>
  )
}
