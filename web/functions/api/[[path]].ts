/**
 * Cloudflare Pages Function — proxy จาก /api ไปยัง Apps Script Web App (ADR 0004, SPEC.md §2)
 * - รับเฉพาะ POST JSON และเติม proxyKey จาก env (ค่าที่ client ส่งมาถูกทับเสมอ)
 * - ส่งต่อเป็น text/plain แล้วตาม redirect ของ Apps Script ด้วย GET จนได้ผล
 * - timeout 25 วินาที / ผลที่ไม่ใช่ response contract → UNKNOWN
 * - ไม่ log body เพราะมี PIN และ token
 */

interface Env {
  APPS_SCRIPT_URL: string
  PROXY_KEY: string
}

const UPSTREAM_TIMEOUT_MS = 25_000
const MAX_BODY_BYTES = 1_000_000
const ECHO_RETRIES = 4

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

const unknown = () =>
  json({ success: false, code: 'UNKNOWN', message: 'ไม่ทราบผลการทำรายการ กรุณาตรวจสอบสถานะก่อนลองใหม่' })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.APPS_SCRIPT_URL || !env.PROXY_KEY) {
    console.error('proxy misconfigured: APPS_SCRIPT_URL or PROXY_KEY missing')
    return unknown()
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return json({ success: false, code: 'INVALID_INPUT', message: 'ข้อมูลมีขนาดใหญ่เกินไป' }, 413)
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ success: false, code: 'INVALID_INPUT', message: 'รูปแบบคำขอไม่ถูกต้อง' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ success: false, code: 'INVALID_INPUT', message: 'รูปแบบคำขอไม่ถูกต้อง' }, 400)
  }

  let upstream: Response
  const hops: string[] = []
  try {
    const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    const payload = JSON.stringify({ ...body, proxyKey: env.PROXY_KEY })
    const post = (url: string) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload, redirect: 'manual', signal })
    upstream = await post(env.APPS_SCRIPT_URL)
    // Apps Script ตอบ redirect เอง: 301/302/303 → ดึงผลด้วย GET (script.googleusercontent.com)
    // 307/308 → ต้องส่ง POST พร้อม body เดิมไปยังปลายทางใหม่ (fetch ของ Workers จัดการสองแบบนี้ไม่ถูก จึงทำเอง)
    // ถ้าผลที่ /macros/echo ยังไม่พร้อม Google จะ redirect กลับไป /exec (ซึ่งเป็น GET → doGet)
    // จึงรอแล้วดึง echo URL เดิมซ้ำแทน ห้ามตามกลับไป /exec
    let echoUrl: URL | null = null
    let echoRetries = 0
    for (let i = 0; i < 10 && upstream.status >= 300 && upstream.status < 400; i++) {
      const location = upstream.headers.get('Location')
      if (!location) break
      let next = new URL(location, env.APPS_SCRIPT_URL)
      hops.push(`${upstream.status}→${next.host}${next.pathname.replace(/\/s\/[^/]+/, '/s/…')}`)
      if (upstream.status === 307 || upstream.status === 308) {
        upstream = await post(next.toString())
        continue
      }
      if (next.pathname.includes('/macros/echo')) echoUrl = next
      else if (echoUrl) {
        if (echoRetries >= ECHO_RETRIES) break
        echoRetries++
        await new Promise((r) => setTimeout(r, 300 * echoRetries))
        next = echoUrl
      }
      upstream = await fetch(next.toString(), { method: 'GET', redirect: 'manual', signal })
    }
  } catch (err) {
    console.error('upstream fetch failed:', err instanceof Error ? `${err.name}: ${err.message}` : 'error')
    return unknown()
  }

  const text = await upstream.text()
  try {
    const data = JSON.parse(text) as { success?: unknown; code?: unknown; message?: unknown }
    if (data.code === 'INVALID_INPUT' && data.message === 'รองรับเฉพาะ POST') {
      // คำขอไปถึง doGet ของ Apps Script = เส้นทาง redirect ผิด ไม่ได้ถูกประมวลผล
      console.error('upstream reached doGet via redirects:', hops.join(' | ') || '(none)')
      return unknown()
    }
    if (hops.length > 2) console.log('echo retried:', hops.join(' | '))
    if (typeof data.success === 'boolean' && typeof data.code === 'string') return json(data)
  } catch {
    // Apps Script ตอบ HTML (เช่นหน้า error หรือหน้า login) — ถือว่าไม่ทราบผล
  }
  console.error('upstream returned non-contract response', upstream.status, upstream.headers.get('Content-Type'), upstream.url)
  return unknown()
}

export const onRequest: PagesFunction<Env> = async () =>
  json({ success: false, code: 'INVALID_INPUT', message: 'รองรับเฉพาะ POST' }, 405)
