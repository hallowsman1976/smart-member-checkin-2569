// Mock Apps Script Web App สำหรับเครื่อง dev: รัน gas/src จริงบน harness
// พฤติกรรมเหมือน /exec จริง: POST → 302 ไปยัง URL อื่น → GET ได้ JSON
// ใช้: npm run mock:gas   (ข้อมูลอยู่ใน memory หายเมื่อปิด)
//
// จำลองปัญหาเครือข่าย: POST /__fault { "mode": "html" | "slow" | "drop" | "none", "count": 1 }
//   drop = คำขอหายก่อนถึง server (ไม่บันทึก) แล้วตอบ 502
//   html = บันทึกจริงแล้วแต่ตอบเป็น HTML (proxy จะได้ UNKNOWN)
//   slow = บันทึกจริงแล้วรอ 30 วินาทีก่อนตอบ (proxy timeout 25 วินาที → UNKNOWN)
import http from 'node:http'
import { loadGas } from './load.mjs'
import { DEV_PIN, DEV_PROXY_KEY, DEV_USERS, devMembers } from './seed.mjs'

const PORT = Number(process.env.MOCK_GAS_PORT || 8790)
const { gas } = loadGas({ SPREADSHEET_ID: 'mock', BACKUP_SPREADSHEET_ID: 'backup', PROXY_KEY: DEV_PROXY_KEY })

gas.console = { ...console, log: () => {} }
gas.initializeSheets()
gas.console = console
const users = gas.readTable_('Users')
for (const u of DEV_USERS) gas.createUser_(users, { ...u, pin: DEV_PIN, mustChangePin: !!u.mustChangePin })
gas.appendObject_(gas.readTable_('Events'), {
  EventID: 'EV2569', EventName: 'ประชุมใหญ่สามัญประจำปี 2569', EventDate: '2026-12-20',
  Status: 'OPEN', QuorumThreshold: 750, OpenedAt: gas.nowIso_(),
})
const members = gas.readTable_('Members')
for (const m of devMembers()) gas.appendObject_(members, m)

// MOCK_SEED_CHECKINS=n: ลงทะเบียนล่วงหน้า n คน กระจายทุกจุด (ไว้ดู Dashboard)
const seedCheckins = Number(process.env.MOCK_SEED_CHECKINS || 0)
for (let i = 0; i < seedCheckins; i++) {
  const n = ((i * 7) % 1500) + 1
  if ([13, 666, 1313].includes(n)) continue
  gas.upsertCheckin_({
    eventId: 'EV2569', memberId: String(n).padStart(6, '0'), requestId: `seed-${String(i).padStart(6, '0')}`,
    source: i % 50 === 0 ? 'PAPER' : 'STATION', stationId: `0${(i % 8) + 1}`, staffId: 'SEED',
    checkinTime: gas.isoAfterMinutes_(-(seedCheckins - i) * 0.2),
  })
}

const pending = new Map()
let fault = { mode: 'none', count: 0 }
let seq = 0

const readBody = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === 'POST' && url.pathname === '/__fault') {
      fault = { mode: 'none', count: 1, ...JSON.parse((await readBody(req)) || '{}') }
      console.log('fault set:', fault)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(fault))
      return
    }

    if (req.method === 'POST' && url.pathname === '/exec') {
      const body = await readBody(req)
      let action = '?'
      try { action = JSON.parse(body).action } catch { /* ignore */ }
      if (fault.mode === 'drop' && fault.count > 0 && action === 'checkin.create') {
        if (--fault.count === 0) fault.mode = 'none'
        console.log(`${new Date().toISOString()} ${action} → (dropped, not processed)`)
        res.writeHead(502, { 'Content-Type': 'text/html' }).end('<html><body>Bad gateway</body></html>')
        return
      }
      const out = gas.doPost({ postData: { contents: body } }).getContent()
      const parsed = JSON.parse(out)
      console.log(`${new Date().toISOString()} ${action} → ${parsed.code}`)

      if (fault.mode !== 'none' && fault.count > 0 && action === 'checkin.create') {
        fault.count--
        const mode = fault.mode
        if (fault.count === 0) fault.mode = 'none'
        if (mode === 'html') {
          res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body>Service error</body></html>')
          return
        }
        if (mode === 'slow') {
          setTimeout(() => res.writeHead(200, { 'Content-Type': 'application/json' }).end(out), 30_000)
          return
        }
      }

      const id = String(++seq)
      pending.set(id, out)
      res.writeHead(302, { Location: `http://${req.headers.host}/echo/${id}` }).end()
      return
    }

    const echo = /^\/echo\/(\d+)$/.exec(url.pathname)
    if (req.method === 'GET' && echo && pending.has(echo[1])) {
      const out = pending.get(echo[1])
      pending.delete(echo[1])
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(out)
      return
    }

    res.writeHead(404).end()
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock /exec พร้อมที่ http://127.0.0.1:${PORT}/exec`))
