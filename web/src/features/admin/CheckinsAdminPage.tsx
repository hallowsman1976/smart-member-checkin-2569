import { useMemo, useState, type FormEvent } from 'react'
import { CircleNotchIcon, FilePlusIcon, ProhibitIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Field, Notice, PageHeader, selectClass, TextInput } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { formatTime } from '@/lib/format'
import { api, newRequestId } from '@/services/api'
import type { EventInfo, MemberDetail } from '@/types/api'

function EventSelect({ id, events, value, onChange }: { id: string; events: EventInfo[]; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} className={`${selectClass} h-9`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">งานที่เปิดอยู่</option>
      {events.filter((e) => e.status !== 'DRAFT').map((e) => (
        <option key={e.eventId} value={e.eventId}>{e.eventName} ({e.status === 'OPEN' ? 'เปิด' : 'ปิดแล้ว'})</option>
      ))}
    </select>
  )
}

function MemberHint({ member, memberId }: { member: MemberDetail | undefined; memberId: string }) {
  if (!memberId.trim()) return null
  if (!member) return <p className="text-xs text-destructive">ไม่พบเลขสมาชิกนี้</p>
  return (
    <p className="text-xs text-muted-foreground">
      {member.fullName} · {member.office}
      {!member.active && <span className="text-destructive"> · ไม่มีสิทธิ์</span>}
    </p>
  )
}

type Result = { tone: 'success' | 'error'; text: string } | null

