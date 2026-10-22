import { useState } from 'react'
import { CalendarPlus, Lock, Pencil, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormDialog, LoadState, Notice, PageHeader, RefreshInfo, StatusPill, Table, TextInput } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { api } from '@/services/api'
import type { EventInfo } from '@/types/api'

type Dialog =
  | { kind: 'edit'; eventId?: string; eventName: string; eventDate: string; quorumThreshold: string }
  | { kind: 'open'; event: EventInfo; reason: string }
  | { kind: 'close'; event: EventInfo }

const STATUS = {
  DRAFT: <StatusPill tone="muted">ร่าง</StatusPill>,
  OPEN: <StatusPill tone="success">เปิดรับลงทะเบียน</StatusPill>,
  CLOSED: <StatusPill tone="info">ปิดแล้ว</StatusPill>,
}

export function EventsPage({ onEventChanged }: { onEventChanged: () => void }) {
  const q = useApiQuery('events.list', {})
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [message, setMessage] = useState('')
  const hasOpen = !!q.data?.items.some((e) => e.status === 'OPEN')

  const submit = async (): Promise<string | null> => {
    if (!dialog) return null
    let res
    if (dialog.kind === 'edit') {
      res = await api('admin.events.upsert', {
        eventId: dialog.eventId,
        eventName: dialog.eventName.trim(),
        eventDate: dialog.eventDate,
        quorumThreshold: Number(dialog.quorumThreshold),
      })
    } else if (dialog.kind === 'open') {
      res = await api('admin.events.open', { eventId: dialog.event.eventId, reason: dialog.reason || undefined })
    } else {
      res = await api('admin.events.close', { eventId: dialog.event.eventId })
    }
    if (!res.success) return res.message
    setMessage(res.message)
    void q.reload()
    onEventChanged()
    return null
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <PageHeader
        title="งานประชุม"
        description="เปิดรับลงทะเบียนได้ครั้งละหนึ่งงาน · เมื่อปิดงาน ระบบจะสำรองผลสุดท้ายไปยังสเปรดชีตสำรอง"
        actions={
          <>
            <RefreshInfo updatedAt={q.updatedAt} loading={q.loading} onRefresh={() => void q.reload()} />
            <Button onClick={() => setDialog({ kind: 'edit', eventName: '', eventDate: '', quorumThreshold: '100' })}><CalendarPlus /> สร้างงาน</Button>
          </>
        }
      />
      {message && <div className="mb-3"><Notice tone="success">{message}</Notice></div>}
      {!q.data && <LoadState loading={q.loading} error={q.error} onRetry={() => void q.reload()} />}
      {q.data && (
        <Table head={<tr><th>งานประชุม</th><th>วันที่</th><th className="text-right">องค์ประชุม</th><th>สถานะ</th><th /></tr>}>
          {q.data.items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">ยังไม่มีงานประชุม</td></tr>}
          {q.data.items.map((e) => (
            <tr key={e.eventId}>
              <td>{e.eventName}<div className="font-mono text-xs text-muted-foreground">{e.eventId}</div></td>
              <td>{e.eventDate}</td>
              <td className="text-right tabular-nums">{e.quorumThreshold.toLocaleString('th-TH')}</td>
              <td>{STATUS[e.status]}</td>
              <td className="text-right whitespace-nowrap">
                <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'edit', eventId: e.eventId, eventName: e.eventName, eventDate: e.eventDate, quorumThreshold: String(e.quorumThreshold) })}>
                  <Pencil /> แก้ไข
                </Button>
                {e.status === 'OPEN' ? (
                  <Button variant="destructive" size="sm" onClick={() => setDialog({ kind: 'close', event: e })}><Lock /> ปิดรับลงทะเบียน</Button>
                ) : (
                  <Button variant="success" size="sm" disabled={hasOpen} title={hasOpen ? 'มีงานที่เปิดอยู่แล้ว' : undefined} onClick={() => setDialog({ kind: 'open', event: e, reason: '' })}>
                    <Play /> {e.status === 'CLOSED' ? 'เปิดอีกครั้ง' : 'เปิดรับลงทะเบียน'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {dialog?.kind === 'edit' && (
        <FormDialog open title={dialog.eventId ? 'แก้ไขงานประชุม' : 'สร้างงานประชุม'} onClose={() => setDialog(null)} onSubmit={submit}>
          <Field id="e-name" label="ชื่องาน">
            <TextInput id="e-name" autoFocus value={dialog.eventName} onChange={(e) => setDialog({ ...dialog, eventName: e.target.value })} placeholder="ประชุมใหญ่สามัญประจำปี 2569" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="e-date" label="วันที่ประชุม">
              <TextInput id="e-date" type="date" value={dialog.eventDate} onChange={(e) => setDialog({ ...dialog, eventDate: e.target.value })} />
            </Field>
            <Field id="e-quorum" label="เกณฑ์องค์ประชุม (คน)" hint="นับเฉพาะสมาชิกสามัญ ตามข้อบังคับสหกรณ์">
              <TextInput id="e-quorum" inputMode="numeric" value={dialog.quorumThreshold} onChange={(e) => setDialog({ ...dialog, quorumThreshold: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
        </FormDialog>
      )}
      {dialog?.kind === 'open' && (
        <FormDialog open title={`เปิดรับลงทะเบียน: ${dialog.event.eventName}`} submitLabel="เปิดรับลงทะเบียน" onClose={() => setDialog(null)} onSubmit={submit}
          description="ทุกจุดลงทะเบียนจะเริ่มลงทะเบียนเข้างานนี้ได้ทันที และจะนำเข้าไฟล์สมาชิกไม่ได้จนกว่าจะปิดงาน">
          {dialog.event.status === 'CLOSED' && (
            <Field id="e-reason" label="เหตุผลที่เปิดอีกครั้ง">
              <TextInput id="e-reason" autoFocus value={dialog.reason} onChange={(e) => setDialog({ ...dialog, reason: e.target.value })} />
            </Field>
          )}
        </FormDialog>
      )}
      {dialog?.kind === 'close' && (
        <FormDialog open destructive title={`ปิดรับลงทะเบียน: ${dialog.event.eventName}`} submitLabel="ยืนยันปิดรับลงทะเบียน" onClose={() => setDialog(null)} onSubmit={submit}
          description="ทุกจุดจะลงทะเบียนต่อไม่ได้ ใบลงทะเบียนกระดาษที่เหลือยังนำเข้าย้อนหลังได้ที่เมนู ยกเลิก / ใบกระดาษ">
          <p className="text-sm">ระบบจะสำรองผลการลงทะเบียนสุดท้ายโดยอัตโนมัติ</p>
        </FormDialog>
      )}
    </div>
  )
}
