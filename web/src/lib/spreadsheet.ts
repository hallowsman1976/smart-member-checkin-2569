import type { MemberType } from '@/types/api'

/**
 * ป้องกัน CSV/Formula Injection (SPEC.md §9): ใส่ ' นำหน้าเซลล์ข้อความที่ขึ้นต้นด้วย = + - @ tab หรือ CR
 * ใช้กับทั้ง CSV และ XLSX
 */
export function safeCell(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  const s = value == null ? '' : String(value)
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/** CSV แบบ RFC 4180 + BOM เพื่อให้ Excel เปิดภาษาไทยถูกต้อง */
export function toCsv(rows: (string | number | boolean)[][]): string {
  const esc = (v: string | number | boolean) => {
    const s = String(safeCell(v))
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadXlsx(rows: (string | number | boolean)[][], sheetName: string, fileName: string) {
  const XLSX = await import('xlsx')
  // ทุกเซลล์เป็นข้อความ (t: 's') เพื่อให้ MemberID ศูนย์นำหน้าและข้อความที่ขึ้นต้นด้วย = ไม่ถูกตีความ
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((v) => (typeof v === 'number' ? v : String(safeCell(v))))))
  for (const addr of Object.keys(ws)) {
    const cell = ws[addr] as { t?: string; v?: unknown; z?: string } | undefined
    if (!addr.startsWith('!') && cell && cell.t === 's') cell.z = '@'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, fileName)
}

// ---------------- Import ----------------

export type ImportField = 'memberId' | 'fullName' | 'office' | 'memberType'

export const IMPORT_FIELDS: { field: ImportField; label: string; required: boolean; guesses: string[] }[] = [
  { field: 'memberId', label: 'เลขสมาชิก', required: true, guesses: ['memberid', 'เลขสมาชิก', 'เลขที่สมาชิก', 'รหัสสมาชิก', 'ทะเบียน'] },
  { field: 'fullName', label: 'ชื่อ-นามสกุล', required: true, guesses: ['fullname', 'ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'ชื่อสกุล', 'ชื่อ'] },
  { field: 'office', label: 'หน่วยงาน', required: false, guesses: ['office', 'หน่วยงาน', 'สังกัด', 'ที่ทำงาน'] },
  { field: 'memberType', label: 'ประเภทสมาชิก', required: true, guesses: ['membertype', 'ประเภทสมาชิก', 'ประเภท'] },
]

export interface ParsedSheet {
  headers: string[]
  rows: string[][]
}

/** อ่านไฟล์ .xlsx/.csv เป็นข้อความทุกเซลล์ (raw: false) เพื่อรักษาศูนย์นำหน้าเท่าที่ไฟล์เก็บไว้ */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false, codepage: 65001 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
  const [head = [], ...rows] = aoa
  return { headers: head.map((h) => String(h).trim()), rows: rows.map((r) => r.map((c) => String(c ?? '').trim())) }
}

export function guessMapping(headers: string[]): Record<ImportField, number> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  const mapping = {} as Record<ImportField, number>
  for (const f of IMPORT_FIELDS) {
    const exact = headers.findIndex((h) => f.guesses.some((g) => norm(h) === norm(g)))
    mapping[f.field] = exact >= 0 ? exact : headers.findIndex((h) => f.guesses.some((g) => norm(h).includes(norm(g))))
  }
  return mapping
}

export function parseMemberType(value: string): MemberType | null {
  const v = value.trim().toLowerCase()
  if (['ordinary', 'สามัญ', 'สมาชิกสามัญ', '1'].includes(v)) return 'ORDINARY'
  if (['associate', 'สมทบ', 'สมาชิกสมทบ', '2'].includes(v)) return 'ASSOCIATE'
  return null
}

export interface ImportIssue {
  row: number
  level: 'error' | 'warning'
  message: string
}

export interface ImportPreview {
  rows: { memberId: string; fullName: string; office: string; memberType: MemberType }[]
  issues: ImportIssue[]
}

/**
 * ตรวจก่อนส่ง: MemberID ว่าง/ซ้ำ, ชื่อว่าง, ประเภทผิด (error)
 * MemberID ที่ยาวน้อยกว่าความยาวส่วนใหญ่ = ศูนย์นำหน้าอาจหายเพราะ Excel แปลงเป็นตัวเลข (warning)
 */
export function buildImportPreview(sheet: ParsedSheet, mapping: Record<ImportField, number>): ImportPreview {
  const get = (r: string[], f: ImportField) => (mapping[f] >= 0 ? (r[mapping[f]] ?? '').trim() : '')
  const issues: ImportIssue[] = []
  const rows: ImportPreview['rows'] = []
  const seen = new Map<string, number>()

  const numericLengths = new Map<number, number>()
  for (const r of sheet.rows) {
    const id = get(r, 'memberId')
    if (/^\d+$/.test(id)) numericLengths.set(id.length, (numericLengths.get(id.length) ?? 0) + 1)
  }
  const commonLength = [...numericLengths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0

  sheet.rows.forEach((r, i) => {
    const line = i + 2 // แถวในไฟล์ (มี header 1 แถว)
    const memberId = get(r, 'memberId')
    const fullName = get(r, 'fullName').replace(/\s+/g, ' ')
    const type = parseMemberType(get(r, 'memberType'))
    let ok = true
    if (!memberId) { issues.push({ row: line, level: 'error', message: 'ไม่มีเลขสมาชิก' }); ok = false }
    else if (!/^[0-9A-Za-z-]{1,20}$/.test(memberId)) { issues.push({ row: line, level: 'error', message: `เลขสมาชิกไม่ถูกต้อง: ${memberId}` }); ok = false }
    else if (seen.has(memberId)) { issues.push({ row: line, level: 'error', message: `เลขสมาชิกซ้ำกับแถว ${seen.get(memberId)}: ${memberId}` }); ok = false }
    if (memberId) seen.set(memberId, line)
    if (!fullName) { issues.push({ row: line, level: 'error', message: 'ไม่มีชื่อ-นามสกุล' }); ok = false }
    if (!type) { issues.push({ row: line, level: 'error', message: `ประเภทสมาชิกไม่รู้จัก: "${get(r, 'memberType')}" (ใช้ สามัญ/สมทบ)` }); ok = false }
    if (ok && /^\d+$/.test(memberId) && commonLength && memberId.length < commonLength) {
      issues.push({ row: line, level: 'warning', message: `เลขสมาชิก ${memberId} สั้นกว่าปกติ (${commonLength} หลัก) — ศูนย์นำหน้าอาจหาย` })
    }
    if (ok) rows.push({ memberId, fullName, office: get(r, 'office'), memberType: type! })
  })
  return { rows, issues }
}
