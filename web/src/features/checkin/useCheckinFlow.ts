import { useCallback, useRef, useState } from 'react'
import { api, newRequestId } from '@/services/api'
import type { ApiResponse, CheckinResultData, CheckinStatusData, Member } from '@/types/api'

/**
 * ขั้นตอน Check-in ฝั่ง client — SPEC.md §6
 * - requestId สร้างครั้งเดียวต่อความตั้งใจหนึ่งครั้ง (ตอนเปิด dialog ยืนยัน) และใช้ซ้ำทุกครั้งที่ retry
 * - ไม่แสดงว่าสำเร็จจนกว่า server จะตอบ REGISTERED (หรือ checkin.status ยืนยันจาก requestId)
 */
export type FlowState =
  | { kind: 'idle' }
  | { kind: 'loadingStatus'; member: Member }
  | { kind: 'statusError'; member: Member; message: string }
  | { kind: 'review'; member: Member; status: CheckinStatusData }
  | { kind: 'mismatch'; member: Member }
  | { kind: 'confirm'; member: Member; status: CheckinStatusData; requestId: string }
  | { kind: 'submitting'; member: Member; requestId: string }
  | { kind: 'verifying'; member: Member; requestId: string }
  | { kind: 'unknown'; member: Member; requestId: string; message: string; notRecorded: boolean }
  | { kind: 'busy'; member: Member; requestId: string; message: string }
  | { kind: 'registered'; member: Member; result: CheckinResultData }
  | { kind: 'duplicate'; member: Member; result: CheckinResultData; message: string }
  | { kind: 'failed'; member: Member; code: ApiResponse['code']; message: string }

export function useCheckinFlow() {
  const [state, setState] = useState<FlowState>({ kind: 'idle' })
  const inFlight = useRef(false)

  const reset = useCallback(() => setState({ kind: 'idle' }), [])

  const select = useCallback(async (member: Member) => {
    setState({ kind: 'loadingStatus', member })
    const res = await api('checkin.status', { memberId: member.memberId })
    if (res.success && res.data) {
      if (!res.data.member) {
        setState({ kind: 'failed', member, code: 'MEMBER_NOT_FOUND', message: 'ไม่พบข้อมูลสมาชิกในระบบ กรุณาติดต่อผู้ดูแลระบบ' })
      } else {
        setState({ kind: 'review', member, status: res.data })
      }
    } else if (res.code !== 'UNAUTHORIZED') {
      setState({ kind: 'statusError', member, message: res.message })
    }
  }, [])

  const reportMismatch = useCallback(() => {
    setState((s) => ('member' in s ? { kind: 'mismatch', member: s.member } : s))
  }, [])

  const openConfirm = useCallback(() => {
    setState((s) => (s.kind === 'review' ? { kind: 'confirm', member: s.member, status: s.status, requestId: newRequestId() } : s))
  }, [])

  const cancelConfirm = useCallback(() => {
    setState((s) => (s.kind === 'confirm' ? { kind: 'review', member: s.member, status: s.status } : s))
  }, [])

  /** ตรวจผลด้วย requestId หลัง UNKNOWN/network error */
  const verify = useCallback(async (member: Member, requestId: string) => {
    setState({ kind: 'verifying', member, requestId })
    const res = await api('checkin.status', { requestId })
    if (res.success && res.data) {
      const { found, checkin, member: detail } = res.data
      if (found && checkin && checkin.status === 'REGISTERED' && detail) {
        setState({ kind: 'registered', member, result: { member: detail, checkin, replayed: true } })
        return
      }
      setState({
        kind: 'unknown',
        member,
        requestId,
        notRecorded: true,
        message: 'ตรวจสอบแล้ว ระบบยังไม่ได้บันทึกรายการนี้ กดส่งอีกครั้งได้อย่างปลอดภัย',
      })
      return
    }
    if (res.code === 'UNAUTHORIZED') return
    setState({
      kind: 'unknown',
      member,
      requestId,
      notRecorded: false,
      message: 'ยังตรวจสอบผลไม่ได้ เนื่องจากเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ อย่าเพิ่งให้สมาชิกออกจากจุดลงทะเบียน',
    })
  }, [])

  const submit = useCallback(
    async (member: Member, requestId: string) => {
      if (inFlight.current) return
      inFlight.current = true
      setState({ kind: 'submitting', member, requestId })
      try {
        const res = await api('checkin.create', { memberId: member.memberId }, { requestId })
        switch (res.code) {
          case 'REGISTERED':
            setState({ kind: 'registered', member, result: res.data! })
            break
          case 'ALREADY_REGISTERED':
            setState({ kind: 'duplicate', member, result: res.data!, message: res.message })
            break
          case 'BUSY':
            setState({ kind: 'busy', member, requestId, message: res.message })
            break
          case 'UNKNOWN':
            await verify(member, requestId)
            break
          case 'UNAUTHORIZED':
            break // App พากลับหน้า Login; server ปฏิเสธก่อนบันทึก
          default:
            setState({ kind: 'failed', member, code: res.code, message: res.message })
        }
      } finally {
        inFlight.current = false
      }
    },
    [verify],
  )

  return { state, select, reportMismatch, openConfirm, cancelConfirm, submit, verify, reset }
}
