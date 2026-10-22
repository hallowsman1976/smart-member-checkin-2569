import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  IdCard,
  Loader2,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTime, MEMBER_TYPE_LABEL } from '@/lib/format'
import type { Member } from '@/types/api'
import type { FlowState } from './useCheckinFlow'

interface Props {
  state: FlowState
  eventOpen: boolean
  onConfirm: () => void
  onMismatch: () => void
  onNext: () => void
  onRetrySubmit: (member: Member, requestId: string) => void
  onVerify: (member: Member, requestId: string) => void
  onReloadStatus: (member: Member) => void
}

function MemberSummary({ member, extra }: { member: Member; extra?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-2xl leading-tight font-semibold">{member.fullName}</div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
        <dt className="text-muted-foreground">เลขสมาชิก</dt>
        <dd className="font-mono font-semibold">{member.memberId}</dd>
        <dt className="text-muted-foreground">หน่วยงาน</dt>
        <dd>{member.office || '-'}</dd>
        <dt className="text-muted-foreground">ประเภทสมาชิก</dt>
        <dd>{MEMBER_TYPE_LABEL[member.memberType]}</dd>
        {extra}
      </dl>
    </div>
  )
}

function Banner({ tone, icon, title, children }: { tone: 'success' | 'warning' | 'danger' | 'info'; icon: ReactNode; title: string; children?: ReactNode }) {
  const tones = {
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning bg-warning/20 text-warning-foreground',
    danger: 'border-destructive/40 bg-destructive/10 text-destructive',
    info: 'border-primary/30 bg-sky-50 text-primary',
  }
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border-2 p-4 ${tones[tone]}`}>
      <div className="shrink-0 [&_svg]:size-8">{icon}</div>
      <div className="min-w-0">
        <div className="text-xl font-semibold">{title}</div>
        {children && <div className="mt-1 text-base text-foreground">{children}</div>}
      </div>
    </div>
  )
}

const NextButton = ({ onNext }: { onNext: () => void }) => (
  <Button size="xl" autoFocus onClick={onNext} className="w-full">
    รายถัดไป (Enter)
  </Button>
)

export function DetailPanel({ state, eventOpen, onConfirm, onMismatch, onNext, onRetrySubmit, onVerify, onReloadStatus }: Props) {
  switch (state.kind) {
    case 'idle':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white/60 p-8 text-center text-muted-foreground">
          <SearchCheck className="size-12" />
          <p className="text-lg">ค้นหาและเลือกสมาชิกจากด้านซ้าย</p>
          <p className="text-sm">ลำดับขั้น: ค้นหา → ตรวจบัตร → ยืนยัน → รายถัดไป</p>
        </div>
      )

    case 'loadingStatus':
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner tone="info" icon={<Loader2 className="animate-spin" />} title="กำลังตรวจสอบสถานะการลงทะเบียน…" />
        </div>
      )

    case 'statusError':
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner tone="danger" icon={<CircleAlert />} title="ตรวจสอบสถานะไม่สำเร็จ">
            {state.message}
          </Banner>
          <Button size="xl" autoFocus variant="outline" className="w-full" onClick={() => onReloadStatus(state.member)}>
            <RefreshCw /> ลองตรวจสอบอีกครั้ง
          </Button>
        </div>
      )

    case 'review':
    case 'confirm': {
      const { status } = state
      const detail = status.member
      if (status.found && status.checkin?.status === 'REGISTERED') {
        return (
          <div className="space-y-4">
            <MemberSummary member={state.member} />
            <Banner tone="warning" icon={<AlertTriangle />} title="สมาชิกรายนี้ลงทะเบียนแล้ว">
              เมื่อ {formatTime(status.checkin.checkinTime)} ที่ {status.checkin.stationName || status.checkin.stationId}
              {status.checkin.source === 'PAPER' && ' (บันทึกจากใบลงทะเบียนกระดาษ)'}
            </Banner>
            <NextButton onNext={onNext} />
          </div>
        )
      }
      if (detail && !detail.active) {
        return (
          <div className="space-y-4">
            <MemberSummary member={state.member} />
            <Banner tone="danger" icon={<XCircle />} title="สมาชิกรายนี้ไม่มีสิทธิ์ลงทะเบียน">
              กรุณาส่งสมาชิกไปที่ผู้ดูแลระบบ
            </Banner>
            <NextButton onNext={onNext} />
          </div>
        )
      }
      return (
        <div className="space-y-4">
          <MemberSummary
            member={state.member}
            extra={
              <>
                <dt className="text-muted-foreground">สถานะ</dt>
                <dd>{status.found ? 'เคยถูกยกเลิก — ลงทะเบียนใหม่ได้' : 'ยังไม่ลงทะเบียน'}</dd>
              </>
            }
          />
          <div className="flex gap-3 rounded-xl border bg-sky-50 p-4">
            <IdCard className="size-8 shrink-0 text-primary" />
            <div>
              <div className="font-semibold">ตรวจบัตรประชาชนหรือบัตรข้าราชการ</div>
              <div className="text-sm text-muted-foreground">
                เทียบชื่อ-นามสกุลกับบัตรด้วยสายตา ไม่ต้องบันทึกเลขบัตรหรือถ่ายภาพ
              </div>
            </div>
          </div>
          {!eventOpen && (
            <Banner tone="danger" icon={<XCircle />} title="ยังไม่เปิดรับลงทะเบียน">
              ขณะนี้ไม่มีงานประชุมที่เปิดอยู่
            </Banner>
          )}
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <Button size="xl" variant="success" autoFocus onClick={onConfirm} disabled={!eventOpen}>
              <CheckCircle2 /> ข้อมูลตรง ลงทะเบียน (Enter)
            </Button>
            <Button size="xl" variant="outline" onClick={onMismatch}>
              <ShieldAlert /> ข้อมูลไม่ตรง
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">กด Esc เพื่อกลับไปค้นหา</p>
        </div>
      )
    }

    case 'mismatch':
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner tone="danger" icon={<ShieldAlert />} title="หยุดการลงทะเบียน — ข้อมูลไม่ตรงกับบัตร">
            ยังไม่มีการบันทึกใด ๆ กรุณาส่งสมาชิกไปที่ผู้ดูแลระบบเพื่อตรวจสอบ
          </Banner>
          <NextButton onNext={onNext} />
        </div>
      )

    case 'submitting':
    case 'verifying':
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner
            tone="info"
            icon={<Loader2 className="animate-spin" />}
            title={state.kind === 'submitting' ? 'กำลังบันทึกการลงทะเบียน…' : 'กำลังตรวจสอบผลกับเซิร์ฟเวอร์…'}
          >
            กรุณารอสักครู่ อย่าปิดหน้านี้
          </Banner>
        </div>
      )

    case 'busy':
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner tone="warning" icon={<AlertTriangle />} title="ระบบกำลังทำงานหนัก ยังไม่ได้บันทึก">
            {state.message}
          </Banner>
          <Button size="xl" autoFocus className="w-full" onClick={() => onRetrySubmit(state.member, state.requestId)}>
            <RotateCcw /> ลองอีกครั้ง
          </Button>
        </div>
      )

    case 'unknown':
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner tone="warning" icon={<AlertTriangle />} title={state.notRecorded ? 'ยังไม่ได้บันทึก' : 'ไม่ทราบผลการลงทะเบียน'}>
            {state.message}
          </Banner>
          <div className="grid grid-cols-2 gap-3">
            <Button size="xl" variant="outline" autoFocus={!state.notRecorded} onClick={() => onVerify(state.member, state.requestId)}>
              <RefreshCw /> ตรวจสอบผลอีกครั้ง
            </Button>
            <Button size="xl" autoFocus={state.notRecorded} onClick={() => onRetrySubmit(state.member, state.requestId)}>
              <RotateCcw /> ส่งอีกครั้ง
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            การส่งอีกครั้งใช้รหัสคำขอเดิม ระบบจะไม่บันทึกซ้ำแม้รายการแรกบันทึกไปแล้ว
          </p>
        </div>
      )

    case 'registered': {
      const { member, checkin } = state.result
      return (
        <div className="space-y-4">
          <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border-2 border-success/40 bg-success/10 p-6 text-center">
            <CheckCircle2 className="size-16 text-success" />
            <div className="text-2xl font-bold text-success">ลงทะเบียนสำเร็จ</div>
            <div className="text-2xl font-semibold">{member.fullName}</div>
            <div className="text-lg">
              เลขสมาชิก <span className="font-mono font-semibold">{member.memberId}</span> · เวลา {formatTime(checkin.checkinTime)}
            </div>
            <div className="text-sm text-muted-foreground">{member.office}</div>
          </div>
          <NextButton onNext={onNext} />
        </div>
      )
    }

    case 'duplicate': {
      const { checkin } = state.result
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner tone="warning" icon={<AlertTriangle />} title="สมาชิกรายนี้ลงทะเบียนแล้ว">
            ลงทะเบียนครั้งแรกเมื่อ {formatTime(checkin.checkinTime)} ที่ {checkin.stationName || checkin.stationId}
          </Banner>
          <NextButton onNext={onNext} />
        </div>
      )
    }

    case 'failed':
      return (
        <div className="space-y-4">
          <MemberSummary member={state.member} />
          <Banner tone="danger" icon={<XCircle />} title="ลงทะเบียนไม่สำเร็จ">
            {state.message}
          </Banner>
          <NextButton onNext={onNext} />
        </div>
      )
  }
}
