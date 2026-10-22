import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LoadState, PageHeader, RefreshInfo, selectClass, StatusPill, Table } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { formatTime, MEMBER_TYPE_LABEL } from '@/lib/format'
import type { Role } from '@/types/api'

const PAGE = 50

/** Staff: เฉพาะ Station ตัวเองใน Open Event (server บังคับ); Supervisor/Admin: กรองงานและจุดได้ */
export function HistoryPage({ role }: { role: Role }) {
  const canFilter = role !== 'STAFF'
  const [eventId, setEventId] = useState('')
  const [stationId, setStationId] = useState('')
  const [page, setPage] = useState(0)
  const events = useApiQuery('events.list', {}, { enabled: canFilter })
  const q = useApiQuery('checkin.history', { limit: PAGE, offset: page * PAGE, eventId: eventId || undefined, stationId: stationId || undefined }, { pollMs: 30_000 })
  const total = q.data?.total ?? 0

  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <PageHeader
        title="ประวัติการลงทะเบียน"
        description={canFilter ? 'ค่าเริ่มต้นแสดงงานที่เปิดอยู่' : 'เฉพาะจุดลงทะเบียนของคุณในงานที่เปิดอยู่'}
        actions={<RefreshInfo updatedAt={q.updatedAt} loading={q.loading} onRefresh={() => void q.reload()} />}
      />
      {canFilter && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select aria-label="งานประชุม" className={`${selectClass} w-auto`} value={eventId} onChange={(e) => { setEventId(e.target.value); setPage(0) }}>
            <option value="">งานที่เปิดอยู่</option>
            {events.data?.items.map((e) => (
              <option key={e.eventId} value={e.eventId}>{e.eventName} ({e.eventDate})</option>
            ))}
          </select>
          <input
            aria-label="กรองจุดลงทะเบียน"
            placeholder="จุด เช่น 01"
            className={`${selectClass} w-32`}
            value={stationId}
            onChange={(e) => { setStationId(e.target.value.trim()); setPage(0) }}
          />
        </div>
      )}
      {!q.data && <LoadState loading={q.loading} error={q.error} onRetry={() => void q.reload()} />}
      {q.data && (
        <>
          <Table
            head={
              <tr>
                <th>เวลา</th>
                <th>เลขสมาชิก</th>
                <th>ชื่อ-นามสกุล</th>
                <th>หน่วยงาน</th>
                <th>ประเภท</th>
                <th>จุด</th>
                <th>สถานะ</th>
              </tr>
            }
          >
            {q.data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">ยังไม่มีรายการ</td>
              </tr>
            )}
            {q.data.items.map((i) => (
              <tr key={i.checkinId}>
                <td className="tabular-nums whitespace-nowrap">{formatTime(i.checkinTime)}</td>
                <td className="font-mono">{i.memberId}</td>
                <td>{i.fullName}</td>
                <td className="text-muted-foreground">{i.office}</td>
                <td>{i.memberType ? MEMBER_TYPE_LABEL[i.memberType] : ''}</td>
                <td>{i.stationId}</td>
                <td className="space-x-1">
                  {i.status === 'REGISTERED' ? <StatusPill tone="success">ลงทะเบียน</StatusPill> : <StatusPill tone="danger">ยกเลิก</StatusPill>}
                  {i.source === 'PAPER' && <StatusPill tone="info">กระดาษ</StatusPill>}
                </td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>ทั้งหมด {total.toLocaleString('th-TH')} รายการ</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
