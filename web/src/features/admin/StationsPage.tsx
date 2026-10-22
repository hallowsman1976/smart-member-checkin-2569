import { useState } from 'react'
import { MapPinPlus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormDialog, LoadState, PageHeader, RefreshInfo, StatusPill, Table, TextInput } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { api } from '@/services/api'

interface Form {
  isNew: boolean
  stationId: string
  stationName: string
  active: boolean
}

export function StationsPage() {
  const q = useApiQuery('admin.stations.list', {})
  const [form, setForm] = useState<Form | null>(null)

  const save = async () => {
    if (!form) return null
    const res = await api('admin.stations.upsert', { stationId: form.stationId.trim(), stationName: form.stationName.trim(), active: form.active })
    if (!res.success) return res.message
    void q.reload()
    return null
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <PageHeader
        title="จุดลงทะเบียน"
        description="ปิดจุดแล้ว เจ้าหน้าที่ที่ login อยู่ที่จุดนั้นจะต้องเข้าสู่ระบบใหม่"
        actions={
          <>
            <RefreshInfo updatedAt={q.updatedAt} loading={q.loading} onRefresh={() => void q.reload()} />
            <Button onClick={() => setForm({ isNew: true, stationId: '', stationName: '', active: true })}><MapPinPlus /> เพิ่มจุด</Button>
          </>
        }
      />
      {!q.data && <LoadState loading={q.loading} error={q.error} onRetry={() => void q.reload()} />}
      {q.data && (
        <Table head={<tr><th>รหัส</th><th>ชื่อจุด</th><th>สถานะ</th><th /></tr>}>
          {q.data.items.map((s) => (
            <tr key={s.stationId}>
              <td className="font-mono">{s.stationId}</td>
              <td>{s.stationName}</td>
              <td>{s.active ? <StatusPill tone="success">เปิด</StatusPill> : <StatusPill tone="muted">ปิด</StatusPill>}</td>
              <td className="text-right">
                <Button variant="ghost" size="sm" onClick={() => setForm({ isNew: false, ...s })}><Pencil /> แก้ไข</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {form && (
        <FormDialog open title={form.isNew ? 'เพิ่มจุดลงทะเบียน' : `แก้ไขจุด ${form.stationId}`} onClose={() => setForm(null)} onSubmit={save}>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field id="s-id" label="รหัส">
              <TextInput id="s-id" value={form.stationId} disabled={!form.isNew} autoFocus={form.isNew} onChange={(e) => setForm({ ...form, stationId: e.target.value })} />
            </Field>
            <Field id="s-name" label="ชื่อจุด">
              <TextInput id="s-name" value={form.stationName} onChange={(e) => setForm({ ...form, stationName: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            เปิดใช้งาน
          </label>
        </FormDialog>
      )}
    </div>
  )
}
