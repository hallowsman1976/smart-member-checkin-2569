// Load test ผ่าน proxy (/api) — SPEC.md §12 ข้อ 2–4
// ใช้กับ staging หรือเครื่อง dev เท่านั้น: สคริปต์นี้ "ลงทะเบียนจริง" ใน Open Event
//
// ตัวแปร env:
//   LOAD_BASE_URL   เช่น https://staging-xxx.pages.dev หรือ http://127.0.0.1:8788 (บังคับ)
//   LOAD_CONFIRM    ต้องเป็น "yes" เพื่อยืนยันว่าไม่ใช่ production
//   LOAD_STAFF      ชื่อผู้ใช้ Staff 8 คน คั่นด้วย , (ค่าเริ่มต้น staff01..staff08)
//   LOAD_PIN        PIN ของ Staff ทุกคน (ใช้ PIN เดียวกันสำหรับบัญชีทดสอบ) — ถ้าไม่ตั้ง สคริปต์จะถามตอนรัน
//   LOAD_SUPERVISOR ชื่อผู้ใช้ Supervisor สำหรับตรวจผล (ใช้ LOAD_PIN)
//   LOAD_ROUNDS     จำนวนรอบของกรณีที่ 3 (ค่าเริ่มต้น 5 → 40 คำขอ)
//   LOAD_MODE       burst (ค่าเริ่มต้น: กรณีที่ 1–3) หรือ pace (จำลองจังหวะหน้างาน)
//   LOAD_MINUTES    ระยะเวลาของโหมด pace (ค่าเริ่มต้น 5 นาที)
//   LOAD_PACE_S     ช่วงเวลาระหว่างรายต่อจุดในโหมด pace เช่น 15-20 (วินาที, ค่าเริ่มต้น 15-20)
//
// ใช้: node tests/load/run.mjs   (exit code 0 = ผ่านทุกกรณี)
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'

const BASE = (process.env.LOAD_BASE_URL || '').replace(/\/$/, '')
let PIN = process.env.LOAD_PIN || ''
if (!PIN && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  PIN = (await rl.question('PIN ของบัญชีทดสอบ: ')).trim()
  rl.close()
}
const STAFF = (process.env.LOAD_STAFF || Array.from({ length: 8 }, (_, i) => `staff0${i + 1}`).join(',')).split(',').map((s) => s.trim())
const SUPERVISOR = process.env.LOAD_SUPERVISOR || 'super'
const ROUNDS = Number(process.env.LOAD_ROUNDS || 5)
const MODE = process.env.LOAD_MODE === 'pace' ? 'pace' : 'burst'
const MINUTES = Number(process.env.LOAD_MINUTES || 5)
const [PACE_MIN_S, PACE_MAX_S] = (process.env.LOAD_PACE_S || '15-20').split('-').map(Number)
const MAX_RETRY = 6

if (!BASE || !PIN || process.env.LOAD_CONFIRM !== 'yes') {
  console.error('ต้องตั้ง LOAD_BASE_URL, LOAD_PIN และ LOAD_CONFIRM=yes (ใช้กับ staging/dev เท่านั้น)')
  process.exit(2)
}

