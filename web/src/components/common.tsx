import { useState, type ComponentProps, type ReactNode } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatClock } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function RefreshInfo({ updatedAt, loading, onRefresh }: { updatedAt: Date | null; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>อัปเดตล่าสุด {updatedAt ? `${formatClock(updatedAt)} น.` : '-'}</span>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={loading ? 'animate-spin' : ''} /> รีเฟรช
      </Button>
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'success' | 'error' | 'info'; children: ReactNode }) {
  const tones = {
    success: 'border-success/40 bg-success/10 text-success',
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    info: 'border-primary/30 bg-sky-50 text-primary',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-3 py-2 text-sm', tones[tone])}>
      {children}
    </div>
  )
}

export function LoadState({ loading, error, empty, onRetry }: { loading: boolean; error: string; empty?: boolean; onRetry?: () => void }) {
  if (error)
    return (
      <Notice tone="error">
        {error}{' '}
        {onRetry && (
          <button className="underline" onClick={onRetry}>
            ลองใหม่
          </button>
        )}
      </Notice>
    )
  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="animate-spin" /> กำลังโหลด…
      </div>
    )
  if (empty) return <p className="py-10 text-center text-muted-foreground">ไม่มีข้อมูล</p>
  return null
}

export function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export const selectClass =
  'h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function StatusPill({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'muted' | 'info'; children: ReactNode }) {
  const tones = {
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/30 text-warning-foreground',
    danger: 'bg-destructive/10 text-destructive',
    muted: 'bg-muted text-muted-foreground',
    info: 'bg-sky-100 text-primary',
  }
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone])}>{children}</span>
}

/** ตารางแบบเรียบง่ายที่เลื่อนแนวนอนได้บนจอแคบ */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs text-muted-foreground [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_th]:whitespace-nowrap">
          {head}
        </thead>
        <tbody className="divide-y [&_td]:px-3 [&_td]:py-2">{children}</tbody>
      </table>
    </div>
  )
}

/** Dialog ฟอร์มทั่วไป: onSubmit คืนข้อความ error หรือ null เมื่อสำเร็จ */
export function FormDialog({
  open,
  title,
  description,
  submitLabel = 'บันทึก',
  onClose,
  onSubmit,
  children,
  destructive,
}: {
  open: boolean
  title: string
  description?: ReactNode
  submitLabel?: string
  onClose: () => void
  onSubmit: () => Promise<string | null>
  children: ReactNode
  destructive?: boolean
}) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    const err = await onSubmit()
    setSaving(false)
    if (err) setError(err)
    else onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          {error && <Notice tone="error">{error}</Notice>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TextInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} className={cn('h-9 bg-white', props.className)} />
}
