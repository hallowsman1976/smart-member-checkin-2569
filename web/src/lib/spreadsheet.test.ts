import { describe, expect, it } from 'vitest'
import { buildImportPreview, buildImportTemplate, guessMapping, parseMemberType, parseSpreadsheet, safeCell, toCsv } from './spreadsheet'

describe('safeCell / toCsv', () => {
  it('ใส่ \' นำหน้าค่าที่ขึ้นต้นด้วยอักขระสูตร', () => {
    expect(safeCell('=1+1')).toBe("'=1+1")
    expect(safeCell('+66')).toBe("'+66")
    expect(safeCell('-5')).toBe("'-5")
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(safeCell('\tx')).toBe("'\tx")
    expect(safeCell('สมชาย')).toBe('สมชาย')
    expect(safeCell(42)).toBe(42)
  })
  it('CSV มี BOM, escape comma/quote/newline และกันสูตร', () => {
    const csv = toCsv([['a', 'b'], ['=HYPERLINK("x")', 'x,y'], ['line\nbreak', 1]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"x,y"')
    expect(csv).toContain('"line\nbreak",1')
  })
})

describe('import', () => {
  it('เดาคอลัมน์จากหัวตารางภาษาไทย/อังกฤษ', () => {
    expect(guessMapping(['ลำดับ', 'เลขสมาชิก', 'ชื่อ - นามสกุล', 'สังกัด', 'ประเภท'])).toEqual({
      memberId: 1, fullName: 2, office: 3, memberType: 4,
    })
    expect(guessMapping(['MemberID', 'FullName', 'Office', 'MemberType']).memberType).toBe(3)
  })
  it('แปลงประเภทสมาชิก', () => {
    expect(parseMemberType('สามัญ')).toBe('ORDINARY')
    expect(parseMemberType(' สมทบ ')).toBe('ASSOCIATE')
    expect(parseMemberType('ORDINARY')).toBe('ORDINARY')
    expect(parseMemberType('VIP')).toBeNull()
  })
  it('รายงาน error และ warning ศูนย์นำหน้าหาย', () => {
    const sheet = {
      headers: ['เลขสมาชิก', 'ชื่อ', 'หน่วยงาน', 'ประเภท'],
      rows: [
        ['000101', 'นายหนึ่ง  ดี', 'สสจ.', 'สามัญ'],
        ['000102', 'นางสอง ดี', 'รพ.', 'สมทบ'],
        ['103', 'นายสาม ดี', 'รพ.', 'สามัญ'],
        ['000102', 'ซ้ำ', 'รพ.', 'สามัญ'],
        ['', 'ไม่มีเลข', '', 'สามัญ'],
        ['000105', '', '', 'ไม่รู้'],
      ],
    }
    const p = buildImportPreview(sheet, guessMapping(sheet.headers))
    expect(p.rows.map((r) => r.memberId)).toEqual(['000101', '000102', '103'])
    expect(p.rows[0].fullName).toBe('นายหนึ่ง ดี')
    const errors = p.issues.filter((i) => i.level === 'error')
    expect(errors.map((e) => e.row)).toEqual([5, 6, 7, 7])
    expect(p.issues.find((i) => i.level === 'warning')).toMatchObject({ row: 4 })
  })
})

describe('แม่แบบนำเข้าสมาชิก', () => {
  const toFile = async (wb: Awaited<ReturnType<typeof buildImportTemplate>>) => {
    const XLSX = await import('xlsx')
    return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'template.xlsx')
  }

  it('หัวคอลัมน์จับคู่ได้ครบ และแม่แบบเปล่าไม่มีแถวข้อมูล', async () => {
    const sheet = await parseSpreadsheet(await toFile(await buildImportTemplate()))
    expect(sheet.rows).toHaveLength(0)
    expect(Object.values(guessMapping(sheet.headers))).toEqual([0, 1, 2, 3])
  })

  it('กรอกแล้วนำเข้าได้ และคงศูนย์นำหน้า', async () => {
    const XLSX = await import('xlsx')
    const wb = await buildImportTemplate()
    const ws = wb.Sheets['สมาชิก']
    XLSX.utils.sheet_add_aoa(ws, [['000123', 'นางสาวทดสอบ ระบบ', 'รพ.ทดสอบ', 'สามัญ']], { origin: 'A2' })
    const sheet = await parseSpreadsheet(await toFile(wb))
    const preview = buildImportPreview(sheet, guessMapping(sheet.headers))
    expect(preview.issues).toEqual([])
    expect(preview.rows).toEqual([{ memberId: '000123', fullName: 'นางสาวทดสอบ ระบบ', office: 'รพ.ทดสอบ', memberType: 'ORDINARY' }])
  })
})
