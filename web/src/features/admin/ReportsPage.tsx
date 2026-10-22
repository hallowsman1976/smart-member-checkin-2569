import { useState } from 'react'
import { CircleNotchIcon, FileTextIcon, FileXlsIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Field, Notice, PageHeader, selectClass } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { MEMBER_TYPE_LABEL } from '@/lib/format'
import { downloadBlob, downloadXlsx, toCsv } from '@/lib/spreadsheet'
import { api } from '@/services/api'
import type { ReportRow } from '@/types/api'

const STATUS_LABEL: Record<ReportRow['status'], string> = {
  REGISTERED: 'ลงทะเบียนแล้ว',
  CANCELLED: 'ยกเลิก',
  NOT_REGISTERED: 'ยังไม่ลงทะเบียน',
}

const HEADER = ['เลขสมาชิก', 'ชื่อ-นามสกุล', 'หน่วยงาน', 'ประเภทสมาชิก', 'สถานะ', 'เวลาลงทะเบียน', 'จุดลงทะเบียน', 'ช่องทาง']

function toRows(rows: ReportRow[]) {
  return [
    HEADER,
    ...rows.map((r) => [
      r.memberId,
      r.fullName,
      r.office,
      MEMBER_TYPE_LABEL[r.memberType] ?? r.memberType,
      STATUS_LABEL[r.status],
      r.checkinTime.replace('T', ' ').replace('+07:00', ''),
      r.stationId ? `${r.stationId} ${r.stationName}`.trim() : '',
      r.source === 'PAPER' ? 'ใบกระดาษ' : r.source === 'STATION' ? 'จุดลงทะเบียน' : '',
    ]),
  ]
}

export function ReportsPage() {
  const events = useApiQuery('events.list', {})
  const [eventId, setEventId] = useState('')
  const [busy, setBusy] = useState<'' | 'csv' | 'xlsx'>('')
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const run = async (format: 'csv' | 'xlsx') => {
    setBusy(format)
    setResult(null)
    const res = await api('reports.export', { eventId: eventId || undefined })
    if (!res.success || !res.data) {
      setBusy('')
      setResult({ tone: 'error', text: res.message })
      return
    }
    const { event, rows } = res.data
    const table = toRows(rows)
    const stamp = res.data.generatedAt.slice(0, 16).replace(/[-:T]/g, '')
    const base = `checkin_${event.eventId}_${stamp}`
    if (format === 'csv') downloadBlob(new Blob([toCsv(table)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`)
    else await downloadXlsx(table, 'ลงทะเบียน', `${base}.xlsx`)
    setBusy('')
    const registered = rows.filter((r) => r.status === 'REGISTERED').length
    setResult({ tone: 'success', text: `${event.eventName}: ${rows.length.toLocaleString('th-TH')} แถว (ลงทะเบียนแล้ว ${registered.toLocaleString('th-TH')} ราย)` })
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <PageHeader title="รายงาน / Export" description="หนึ่งแถวต่อสมาชิก รวมผู้ที่ยังไม่ลงทะเบียน · ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกบันทึกเป็นข้อความ ไม่ใช่สูตร" />
      <div className="grid gap-4 rounded-xl border bg-card p-4">
        <Field id="r-event" label="งานประชุม">
          <select id="r-event" className={`${selectClass} h-9`} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">งานที่เปิดอยู่</option>
            {events.data?.items.filter((e) => e.status !== 'DRAFT').map((e) => (
              <option key={e.eventId} value={e.eventId}>{e.eventName} ({e.eventDate})</option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void run('xlsx')} disabled={!!busy}>
            {busy === 'xlsx' ? <CircleNotchIcon className="animate-spin" /> : <FileXlsIcon />} ดาวน์โหลด Excel (.xlsx)
          </Button>
          <Button variant="outline" onClick={() => void run('csv')} disabled={!!busy}>
            {busy === 'csv' ? <CircleNotchIcon className="animate-spin" /> : <FileTextIcon />} ดาวน์โหลด CSV
          </Button>
        </div>
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
      </div>
    </div>
  )
}
