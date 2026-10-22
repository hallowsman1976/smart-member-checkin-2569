import type { Member } from '@/types/api'

/**
 * ค้นหาสมาชิกฝั่ง client — SPEC.md §7
 * ใช้สำหรับค้นหาเท่านั้น ห้ามใช้ตัดสินว่าลงทะเบียนซ้ำหรือไม่
 */

/** คำนำหน้าที่ตัดออกก่อนเทียบชื่อ — เรียงยาวไปสั้นเพื่อให้ "นางสาว" ถูกตัดก่อน "นาง" */
const TITLES = [
  'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'ว่าที่ ร.ต.หญิง', 'ว่าที่ ร.ต.', 'ว่าที่ร.ต.',
  'พันตำรวจเอก', 'พันตำรวจโท', 'พันตำรวจตรี', 'ร้อยตำรวจเอก', 'ร้อยตำรวจโท', 'ร้อยตำรวจตรี',
  'ดาบตำรวจ', 'จ่าสิบตำรวจ', 'สิบตำรวจเอก',
  'พ.ต.อ.', 'พ.ต.ท.', 'พ.ต.ต.', 'ร.ต.อ.', 'ร.ต.ท.', 'ร.ต.ต.', 'ด.ต.', 'จ.ส.ต.', 'ส.ต.อ.',
  'จ่าสิบเอก', 'จ่าสิบโท', 'จ่าสิบตรี', 'สิบเอก', 'สิบโท', 'สิบตรี', 'จ.ส.อ.', 'จ.ส.ท.', 'จ.ส.ต.', 'ส.อ.', 'ส.ท.', 'ส.ต.',
  'ร้อยเอก', 'ร้อยโท', 'ร้อยตรี', 'ร.อ.', 'ร.ท.', 'ร.ต.',
  'นางสาว', 'น.ส.', 'นาง', 'นาย', 'ดร.', 'ทพ.', 'ทพญ.', 'นพ.', 'พญ.', 'ภก.', 'ภญ.',
].sort((a, b) => b.length - a.length)

/** NFC, ตัวพิมพ์เล็ก, รวมช่องว่าง */
export function normalizeText(input: string): string {
  return input.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * normalizeText + ตัดคำนำหน้าที่ต้นข้อความ (ตัดซ้ำได้ เช่น "ว่าที่ ร.ต. ดร.")
 * การตัดอาจกินชื่อจริงที่ขึ้นต้นเหมือนคำนำหน้า (เช่น "นางนวล") searchMembers จึงเทียบแบบไม่ตัดด้วย
 */
export function normalizeName(input: string): string {
  let s = normalizeText(input)
  for (let changed = true; changed; ) {
    changed = false
    for (const t of TITLES) {
      if (s.startsWith(t)) {
        s = s.slice(t.length).trim()
        changed = true
        break
      }
    }
  }
  return s
}

const stripLeadingZeros = (s: string) => s.replace(/^0+(?=.)/, '')

export type IndexedMember<T extends Member = Member> = T & SearchKeys

interface SearchKeys {
  /** ชื่อหลังตัดคำนำหน้า */
  searchName: string
  /** ชื่อเต็มที่ normalize เฉพาะช่องว่าง/ตัวพิมพ์ */
  rawName: string
}

export function indexMembers<T extends Member>(members: T[]): IndexedMember<T>[] {
  return members.map((m) => ({ ...m, searchName: normalizeName(m.fullName), rawName: normalizeText(m.fullName) }))
}

/**
 * - ตัวเลขล้วน: เทียบ MemberID แบบตรงตัว / ตัดศูนย์นำหน้า / ขึ้นต้นด้วย
 * - ข้อความ: ทุกคำต้องอยู่ในชื่อ (หลัง normalize)
 * เรียง: MemberID ตรงตัว → MemberID ขึ้นต้นด้วย → ชื่อขึ้นต้นด้วย → ชื่อมีคำนี้
 */
export function searchMembers<T extends Member>(members: IndexedMember<T>[], query: string, limit = 20): IndexedMember<T>[] {
  const q = query.normalize('NFC').trim()
  if (!q) return []

  if (/^\d+$/.test(q)) {
    const qz = stripLeadingZeros(q)
    const scored: { m: IndexedMember<T>; score: number }[] = []
    for (const m of members) {
      const id = m.memberId
      const idz = stripLeadingZeros(id)
      let score = -1
      if (id === q) score = 0
      else if (idz === qz) score = 1
      else if (id.startsWith(q)) score = 2
      else if (idz.startsWith(qz)) score = 3
      if (score >= 0) scored.push({ m, score })
    }
    return scored
      .sort((a, b) => a.score - b.score || a.m.memberId.localeCompare(b.m.memberId))
      .slice(0, limit)
      .map((x) => x.m)
  }

  const nq = normalizeName(q)
  const rq = normalizeText(q)
  const terms = nq.split(' ').filter(Boolean)
  const rawTerms = rq.split(' ').filter(Boolean)
  if (terms.length === 0 && rawTerms.length === 0) return []
  const scored: { m: IndexedMember<T>; score: number }[] = []
  for (const m of members) {
    const hit =
      (terms.length > 0 && terms.every((t) => m.searchName.includes(t))) ||
      rawTerms.every((t) => m.rawName.includes(t))
    if (!hit) continue
    scored.push({ m, score: (nq && m.searchName.startsWith(nq)) || m.rawName.startsWith(rq) ? 0 : 1 })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.m.searchName.localeCompare(b.m.searchName, 'th'))
    .slice(0, limit)
    .map((x) => x.m)
}
