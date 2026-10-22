import { useState } from 'react'
import { KeyIcon, LockOpenIcon, PencilSimpleIcon, UserPlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Field, FormDialog, LoadState, PageHeader, RefreshInfo, selectClass, StatusPill, Table, TextInput } from '@/components/common'
import { useApiQuery } from '@/hooks/useApiQuery'
import { formatTime } from '@/lib/format'
import { api } from '@/services/api'
import type { AdminUser, Role } from '@/types/api'

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'ผู้ดูแลระบบ', SUPERVISOR: 'ผู้ควบคุม', STAFF: 'เจ้าหน้าที่ลงทะเบียน' }

type Dialog =
  | { kind: 'create'; username: string; fullName: string; role: Role; defaultStationId: string; pin: string }
  | { kind: 'edit'; user: AdminUser; fullName: string; role: Role; defaultStationId: string; active: boolean }
  | { kind: 'pin'; user: AdminUser; pin: string }

const pinOnly = (v: string) => v.replace(/\D/g, '').slice(0, 6)

export function UsersPage({ currentUserId }: { currentUserId: string }) {
  const q = useApiQuery('admin.users.list', {})
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [message, setMessage] = useState('')

  const patch = (p: Partial<Dialog>) => setDialog((d) => (d ? ({ ...d, ...p } as Dialog) : d))

  const submit = async (): Promise<string | null> => {
    if (!dialog) return null
    let res
    if (dialog.kind === 'create') {
      res = await api('admin.users.create', { username: dialog.username.trim(), fullName: dialog.fullName, role: dialog.role, defaultStationId: dialog.defaultStationId, pin: dialog.pin })
    } else if (dialog.kind === 'edit') {
      res = await api('admin.users.update', { userId: dialog.user.userId, fullName: dialog.fullName, role: dialog.role, defaultStationId: dialog.defaultStationId, active: dialog.active })
    } else {
      res = await api('admin.users.update', { userId: dialog.user.userId, resetPin: dialog.pin })
    }
    if (!res.success) return res.message
    setMessage(dialog.kind === 'pin' ? `รีเซ็ต PIN ของ ${dialog.user.fullName} แล้ว — แจ้ง PIN ใหม่ให้ผู้ใช้โดยตรง ระบบจะบังคับให้เปลี่ยนเมื่อเข้าใช้ครั้งถัดไป` : res.message)
    void q.reload()
    return null
  }

  const unlock = async (u: AdminUser) => {
    const res = await api('admin.users.update', { userId: u.userId, unlock: true })
    setMessage(res.success ? `ปลดล็อก ${u.fullName} แล้ว` : res.message)
    void q.reload()
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <PageHeader
        title="ผู้ใช้ระบบ"
        actions={
          <>
            <RefreshInfo updatedAt={q.updatedAt} loading={q.loading} onRefresh={() => void q.reload()} />
            <Button onClick={() => setDialog({ kind: 'create', username: '', fullName: '', role: 'STAFF', defaultStationId: '', pin: '' })}>
              <UserPlusIcon /> เพิ่มผู้ใช้
            </Button>
          </>
        }
      />
      {message && <div className="mb-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">{message}</div>}
      {!q.data && <LoadState loading={q.loading} error={q.error} onRetry={() => void q.reload()} />}
      {q.data && (
        <Table head={<tr><th>ชื่อผู้ใช้</th><th>ชื่อ-นามสกุล</th><th>บทบาท</th><th>จุดเริ่มต้น</th><th>สถานะ</th><th /></tr>}>
          {q.data.items.map((u) => (
            <tr key={u.userId}>
              <td className="font-mono">{u.username}</td>
              <td>{u.fullName}{u.userId === currentUserId && <span className="text-xs text-muted-foreground"> (คุณ)</span>}</td>
              <td>{ROLE_LABEL[u.role] ?? u.role}</td>
              <td>{u.defaultStationId || '-'}</td>
              <td className="space-x-1">
                {u.active ? <StatusPill tone="success">ใช้งาน</StatusPill> : <StatusPill tone="muted">ปิดใช้งาน</StatusPill>}
                {u.lockedUntil && <StatusPill tone="danger">ล็อกถึง {formatTime(u.lockedUntil)}</StatusPill>}
                {u.mustChangePin && <StatusPill tone="warning">รอเปลี่ยน PIN</StatusPill>}
              </td>
              <td className="text-right whitespace-nowrap">
                {u.lockedUntil && (
                  <Button variant="ghost" size="sm" onClick={() => void unlock(u)}><LockOpenIcon /> ปลดล็อก</Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'pin', user: u, pin: '' })}><KeyIcon /> รีเซ็ต PIN</Button>
                <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'edit', user: u, fullName: u.fullName, role: u.role, defaultStationId: u.defaultStationId, active: u.active })}>
                  <PencilSimpleIcon /> แก้ไข
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {dialog && (
        <FormDialog
          open
          title={dialog.kind === 'create' ? 'เพิ่มผู้ใช้' : dialog.kind === 'edit' ? `แก้ไข ${dialog.user.username}` : `รีเซ็ต PIN ของ ${dialog.user.fullName}`}
          description={dialog.kind !== 'edit' ? 'PIN 6 หลัก ห้ามเรียงกันหรือซ้ำกันทั้งหมด ผู้ใช้ต้องเปลี่ยน PIN เมื่อเข้าใช้ครั้งแรก' : undefined}
          onClose={() => setDialog(null)}
          onSubmit={submit}
        >
          {dialog.kind === 'create' && (
            <Field id="u-name" label="ชื่อผู้ใช้ (a-z, 0-9, . _ -)">
              <TextInput id="u-name" autoFocus autoCapitalize="none" value={dialog.username} onChange={(e) => patch({ username: e.target.value.toLowerCase() })} />
            </Field>
          )}
          {dialog.kind !== 'pin' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="u-full" label="ชื่อ-นามสกุล">
                <TextInput id="u-full" value={dialog.fullName} onChange={(e) => patch({ fullName: e.target.value })} />
              </Field>
              <Field id="u-role" label="บทบาท">
                <select id="u-role" className={`${selectClass} h-9`} value={dialog.role} onChange={(e) => patch({ role: e.target.value as Role })}>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </Field>
              <Field id="u-station" label="จุดเริ่มต้น (ไม่บังคับ)">
                <TextInput id="u-station" value={dialog.defaultStationId} onChange={(e) => patch({ defaultStationId: e.target.value.trim() })} placeholder="เช่น 01" />
              </Field>
            </div>
          )}
          {dialog.kind === 'edit' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={dialog.active} onChange={(e) => patch({ active: e.target.checked })} />
              เปิดใช้งาน (ปิดแล้ว session ที่ค้างอยู่จะใช้ไม่ได้ทันที)
            </label>
          )}
          {dialog.kind !== 'edit' && (
            <Field id="u-pin" label={dialog.kind === 'create' ? 'PIN เริ่มต้น' : 'PIN ใหม่'}>
              <TextInput id="u-pin" inputMode="numeric" autoComplete="off" value={dialog.pin} onChange={(e) => patch({ pin: pinOnly(e.target.value) })} autoFocus={dialog.kind === 'pin'} />
            </Field>
          )}
        </FormDialog>
      )}
    </div>
  )
}
