// ข้อมูลทดสอบสำหรับ mock /exec บนเครื่อง dev เท่านั้น — ไม่ใช่ข้อมูลจริง ห้ามนำ PIN เหล่านี้ไปใช้บน staging/production
export const DEV_PROXY_KEY = 'dev-proxy-key-change-me'
export const DEV_PIN = '482916'
export const DEV_USERS = [
  ...Array.from({ length: 8 }, (_, i) => ({
    username: `staff0${i + 1}`,
    fullName: `เจ้าหน้าที่จุด ${i + 1}`,
    role: 'STAFF',
    defaultStationId: `0${i + 1}`,
  })),
  { username: 'super', fullName: 'ผู้ควบคุมทดสอบ', role: 'SUPERVISOR' },
  { username: 'boss', fullName: 'ผู้ดูแลทดสอบ', role: 'ADMIN' },
  { username: 'newbie', fullName: 'ผู้ใช้ใหม่', role: 'STAFF', mustChangePin: true },
]

const FIRST = ['สมชาย', 'สมหญิง', 'สมศักดิ์', 'วิไล', 'ประเสริฐ', 'อำไพ', 'บุญมี', 'สุดา', 'ธนา', 'นางนวล', 'กิตติ', 'จันทร์เพ็ญ', 'ไพโรจน์', 'รัตนา', 'อนุชา']
const LAST = ['ใจดี', 'รักงาน', 'มีสุข', 'ศรีสุข', 'แก้วมณี', 'บุญเรือง', 'พรหมมา', 'สายทอง', 'ทองดี', 'คำแสน', 'ปัญญาดี', 'วงศ์ไทย']
const TITLE = ['นาย', 'นาง', 'นางสาว', 'นาย', 'นาง']
const OFFICES = ['สสจ.มุกดาหาร', 'รพ.มุกดาหาร', 'รพ.คำชะอี', 'รพ.ดอนตาล', 'รพ.นิคมคำสร้อย', 'สสอ.เมืองมุกดาหาร', 'รพ.สต.บ้านโคก', 'รพ.สต.นาสีนวน']

/** 1,500 คน: MemberID 6 หลักมีศูนย์นำหน้า, มีชื่อซ้ำ, 10% เป็นสมาชิกสมทบ, 3 คนไม่ Active */
export function devMembers() {
  return Array.from({ length: 1500 }, (_, i) => {
    const n = i + 1
    return {
      MemberID: String(n).padStart(6, '0'),
      FullName: `${TITLE[n % TITLE.length]}${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`,
      Office: OFFICES[n % OFFICES.length],
      MemberType: n % 10 === 0 ? 'ASSOCIATE' : 'ORDINARY',
      Active: ![13, 666, 1313].includes(n),
    }
  })
}
