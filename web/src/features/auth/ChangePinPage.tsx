import { useState, type FormEvent } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/services/api'

interface Props {
  fullName: string
  onChanged: () => void
  onLogout: () => void
}

const pinInput = (value: string) => value.replace(/\D/g, '').slice(0, 6)

export function ChangePinPage({ fullName, onChanged, onLogout }: Props) {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    if (![currentPin, newPin].every((p) => /^\d{6}$/.test(p))) return setError('PIN ต้องเป็นตัวเลข 6 หลัก')
    if (newPin !== confirmPin) return setError('PIN ใหม่ทั้งสองช่องไม่ตรงกัน')
    setSubmitting(true)
    const res = await api('auth.changePin', { currentPin, newPin })
    setSubmitting(false)
    if (res.success) return onChanged()
    setError(res.message)
    if (res.code === 'PIN_LOCKED') onLogout()
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-b from-sky-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">ตั้ง PIN ใหม่</CardTitle>
          <CardDescription>
            คุณ{fullName} ต้องเปลี่ยน PIN ก่อนเริ่มใช้งาน ห้ามใช้ตัวเลขเรียงกันหรือซ้ำกันทั้งหมด
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            {(
              [
                ['current', 'PIN ปัจจุบัน', currentPin, setCurrentPin, 'current-password'],
                ['new', 'PIN ใหม่', newPin, setNewPin, 'new-password'],
                ['confirm', 'ยืนยัน PIN ใหม่', confirmPin, setConfirmPin, 'new-password'],
              ] as const
            ).map(([id, label, value, set, autoComplete], i) => (
              <div key={id} className="grid gap-1.5">
                <Label htmlFor={`pin-${id}`}>{label}</Label>
                <Input
                  id={`pin-${id}`}
                  type="password"
                  inputMode="numeric"
                  autoComplete={autoComplete}
                  autoFocus={i === 0}
                  value={value}
                  onChange={(e) => set(pinInput(e.target.value))}
                  className="h-11 text-base tracking-[0.4em]"
                />
              </div>
            ))}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" size="xl" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
              บันทึก PIN ใหม่
            </Button>
            <Button type="button" variant="ghost" onClick={onLogout}>
              ออกจากระบบ
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
