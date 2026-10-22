import type { ReactNode } from 'react'
import { CheckCircle2, Clock, FileText, Users, XCircle } from 'lucide-react'
import { LoadState, PageHeader, RefreshInfo, StatusPill, Table } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { formatTime, MEMBER_TYPE_LABEL } from '@/lib/format'
import type { Summary } from '@/types/api'

const POLL_MS = 10_000

function Stat({ label, value, sub, icon, tone = 'default' }: { label: string; value: string; sub?: string; icon: ReactNode; tone?: 'default' | 'success' | 'muted' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'muted' ? 'text-muted-foreground' : 'text-primary'
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={`[&_svg]:size-4 ${color}`}>{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function Bar({ value, max, className = 'bg-primary' }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary" role="presentation">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function QuorumBadge({ quorum }: { quorum: Summary['quorum'] }) {
  if (!quorum.threshold) return <StatusPill tone="muted">ยังไม่ได้ตั้งเกณฑ์องค์ประชุม</StatusPill>
  return quorum.reached ? (
    <StatusPill tone="success">ครบองค์ประชุมแล้ว</StatusPill>
  ) : (
    <StatusPill tone="warning">ยังไม่ครบองค์ประชุม (ขาดอีก {quorum.remaining.toLocaleString('th-TH')} คน)</StatusPill>
  )
}

const n = (v: number) => v.toLocaleString('th-TH')

export function DashboardPage() {
  const q = useApiQuery('dashboard.summary', {}, { pollMs: POLL_MS })
  const s = q.data

  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <PageHeader
        title="Dashboard"
        description={s?.event ? s.event.eventName : 'ยังไม่มีงานประชุมที่เปิดรับลงทะเบียน'}
        actions={<RefreshInfo updatedAt={q.updatedAt} loading={q.loading} onRefresh={() => void q.reload()} />}
      />
      {q.error && <LoadState loading={false} error={`${q.error} (แสดงข้อมูลล่าสุดที่โหลดได้)`} />}
      {!s && <LoadState loading={q.loading} error={q.error} onRetry={() => void q.reload()} />}

      {s && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="สมาชิกทั้งหมด" value={n(s.totals.members)} icon={<Users />} sub="เฉพาะที่มีสิทธิ์" />
            <Stat label="ลงทะเบียนแล้ว" value={n(s.totals.registered)} icon={<CheckCircle2 />} tone="success" sub={`ใบกระดาษ ${n(s.totals.paper)} · ยกเลิก ${n(s.totals.cancelled)}`} />
            <Stat label="ยังไม่ลงทะเบียน" value={n(s.totals.notRegistered)} icon={<XCircle />} tone="muted" />
            <Stat label="ความคืบหน้า" value={`${s.totals.percent}%`} icon={<Clock />} />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">องค์ประชุม (นับเฉพาะสมาชิกสามัญ)</div>
              <QuorumBadge quorum={s.quorum} />
            </div>
            <Bar value={s.quorum.ordinaryRegistered} max={s.quorum.threshold || s.quorum.ordinaryMembers} className={s.quorum.reached ? 'bg-success' : 'bg-warning'} />
            <div className="mt-1 text-sm text-muted-foreground">
              สามัญลงทะเบียน {n(s.quorum.ordinaryRegistered)} / เกณฑ์ {n(s.quorum.threshold)} คน (สมาชิกสามัญทั้งหมด {n(s.quorum.ordinaryMembers)} คน)
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-3 font-semibold">ราย Station</div>
              <div className="grid gap-2">
                {s.byStation.map((st) => (
                  <div key={st.stationId} className="grid grid-cols-[10rem_1fr_3.5rem] items-center gap-2 text-sm">
                    <span className="truncate">{st.stationId} {st.stationName && `· ${st.stationName}`}</span>
                    <Bar value={st.registered} max={Math.max(...s.byStation.map((x) => x.registered), 1)} />
                    <span className="text-right font-medium tabular-nums">{n(st.registered)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 mb-2 font-semibold">ตามประเภทสมาชิก</div>
              <div className="grid gap-2">
                {s.byMemberType.map((t) => (
                  <div key={t.memberType} className="grid grid-cols-[7rem_1fr_6rem] items-center gap-2 text-sm">
                    <span>{MEMBER_TYPE_LABEL[t.memberType] ?? t.memberType}</span>
                    <Bar value={t.registered} max={t.total} className="bg-success" />
                    <span className="text-right tabular-nums">{n(t.registered)} / {n(t.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <FileText className="size-4" /> รายการล่าสุด
              </div>
              {s.recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีการลงทะเบียน</p>
              ) : (
                <ul className="divide-y text-sm">
                  {s.recent.map((r) => (
                    <li key={r.memberId} className="flex items-center gap-3 py-1.5">
                      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{formatTime(r.checkinTime)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {r.fullName} <span className="font-mono text-xs text-muted-foreground">{r.memberId}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">จุด {r.stationId}</span>
                      {r.source === 'PAPER' && <StatusPill tone="info">กระดาษ</StatusPill>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 font-semibold">ตามหน่วยงาน</div>
            <Table
              head={
                <tr>
                  <th>หน่วยงาน</th>
                  <th className="text-right">ลงทะเบียน</th>
                  <th className="text-right">ทั้งหมด</th>
                  <th className="w-1/3">ความคืบหน้า</th>
                </tr>
              }
            >
              {s.byOffice.map((o) => (
                <tr key={o.office}>
                  <td>{o.office}</td>
                  <td className="text-right tabular-nums">{n(o.registered)}</td>
                  <td className="text-right tabular-nums">{n(o.total)}</td>
                  <td>
                    <Bar value={o.registered} max={o.total} className="bg-success" />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