/** Cancellation และ Paper Check-in — Admin เท่านั้น (SPEC.md §4, §10) */
export function CheckinsAdminPage() {
  const events = useApiQuery('events.list', {})
  const members = useApiQuery('admin.members.list', {})
  const stations = useApiQuery('admin.stations.list', {})
  const byId = useMemo(() => new Map((members.data?.items ?? []).map((m) => [m.memberId, m])), [members.data])

  const [cancel, setCancel] = useState({ eventId: '', memberId: '', reason: '' })
  const [cancelResult, setCancelResult] = useState<Result>(null)
  const [cancelling, setCancelling] = useState(false)

  const [paper, setPaper] = useState({ eventId: '', memberId: '', time: '', stationId: '', reason: '' })
  const [paperRequestId, setPaperRequestId] = useState(newRequestId)
  const [paperResult, setPaperResult] = useState<Result>(null)
  const [saving, setSaving] = useState(false)

  const submitCancel = async (e: FormEvent) => {
    e.preventDefault()
    if (cancelling) return
    setCancelling(true)
    const res = await api('admin.checkins.cancel', { memberId: cancel.memberId.trim(), reason: cancel.reason.trim(), eventId: cancel.eventId || undefined })
    setCancelling(false)
    setCancelResult({ tone: res.success ? 'success' : 'error', text: res.success ? `ยกเลิกการลงทะเบียนของ ${cancel.memberId} แล้ว` : res.message })
    if (res.success) setCancel({ ...cancel, memberId: '', reason: '' })
  }

  const submitPaper = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (!paper.time) return setPaperResult({ tone: 'error', text: 'กรุณาระบุเวลาตามใบลงทะเบียน' })
    setSaving(true)
    const res = await api(
      'admin.checkins.paper',
      { memberId: paper.memberId.trim(), checkinTime: `${paper.time}:00+07:00`, stationId: paper.stationId, reason: paper.reason.trim(), eventId: paper.eventId || undefined },
      { requestId: paperRequestId },
    )
    setSaving(false)
    if (res.code === 'REGISTERED') {
      setPaperResult({ tone: 'success', text: `บันทึก ${res.data!.member.fullName} (${res.data!.member.memberId}) เวลา ${formatTime(res.data!.checkin.checkinTime)} แล้ว` })
      setPaper({ ...paper, memberId: '', time: '' })
      setPaperRequestId(newRequestId())
    } else if (res.code === 'ALREADY_REGISTERED') {
      setPaperResult({ tone: 'error', text: res.message })
      setPaperRequestId(newRequestId())
    } else {
      // UNKNOWN/BUSY: คงรหัสคำขอเดิมไว้ กดบันทึกซ้ำได้โดยไม่บันทึกซ้ำซ้อน
      setPaperResult({ tone: 'error', text: res.message })
    }
  }

  const evs = events.data?.items ?? []

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-4">
        <PageHeader title="ยกเลิกการลงทะเบียน" description="ใช้เมื่อเจ้าหน้าที่ลงทะเบียนผิดคน รายการเดิมยังอยู่และลงทะเบียนใหม่ได้" />
        <form className="grid gap-3" onSubmit={submitCancel}>
          <Field id="c-event" label="งานประชุม">
            <EventSelect id="c-event" events={evs} value={cancel.eventId} onChange={(v) => setCancel({ ...cancel, eventId: v })} />
          </Field>
          <Field id="c-member" label="เลขสมาชิก">
            <TextInput id="c-member" value={cancel.memberId} onChange={(e) => setCancel({ ...cancel, memberId: e.target.value })} />
            <MemberHint member={byId.get(cancel.memberId.trim())} memberId={cancel.memberId} />
          </Field>
          <Field id="c-reason" label="เหตุผล">
            <TextInput id="c-reason" value={cancel.reason} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} placeholder="เช่น กดผิดคน ชื่อซ้ำ" />
          </Field>
          {cancelResult && <Notice tone={cancelResult.tone}>{cancelResult.text}</Notice>}
          <Button type="submit" variant="destructive" disabled={cancelling || !cancel.memberId.trim() || !cancel.reason.trim()}>
            {cancelling ? <CircleNotchIcon className="animate-spin" /> : <ProhibitIcon />} ยกเลิกการลงทะเบียน
          </Button>
        </form>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <PageHeader title="นำเข้าใบลงทะเบียนกระดาษ" description="บันทึกตามเวลาจริงบนใบกระดาษ ใช้กฎกันซ้ำเดียวกับจุดลงทะเบียน" />
        <form className="grid gap-3" onSubmit={submitPaper}>
          <Field id="p-event" label="งานประชุม">
            <EventSelect id="p-event" events={evs} value={paper.eventId} onChange={(v) => setPaper({ ...paper, eventId: v })} />
          </Field>
          <Field id="p-member" label="เลขสมาชิก">
            <TextInput id="p-member" value={paper.memberId} onChange={(e) => { setPaper({ ...paper, memberId: e.target.value }); setPaperRequestId(newRequestId()) }} />
            <MemberHint member={byId.get(paper.memberId.trim())} memberId={paper.memberId} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="p-time" label="เวลาตามใบกระดาษ">
              <TextInput id="p-time" type="datetime-local" value={paper.time} onChange={(e) => setPaper({ ...paper, time: e.target.value })} />
            </Field>
            <Field id="p-station" label="จุดลงทะเบียน">
              <select id="p-station" className={`${selectClass} h-9`} value={paper.stationId} onChange={(e) => setPaper({ ...paper, stationId: e.target.value })}>
                <option value="">— เลือกจุด —</option>
                {stations.data?.items.map((s) => <option key={s.stationId} value={s.stationId}>{s.stationId} · {s.stationName}</option>)}
              </select>
            </Field>
          </div>
          <Field id="p-reason" label="เหตุผล">
            <TextInput id="p-reason" value={paper.reason} onChange={(e) => setPaper({ ...paper, reason: e.target.value })} placeholder="เช่น อินเทอร์เน็ตล่ม 08:00–08:30" />
          </Field>
          {paperResult && <Notice tone={paperResult.tone}>{paperResult.text}</Notice>}
          <Button type="submit" disabled={saving || !paper.memberId.trim() || !paper.stationId || !paper.reason.trim()}>
            {saving ? <CircleNotchIcon className="animate-spin" /> : <FilePlusIcon />} บันทึกใบลงทะเบียน
          </Button>
        </form>
      </section>
    </div>
  )
}
