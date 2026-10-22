import { describe, expect, it } from 'vitest'
import type { Member } from '@/types/api'
import { indexMembers, normalizeName, searchMembers } from './search'

const m = (memberId: string, fullName: string, office = 'สสจ.มุกดาหาร'): Member => ({
  memberId,
  fullName,
  office,
  memberType: 'ORDINARY',
})

const members = indexMembers([
  m('000123', 'นายสมชาย  ใจดี', 'รพ.สต.บ้านโคก'),
  m('000456', 'นายสมชาย ใจดี', 'รพ.มุกดาหาร'),
  m('001230', 'นางสาวสมหญิง รักงาน'),
  m('123', 'นางสมศรี มีสุข'),
  m('010001', 'ว่าที่ ร.ต. ดร.ธนา ปัญญาดี'),
  m('020002', 'นางสาวนางนวล ทะเลงาม'),
  m('030003', 'Mr. John Smith'),
])

const ids = (q: string, limit?: number) => searchMembers(members, q, limit).map((x) => x.memberId)

describe('normalizeName', () => {
  it('ตัดคำนำหน้าและรวมช่องว่าง', () => {
    expect(normalizeName('นายสมชาย  ใจดี')).toBe('สมชาย ใจดี')
    expect(normalizeName('  นางสาว   สมหญิง รักงาน ')).toBe('สมหญิง รักงาน')
    expect(normalizeName('น.ส.สมหญิง')).toBe('สมหญิง')
  })
  it('ตัดคำนำหน้าซ้อนกัน', () => {
    expect(normalizeName('ว่าที่ ร.ต. ดร.ธนา ปัญญาดี')).toBe('ธนา ปัญญาดี')
  })
  it('"นางสาว" ไม่ถูกตัดเหลือ "สาว…"', () => {
    expect(normalizeName('นางสาวสมหญิง')).toBe('สมหญิง')
  })
  it('รวม NFC และตัวพิมพ์', () => {
    expect(normalizeName('JOHN')).toBe('john')
    expect(normalizeName('é')).toBe('é')
  })
})

describe('searchMembers — ชื่อ', () => {
  it('พิมพ์ชื่อโดยไม่มีคำนำหน้าก็เจอ และชื่อซ้ำแสดงทุกคน', () => {
    expect(ids('สมชาย')).toEqual(expect.arrayContaining(['000123', '000456']))
    expect(ids('สมชาย')).toHaveLength(2)
  })
  it('พิมพ์คำนำหน้ามาด้วยก็เจอ', () => {
    expect(ids('นายสมชาย ใจดี')).toHaveLength(2)
  })
  it('ช่องว่างเกินในชีตหรือในคำค้นไม่มีผล', () => {
    expect(ids('สมชาย   ใจดี')).toHaveLength(2)
  })
  it('ค้นด้วยนามสกุลหรือหลายคำไม่เรียงลำดับ', () => {
    expect(ids('รักงาน')).toEqual(['001230'])
    expect(ids('ใจดี สมชาย')).toHaveLength(2)
  })
  it('ชื่อที่ขึ้นต้นเหมือนคำนำหน้ายังค้นเจอ', () => {
    expect(ids('นางนวล')).toEqual(['020002'])
    expect(ids('ทะเลงาม')).toEqual(['020002'])
  })
  it('ชื่อที่มีคำนำหน้าซ้อน', () => {
    expect(ids('ธนา')).toEqual(['010001'])
  })
  it('ภาษาอังกฤษไม่สนตัวพิมพ์', () => {
    expect(ids('john')).toEqual(['030003'])
  })
  it('คำค้นว่างหรือไม่พบ', () => {
    expect(ids('')).toEqual([])
    expect(ids('   ')).toEqual([])
    expect(ids('ไม่มีชื่อนี้')).toEqual([])
  })
})

describe('searchMembers — เลขสมาชิก', () => {
  it('ตรงตัวมาก่อน แล้วจึงตัดศูนย์นำหน้า', () => {
    expect(ids('123')).toEqual(['123', '000123', '001230'])
  })
  it('พิมพ์ศูนย์นำหน้าครบก็ได้ตัวตรงก่อน', () => {
    expect(ids('000123')[0]).toBe('000123')
  })
  it('พิมพ์ไม่ครบก็เจอแบบขึ้นต้นด้วย โดยตัวที่ขึ้นต้นตรงตัวมาก่อน', () => {
    expect(ids('0012')).toEqual(['001230', '000123', '123'])
    expect(ids('45')).toEqual(['000456'])
  })
  it('จำกัดจำนวนผลลัพธ์', () => {
    const many = indexMembers(Array.from({ length: 50 }, (_, i) => m(String(i + 1).padStart(6, '0'), `ทดสอบ ${i}`)))
    expect(searchMembers(many, '0', 20)).toHaveLength(20)
    expect(searchMembers(many, 'ทดสอบ')).toHaveLength(20)
  })
})
