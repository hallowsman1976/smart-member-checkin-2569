import { useMemo, useState } from 'react'
import { DownloadSimpleIcon, FileArrowUpIcon, PencilSimpleIcon, UserPlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Field, FormDialog, LoadState, PageHeader, RefreshInfo, selectClass, StatusPill, Table, TextInput } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { MEMBER_TYPE_LABEL } from '@/lib/format'
import { indexMembers, searchMembers } from '@/lib/search'
import { downloadImportTemplate } from '@/lib/spreadsheet'
import { api } from '@/services/api'
import type { MemberType } from '@/types/api'
import { ImportDialog } from './ImportDialog'

const PAGE = 100

interface MemberForm {
  memberId: string
  fullName: string
  office: string
  memberType: MemberType
  active: boolean
  reason: string
}

const empty: MemberForm = { memberId: '', fullName: '', office: '', memberType: 'ORDINARY', active: true, reason: '' }

export function MembersPage() {
  const q = useApiQuery('admin.members.list', {})
  const events = useApiQuery('events.list', {})
  const eventOpen = !!events.data?.items.some((e) => e.status === 'OPEN')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<null | { mode: 'add' | 'edit'; form: MemberForm }>(null)
  const [importOpen, setImportOpen] = useState(false)

  const indexed = useMemo(() => (q.data ? indexMembers(q.data.items) : []), [q.data])
  const filtered = useMemo(() => {
    if (!query.trim()) return indexed
    return searchMembers(indexed, query, 500)
  }, [indexed, query])
  const rows = filtered.slice(page * PAGE, (page + 1) * PAGE)

  const set = <K extends keyof MemberForm>(k: K, v: MemberForm[K]) =>
    setDialog((d) => (d ? { ...d, form: { ...d.form, [k]: v } } : d))

  const save = async () => {
    if (!dialog) return null
    const f = dialog.form
    const res =
      dialog.mode === 'add'
        ? await api('admin.members.add', { memberId: f.memberId.trim(), fullName: f.fullName, office: f.office, memberType: f.memberType, reason: f.reason })
        : await api('admin.members.update', { memberId: f.memberId, fullName: f.fullName, office: f.office, memberType: f.memberType, active: f.active, reason: f.reason })
    if (!res.success) return res.message
    void q.reload()
    return null
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <PageHeader
        title="สมาชิก"
        description={q.data ? `ทั้งหมด ${q.data.items.length.toLocaleString('th-TH')} ราย (มีสิทธิ์ ${q.data.items.filter((m) => m.active).length.toLocaleString('th-TH')} ราย)` : undefined}
        actions={
          <>
            <RefreshInfo updatedAt={q.updatedAt} loading={q.loading} onRefresh={() => void q.reload()} />
            <Button onClick={() => setDialog({ mode: 'add', form: { ...empty } })}>
              <UserPlusIcon /> เพิ่มสมาชิก (Walk-in)
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={eventOpen} title={eventOpen ? 'ปิดงานประชุมก่อนจึงนำเข้าไฟล์ได้' : undefined}>
              <FileArrowUpIcon /> นำเข้าไฟล์
            </Button>
            <Button variant="ghost" onClick={() => void downloadImportTemplate()} title="ดาวน์โหลดแม่แบบ .xlsx สำหรับนำเข้าสมาชิก">
              <DownloadSimpleIcon /> แม่แบบนำเข้า
            </Button>
          </>
        }
      />
      {eventOpen && <p className="mb-3 text-sm text-muted-foreground">ขณะเปิดรับลงทะเบียน นำเข้าไฟล์ไม่ได้ ให้เพิ่มสมาชิกทีละราย</p>}

      <TextInput
        aria-label="ค้นหาสมาชิก"
        placeholder="ค้นหาเลขสมาชิกหรือชื่อ"
        className="mb-3 max-w-md"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPage(0) }}
      />

      {!q.data && <LoadState loading={q.loading} error={q.error} onRetry={() => void q.reload()} />}
      {q.data && (
        <>
          <Table
            head={
              <tr>
                <th>เลขสมาชิก</th>
                <th>ชื่อ-นามสกุล</th>
                <th>หน่วยงาน</th>
                <th>ประเภท</th>
                <th>สถานะ</th>
                <th />
              </tr>
            }
          >
            {rows.map((m) => (
              <tr key={m.memberId}>
                <td className="font-mono">{m.memberId}</td>
                <td>{m.fullName}</td>
                <td className="text-muted-foreground">{m.office}</td>
                <td>{MEMBER_TYPE_LABEL[m.memberType]}</td>
                <td>{m.active ? <StatusPill tone="success">มีสิทธิ์</StatusPill> : <StatusPill tone="muted">ไม่มีสิทธิ์</StatusPill>}</td>
                <td className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: 'edit', form: { memberId: m.memberId, fullName: m.fullName, office: m.office, memberType: m.memberType, active: m.active, reason: '' } })}
                  >
                    <PencilSimpleIcon /> แก้ไข
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>แสดง {rows.length} จาก {filtered.length.toLocaleString('th-TH')} ราย</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
            </div>
          </div>
        </>
      )}

      {dialog && (
        <FormDialog
          open
          title={dialog.mode === 'add' ? 'เพิ่มสมาชิก (Walk-in)' : `แก้ไขสมาชิก ${dialog.form.memberId}`}
          description={dialog.mode === 'add' ? 'ใช้เมื่อสมาชิกตัวจริงมาถึงงานแต่ยังไม่มีชื่อในระบบ จุดลงทะเบียนจะเห็นหลังกดรีเฟรชรายชื่อ' : undefined}
          onClose={() => setDialog(null)}
          onSubmit={save}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="m-id" label="เลขสมาชิก">
              <TextInput id="m-id" value={dialog.form.memberId} disabled={dialog.mode === 'edit'} onChange={(e) => set('memberId', e.target.value)} autoFocus={dialog.mode === 'add'} />
            </Field>
            <Field id="m-type" label="ประเภทสมาชิก">
              <select id="m-type" className={`${selectClass} h-9`} value={dialog.form.memberType} onChange={(e) => set('memberType', e.target.value as MemberType)}>
                <option value="ORDINARY">สามัญ</option>
                <option value="ASSOCIATE">สมทบ</option>
              </select>
            </Field>
            <Field id="m-name" label="ชื่อ-นามสกุล">
              <TextInput id="m-name" value={dialog.form.fullName} onChange={(e) => set('fullName', e.target.value)} />
            </Field>
            <Field id="m-office" label="หน่วยงาน">
              <TextInput id="m-office" value={dialog.form.office} onChange={(e) => set('office', e.target.value)} />
            </Field>
          </div>
          {dialog.mode === 'edit' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dialog.form.active} onChange={(e) => set('active', e.target.checked)} className="size-4" />
              มีสิทธิ์ลงทะเบียน
            </label>
          )}
          <Field id="m-reason" label="เหตุผล (บันทึกใน Audit Log)">
            <TextInput id="m-reason" value={dialog.form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="เช่น สมัครหลังปิดรายชื่อ, แก้ชื่อสะกดผิด" />
          </Field>
        </FormDialog>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void q.reload()} />
    </div>
  )
}
