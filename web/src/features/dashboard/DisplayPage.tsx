import { Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApiQuery } from '@/hooks/useApiQuery'
import { formatClock } from '@/lib/format'
import { Bar } from './DashboardPage'

/** จอฉายในห้องประชุม: ตัวอักษรใหญ่ ไม่มีชื่อสมาชิก (SPEC.md §8) */
export function DisplayPage() {
  const q = useApiQuery('display.summary', {}, { pollMs: 10_000 })
  const s = q.data
  const n = (v: number) => v.toLocaleString('th-TH')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-b from-sky-50 to-white p-6 text-center">
      <Button
        variant="ghost"
        size="sm"
        className="self-end"
        onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
      >
        <Maximize /> เต็มจอ
      </Button>
      {!s ? (
        <p className="text-2xl text-muted-foreground">{q.error || 'กำลังโหลด…'}</p>
      ) : (
        <>
          <div>
            <div className="text-[clamp(1.5rem,3vw,2.5rem)] font-semibold text-primary">{s.event?.eventName ?? 'ยังไม่เปิดรับลงทะเบียน'}</div>
            <div className="text-lg text-muted-foreground">สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด</div>
          </div>

          <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <div className="text-xl text-muted-foreground">ลงทะเบียนแล้ว</div>
              <div className="text-[clamp(3rem,9vw,7rem)] leading-none font-bold text-success tabular-nums">{n(s.totals.registered)}</div>
            </div>
            <div>
              <div className="text-xl text-muted-foreground">สมาชิกทั้งหมด</div>
              <div className="text-[clamp(3rem,9vw,7rem)] leading-none font-bold tabular-nums">{n(s.totals.members)}</div>
            </div>
            <div>
              <div className="text-xl text-muted-foreground">ความคืบหน้า</div>
              <div className="text-[clamp(3rem,9vw,7rem)] leading-none font-bold text-primary tabular-nums">{s.totals.percent}%</div>
            </div>
          </div>

          <div className="w-full max-w-4xl">
            <div className="h-6 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.min(100, s.totals.percent)}%` }} />
            </div>
          </div>

          {s.quorum.threshold > 0 && (
            <div
              className={`rounded-2xl border-4 px-8 py-4 text-[clamp(1.5rem,3.5vw,3rem)] font-bold ${
                s.quorum.reached ? 'border-success bg-success/10 text-success' : 'border-warning bg-warning/20 text-warning-foreground'
              }`}
            >
              {s.quorum.reached
                ? `ครบองค์ประชุมแล้ว (${n(s.quorum.ordinaryRegistered)} คน)`
                : `องค์ประชุม ${n(s.quorum.ordinaryRegistered)} / ${n(s.quorum.threshold)} คน`}
            </div>
          )}

          <div className="grid w-full max-w-5xl grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            {s.byStation.map((st) => (
              <div key={st.stationId} className="text-left">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>จุด {st.stationId}</span>
                  <span className="font-semibold text-foreground tabular-nums">{n(st.registered)}</span>
                </div>
                <Bar value={st.registered} max={Math.max(...s.byStation.map((x) => x.registered), 1)} />
              </div>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            อัปเดตล่าสุด {q.updatedAt ? formatClock(q.updatedAt) : '-'} น.{q.error && ` · ${q.error}`}
          </div>
        </>
      )}
    </div>
  )
}
