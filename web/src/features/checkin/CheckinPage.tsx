import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, CheckCircleIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConnection } from '@/hooks/useConnection'
import { useMembers } from '@/hooks/useMembers'
import { MEMBER_TYPE_LABEL } from '@/lib/format'
import type { OpenEvent } from '@/types/api'
import { DetailPanel } from './DetailPanel'
import { SearchPanel } from './SearchPanel'
import { useCheckinFlow } from './useCheckinFlow'

interface Props {
  openEvent: OpenEvent | null
}

/** ค้นหา → เลือก → ตรวจบัตร → ยืนยัน → รายถัดไป ในหน้าเดียว (SPEC.md §8) */
export function CheckinPage({ openEvent }: Props) {
  const members = useMembers()
  const flow = useCheckinFlow()
  const { online } = useConnection()
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const { state } = flow
  const busy = state.kind === 'submitting' || state.kind === 'verifying'
  const selectedId = state.kind === 'idle' ? null : state.member.memberId

  const next = useCallback(() => {
    flow.reset()
    setQuery('')
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [flow])

  // Esc กลับไปค้นหา (ยกเว้นระหว่างส่งข้อมูล และตอน dialog เปิด ซึ่ง dialog จัดการเอง)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy || state.kind === 'idle' || state.kind === 'confirm') return
      if (state.kind === 'unknown') return // ต้องตรวจผลให้ชัดก่อนไปรายถัดไป
      next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, state.kind, next])

  const confirmState = state.kind === 'confirm' ? state : null

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {!online && (
        <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm font-medium text-destructive">
          ขาดการเชื่อมต่ออินเทอร์เน็ต — ระบบจะไม่แสดงว่าสำเร็จจนกว่าเซิร์ฟเวอร์ยืนยัน หากล่มนาน ให้ใช้ใบลงทะเบียนกระดาษ
        </div>
      )}
      {/* มือถือ: แสดงทีละขั้น (ค้นหา → รายละเอียด) · จอกว้าง: สองคอลัมน์คู่กัน */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(320px,2fr)_3fr] md:grid-rows-[minmax(0,1fr)] md:gap-6 md:p-6">
        <div className={`min-h-0 flex-col ${state.kind === 'idle' ? 'flex' : 'hidden md:flex'}`}>
          <SearchPanel
            ref={searchRef}
            members={members}
            query={query}
            onQueryChange={setQuery}
            selectedId={selectedId}
            disabled={busy || state.kind === 'unknown'}
            onSelect={(m) => void flow.select(m)}
          />
        </div>

        <section aria-label="รายละเอียดสมาชิก" className={`min-h-0 overflow-y-auto ${state.kind === 'idle' ? 'hidden md:block' : ''}`}>
          {state.kind !== 'idle' && !busy && state.kind !== 'unknown' && (
            <Button variant="ghost" size="sm" className="mb-3 -ml-2 md:hidden" onClick={next}>
              <ArrowLeftIcon /> กลับไปค้นหา
            </Button>
          )}
          <DetailPanel
            state={state}
            eventOpen={!!openEvent}
            onConfirm={flow.openConfirm}
            onMismatch={flow.reportMismatch}
            onNext={next}
            onRetrySubmit={(m, id) => void flow.submit(m, id)}
            onVerify={(m, id) => void flow.verify(m, id)}
            onReloadStatus={(m) => void flow.select(m)}
          />
        </section>
      </div>

      <Dialog open={!!confirmState} onOpenChange={(open) => !open && flow.cancelConfirm()}>
        <DialogContent showCloseButton={false} initialFocus={confirmRef} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">ยืนยันการลงทะเบียน</DialogTitle>
            <DialogDescription>ตรวจทานข้อมูลอีกครั้งก่อนบันทึก</DialogDescription>
          </DialogHeader>
          {confirmState && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-secondary p-4 text-base">
              <dt className="text-muted-foreground">ชื่อ-นามสกุล</dt>
              <dd className="font-semibold">{confirmState.member.fullName}</dd>
              <dt className="text-muted-foreground">เลขสมาชิก</dt>
              <dd className="font-mono font-semibold">{confirmState.member.memberId}</dd>
              <dt className="text-muted-foreground">หน่วยงาน</dt>
              <dd>{confirmState.member.office || '-'}</dd>
              <dt className="text-muted-foreground">ประเภท</dt>
              <dd>{MEMBER_TYPE_LABEL[confirmState.member.memberType]}</dd>
            </dl>
          )}
          <DialogFooter className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Button size="xl" variant="outline" onClick={flow.cancelConfirm}>
              ยกเลิก <Kbd>Esc</Kbd>
            </Button>
            <Button
              ref={confirmRef}
              size="xl"
              variant="success"
              disabled={busy}
              onClick={() => confirmState && void flow.submit(confirmState.member, confirmState.requestId)}
            >
              {busy ? <CircleNotchIcon className="animate-spin" /> : <CheckCircleIcon />}
              ยืนยัน <Kbd>Enter</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