async function call(action, payload = {}, token, requestId) {
  const t0 = performance.now()
  try {
    const res = await fetch(`${BASE}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, requestId, payload }),
      signal: AbortSignal.timeout(35_000),
    })
    const body = await res.json()
    // ms = เวลาที่ Apps Script ประมวลผล (backend แนบมา), clientMs = เวลารวมที่วัดฝั่งนี้
    return { ...body, serverMs: body.ms, clientMs: performance.now() - t0 }
  } catch (err) {
    return { success: false, code: 'UNKNOWN', message: String(err), clientMs: performance.now() - t0 }
  }
}

/** ส่ง checkin.create และ retry ด้วย requestId เดิมเมื่อ BUSY/UNKNOWN (เหมือนพฤติกรรม UI) */
async function checkin(token, memberId, requestId) {
  const attempts = []
  for (let i = 0; i < MAX_RETRY; i++) {
    const r = await call('checkin.create', { memberId }, token, requestId)
    attempts.push(r)
    if (r.code !== 'BUSY' && r.code !== 'UNKNOWN') break
    if (r.code === 'UNKNOWN') {
      const s = await retryCall('checkin.status', { requestId }, token)
      if (s.success && s.data?.found && s.data.checkin.status === 'REGISTERED') {
        attempts.push({ ...s, code: 'REGISTERED', verified: true })
        break
      }
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1) + Math.random() * 300))
  }
  const final = attempts[attempts.length - 1]
  return { memberId, requestId, final: final.code, attempts, busy: attempts.filter((a) => a.code === 'BUSY').length }
}

const percentile = (values, p) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

async function rowsFor(supToken, eventId, memberIds) {
  const want = new Set(memberIds)
  const counts = Object.fromEntries(memberIds.map((id) => [id, 0]))
  for (let offset = 0; ; offset += 500) {
    const h = await retryCall('checkin.history', { eventId, limit: 500, offset }, supToken)
    if (!h.success) throw new Error(`checkin.history: ${h.code} ${h.message}`)
    for (const item of h.data.items) if (want.has(item.memberId)) counts[item.memberId]++
    if (offset + 500 >= h.data.total) break
  }
  return counts
}

/**
 * สำหรับคำสั่งที่ส่งซ้ำได้ปลอดภัย (login และคำสั่งอ่านอย่างเดียว) — retry เมื่อไม่ทราบผล
 * (เครือข่าย/redirect ของ Google) ห้ามใช้กับ checkin.create ซึ่งมี retry ด้วย requestId ของตัวเอง
 */
async function retryCall(action, payload, token) {
  let r
  for (let i = 0; i < 4; i++) {
    r = await call(action, payload, token)
    if (r.code !== 'UNKNOWN') break
  }
  return r
}

const login = (payload) => retryCall('auth.login', payload)

async function main() {
  console.log(`Load test → ${BASE}`)
  const tokens = []
  for (const [i, username] of STAFF.entries()) {
    const r = await login({ username, pin: PIN, stationId: String(i + 1).padStart(2, '0') })
    if (r.code !== 'OK') throw new Error(`login ${username}: ${r.code} ${r.message}`)
    tokens.push(r.data.token)
  }
  const sup = await login({ username: SUPERVISOR, pin: PIN })
  if (sup.code !== 'OK') throw new Error(`login ${SUPERVISOR}: ${sup.code} ${sup.message}`)
  const supToken = sup.data.token

  const me = await retryCall('session.me', {}, tokens[0])
  const eventId = me.data?.openEvent?.eventId
  if (!eventId) throw new Error('ไม่มี Open Event — เปิดงานทดสอบก่อน')
  console.log(`Open Event: ${me.data.openEvent.eventName} (${eventId})`)

  // เลือกสมาชิกที่ยังไม่เคยมีแถวใน Event นี้ (อ่านประวัติครั้งเดียว แทนการถามทีละคน)
  const list = await retryCall('members.list', {}, tokens[0])
  if (!list.success) throw new Error(`members.list: ${list.code} ${list.message}`)
  const used = new Set()
  for (let offset = 0; ; offset += 500) {
    const h = await retryCall('checkin.history', { eventId, limit: 500, offset }, supToken)
    if (!h.success) throw new Error(`checkin.history: ${h.code} ${h.message}`)
    h.data.items.forEach((i) => used.add(i.memberId))
    if (offset + 500 >= h.data.total) break
  }
  const free = list.data.items.map((m) => m.memberId).filter((id) => !used.has(id))

  if (MODE === 'pace') return paceTest({ tokens, supToken, eventId, free })

  const need = 2 + STAFF.length * ROUNDS
  if (free.length < need) throw new Error(`สมาชิกที่ยังไม่ลงทะเบียนไม่พอ (${free.length}/${need})`)

  const results = []
  const report = (name, ok, detail) => {
    results.push({ name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}\n     ${detail}`)
  }

  // กรณีที่ 1: 8 Station กดลงทะเบียนสมาชิกคนเดียวกันพร้อมกัน
  {
    const memberId = free[0]
    const out = await Promise.all(tokens.map((t) => checkin(t, memberId, randomUUID())))
    const reg = out.filter((o) => o.final === 'REGISTERED').length
    const dup = out.filter((o) => o.final === 'ALREADY_REGISTERED').length
    const rows = (await rowsFor(supToken, eventId, [memberId]))[memberId]
    report('8 คำขอพร้อมกัน สมาชิกเดียวกัน', reg === 1 && dup === STAFF.length - 1 && rows === 1,
      `REGISTERED=${reg} ALREADY_REGISTERED=${dup} อื่น ๆ=${out.length - reg - dup} แถวในชีต=${rows} BUSY=${out.reduce((a, o) => a + o.busy, 0)}`)
  }

  // กรณีที่ 2: RequestID เดิม 10 ครั้งพร้อมกัน
  {
    const memberId = free[1]
    const requestId = randomUUID()
    const out = await Promise.all(Array.from({ length: 10 }, () => checkin(tokens[0], memberId, requestId)))
    const reg = out.filter((o) => o.final === 'REGISTERED').length
    const rows = (await rowsFor(supToken, eventId, [memberId]))[memberId]
    report('RequestID เดิม 10 ครั้ง', reg === 10 && rows === 1,
      `REGISTERED=${reg}/10 แถวในชีต=${rows} codes=${[...new Set(out.map((o) => o.final))].join(',')}`)
  }

  // กรณีที่ 3: 8 Station ลงทะเบียนคนละคนพร้อมกัน × ROUNDS รอบ
  {
    const latencies = []
    let busy = 0
    let unknown = 0
    const serverMs = []
    let ok = 0
    const ids = []
    for (let round = 0; round < ROUNDS; round++) {
      const batch = tokens.map((t, i) => {
        const memberId = free[2 + round * STAFF.length + i]
        ids.push(memberId)
        return checkin(t, memberId, randomUUID())
      })
      for (const o of await Promise.all(batch)) {
        if (o.final === 'REGISTERED') ok++
        busy += o.busy
        unknown += o.attempts.filter((a) => a.code === 'UNKNOWN').length
        latencies.push(o.attempts.reduce((a, x) => a + (x.clientMs || 0), 0))
        for (const a of o.attempts) if (typeof a.serverMs === 'number') serverMs.push(a.serverMs)
      }
    }
    console.log(`     (ยิงครบ: สำเร็จ ${ok}/${ids.length} · p50 ${Math.round(percentile(latencies, 50))} ms · p95 ${Math.round(percentile(latencies, 95))} ms — กำลังตรวจแถวในชีต…)`)
    console.log(`     เวลาประมวลผลใน Apps Script (รวมรอ Lock) ${serverMs.length} คำตอบ: p50 ${Math.round(percentile(serverMs, 50))} ms · p95 ${Math.round(percentile(serverMs, 95))} ms · max ${Math.round(Math.max(0, ...serverMs))} ms`)
    const counts = await rowsFor(supToken, eventId, ids)
    const wrong = Object.entries(counts).filter(([, c]) => c !== 1)
    report(`${STAFF.length} คำขอพร้อมกันคนละสมาชิก × ${ROUNDS} รอบ`, ok === ids.length && wrong.length === 0,
      `สำเร็จ ${ok}/${ids.length} · BUSY ${busy} ครั้ง · UNKNOWN (ตรวจผลแล้ว retry) ${unknown} ครั้ง · แถวผิด ${wrong.length} · latency p50 ${Math.round(percentile(latencies, 50))} ms · p95 ${Math.round(percentile(latencies, 95))} ms · max ${Math.round(Math.max(...latencies))} ms`)
  }

  for (const t of [...tokens, supToken]) await call('auth.logout', {}, t)
  const failed = results.filter((r) => !r.ok).length
  console.log(`\nสรุป: ผ่าน ${results.length - failed}/${results.length}`)
  console.log(`หมายเหตุ: สมาชิกที่ใช้ทดสอบถูกลงทะเบียนจริงใน ${eventId} — ปิดงานทดสอบนี้หรือยกเลิกรายการก่อนใช้งานจริง`)
  process.exit(failed ? 1 : 0)
}

