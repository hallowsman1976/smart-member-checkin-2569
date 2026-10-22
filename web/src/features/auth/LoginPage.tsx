import { useEffect, useState, type FormEvent } from 'react'
import { CircleNotchIcon, IdentificationCardIcon, SignInIcon } from '@phosphor-icons/react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadLastStation, saveLastStation } from '@/lib/session'
import { api } from '@/services/api'
import type { LoginData, Station } from '@/types/api'

interface Props {
  onLoggedIn: (data: LoginData) => void
}

export function LoginPage({ onLoggedIn }: Props) {
  const [stations, setStations] = useState<Station[] | null>(null)
  const [stationsError, setStationsError] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [stationId, setStationId] = useState(loadLastStation)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadStations = async () => {
    setStationsError('')
    const res = await api('stations.list', {})
    if (res.success && res.data) setStations(res.data.items)
    else setStationsError(res.message || 'โหลดรายการจุดลงทะเบียนไม่สำเร็จ')
  }

  useEffect(() => {
    void loadStations()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    if (!username.trim() || !/^\d{6}$/.test(pin)) {
      setError('กรุณากรอกชื่อผู้ใช้และ PIN 6 หลัก')
      return
    }
    setSubmitting(true)
    const res = await api('auth.login', { username: username.trim(), pin, stationId: stationId || undefined })
    setSubmitting(false)
    setPin('')
    if ((res.code === 'OK' || res.code === 'MUST_CHANGE_PIN') && res.data) {
      if (stationId) saveLastStation(stationId)
      onLoggedIn(res.data)
      return
    }
    if (res.code === 'PIN_LOCKED') {
      const until = (res.data as { lockedUntil?: string } | undefined)?.lockedUntil
      const m = until ? /T(\d{2}:\d{2})/.exec(until) : null
      setError(`${res.message}${m ? ` (ลองใหม่ได้หลัง ${m[1]} น.)` : ''}`)
      return
    }
    setError(res.message)
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-background p-4">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <IdentificationCardIcon className="size-6" weight="fill" />
          </div>
          <div className="grid gap-1">
            <CardTitle className="text-xl tracking-tight">Smart Member Check-in 2569</CardTitle>
            <CardDescription>
              ลงทะเบียนประชุมใหญ่สามัญประจำปี · สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="username">ชื่อผู้ใช้</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 text-base"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pin">PIN 6 หลัก</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="h-11 text-base tracking-[0.4em]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="station">จุดลงทะเบียน</Label>
              <select
                id="station"
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                disabled={!stations}
                className="h-11 rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                <option value="">{stations ? '— เลือกจุด (เฉพาะเจ้าหน้าที่ลงทะเบียน) —' : 'กำลังโหลด…'}</option>
                {stations?.map((s) => (
                  <option key={s.stationId} value={s.stationId}>
                    {s.stationId} · {s.stationName}
                  </option>
                ))}
              </select>
              {stationsError && (
                <p className="text-sm text-destructive">
                  {stationsError}{' '}
                  <button type="button" className="underline" onClick={() => void loadStations()}>
                    ลองใหม่
                  </button>
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="xl" disabled={submitting}>
              {submitting ? <CircleNotchIcon className="animate-spin" /> : <SignInIcon />}
              {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
