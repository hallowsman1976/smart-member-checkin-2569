import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LoadState, PageHeader, RefreshInfo, Table } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'

const PAGE = 100

export function AuditPage() {
  const [page, setPage] = useState(0)
  const q = useApiQuery('audit.list', { limit: PAGE, offset: page * PAGE })
  const total = q.data?.total ?? 0

  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <PageHeader title="Audit Log" description="เรียงจากล่าสุด" actions={<RefreshInfo updatedAt={q.updatedAt} loading={q.loading} onRefresh={() => void q.reload()} />} />
      {!q.data && <LoadState loading={q.loading} error={q.error} onRetry={() => void q.reload()} />}
      {q.data && (
        <>
          <Table head={<tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายการ</th><th>เหตุผล</th><th>รายละเอียด</th></tr>}>
            {q.data.items.map((l) => (
              <tr key={l.logId} className="align-top">
                <td className="whitespace-nowrap tabular-nums">{l.timestamp.replace('T', ' ').replace('+07:00', '')}</td>
                <td className="font-mono text-xs">{l.userId}</td>
                <td className="font-medium">{l.action}</td>
                <td className="text-xs">{l.entityType} {l.entityId}</td>
                <td>{l.reason}</td>
                <td className="max-w-md font-mono text-xs break-all text-muted-foreground">{l.details}</td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>ทั้งหมด {total.toLocaleString('th-TH')} รายการ</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ใหม่กว่า</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>เก่ากว่า</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