/**
 * จำลองหน้างาน: แต่ละจุดลงทะเบียนทีละราย แล้วรอ PACE_MIN_S–PACE_MAX_S วินาที (เวลาตรวจบัตร) ก่อนรายถัดไป
 * เริ่มแต่ละจุดเหลื่อมกันแบบสุ่ม ทำต่อเนื่อง MINUTES นาที หรือจนสมาชิกทดสอบหมด
 */
async function paceTest({ tokens, supToken, eventId, free }) {
  const pace = () => (PACE_MIN_S + Math.random() * (PACE_MAX_S - PACE_MIN_S)) * 1000
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const deadline = Date.now() + MINUTES * 60_000
  const queue = [...free]
  const done = []
  console.log(`โหมดจังหวะหน้างาน: ${tokens.length} จุด · ทุก ${PACE_MIN_S}–${PACE_MAX_S} วินาที · ${MINUTES} นาที · สมาชิกว่าง ${queue.length} คน`)

  await Promise.all(tokens.map(async (token, i) => {
    await sleep(Math.random() * PACE_MAX_S * 1000)
    while (Date.now() < deadline && queue.length) {
      const memberId = queue.shift()
      const t0 = Date.now()
      const o = await checkin(token, memberId, randomUUID())
      done.push({ ...o, station: i + 1, at: t0, totalMs: Date.now() - t0 })
      const unk = o.attempts.filter((a) => a.code === 'UNKNOWN').length
      console.log(`  จุด ${String(i + 1).padStart(2, '0')} ${memberId} → ${o.final} ${((Date.now() - t0) / 1000).toFixed(1)}s${unk ? ` (UNKNOWN ${unk})` : ''}`)
      await sleep(pace())
    }
  }))

  const totals = done.map((d) => d.totalMs)
  const serverMs = done.flatMap((d) => d.attempts.map((a) => a.serverMs).filter((v) => typeof v === 'number'))
  const unknown = done.reduce((a, d) => a + d.attempts.filter((x) => x.code === 'UNKNOWN').length, 0)
  const ok = done.filter((d) => d.final === 'REGISTERED').length
  const slow = done.filter((d) => d.totalMs > 10_000).length
  const counts = await rowsFor(supToken, eventId, done.map((d) => d.memberId))
  const wrong = Object.entries(counts).filter(([, c]) => c !== 1).length
  const minutes = (Math.max(...done.map((d) => d.at)) - Math.min(...done.map((d) => d.at))) / 60_000 || 1

  console.log(`\nสรุปโหมดจังหวะหน้างาน (${done.length} ราย ใน ${minutes.toFixed(1)} นาที ≈ ${(done.length / minutes).toFixed(1)} ราย/นาที)`)
  console.log(`  สำเร็จ ${ok}/${done.length} · แถวผิด ${wrong} · UNKNOWN ${unknown} ครั้ง (${((unknown / done.length) * 100).toFixed(0)}% ของราย) · เกิน 10 วินาที ${slow} ราย`)
  console.log(`  เวลาที่เจ้าหน้าที่รอ: p50 ${(percentile(totals, 50) / 1000).toFixed(1)}s · p95 ${(percentile(totals, 95) / 1000).toFixed(1)}s · max ${(Math.max(...totals) / 1000).toFixed(1)}s`)
  console.log(`  เวลาใน Apps Script: p50 ${(percentile(serverMs, 50) / 1000).toFixed(1)}s · p95 ${(percentile(serverMs, 95) / 1000).toFixed(1)}s`)
  for (const t of [...tokens, supToken]) await call('auth.logout', {}, t)
  const pass = ok === done.length && wrong === 0
  console.log(`\nสรุป: ${pass ? 'ผ่าน' : 'ไม่ผ่าน'} (ความถูกต้อง) — ใช้ตัวเลขเวลาประกอบการตัดสินใจ`)
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('ERROR', err.message)
  process.exit(2)
})
