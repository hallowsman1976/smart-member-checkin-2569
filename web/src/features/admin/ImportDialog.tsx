import { useMemo, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Notice, selectClass } from '@/components/common'
import { MEMBER_TYPE_LABEL } from '@/lib/format'
import { buildImportPreview, guessMapping, IMPORT_FIELDS, parseSpreadsheet, type ImportField, type ParsedSheet } from '@/lib/spreadsheet'
import { api } from '@/services/api'

const BATCH = 500

/** นำเข้าสมาชิก: เลือกไฟล์ → จับคู่คอลัมน์ → ตรวจตัวอย่าง → ส่งเป็น batch ละ ≤ 500 แถว (SPEC.md §9) */
export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<Record<ImportField, number> | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState('')

  const preview = useMemo(() => (sheet && mapping ? buildImportPreview(sheet, mapping) : null), [sheet, mapping])
  const errors = preview?.issues.filter((i) => i.level === 'error') ?? []
  const warnings = preview?.issues.filter((i) => i.level === 'warning') ?? []
  const missingRequired = mapping ? IMPORT_FIELDS.some((f) => f.required && mapping[f.field] < 0) : true

  const reset = () => {
    setFile(null); setSheet(null); setMapping(null); setError(''); setProgress(''); setDone('')
  }

  const pick = async (f: File | undefined) => {
    reset()
    if (!f) return
    setFile(f)
    try {
      const parsed = await parseSpreadsheet(f)
      if (parsed.rows.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์')
      setSheet(parsed)
      setMapping(guessMapping(parsed.headers))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อ่านไฟล์ไม่สำเร็จ')
    }
  }

  const run = async () => {
    if (!preview || running) return
    setRunning(true)
    setError('')
    let inserted = 0
    let updated = 0
    const batches = Math.ceil(preview.rows.length / BATCH)
    for (let i = 0; i < batches; i++) {
      setProgress(`กำลังนำเข้าชุดที่ ${i + 1}/${batches}…`)
      const res = await api('admin.members.importBatch', { rows: preview.rows.slice(i * BATCH, (i + 1) * BATCH), batchIndex: i, fileName: file?.name })
      if (!res.success) {
        const detail = res.data?.errors?.slice(0, 5).map((e) => `แถว ${i * BATCH + e.row}: ${e.message}`).join(' · ')
        setError(`ชุดที่ ${i + 1} ไม่สำเร็จ: ${res.message}${detail ? ` (${detail})` : ''} — ชุดก่อนหน้าบันทึกแล้ว แก้ไฟล์แล้วนำเข้าซ้ำได้ (ระบบจะปรับปรุงรายการเดิม)`)
        setRunning(false)
        setProgress('')
        onImported()
        return
      }
      inserted += res.data?.inserted ?? 0
      updated += res.data?.updated ?? 0
    }
    setRunning(false)
    setProgress('')
    setDone(`นำเข้าเสร็จ: เพิ่ม ${inserted.toLocaleString('th-TH')} ราย, ปรับปรุง ${updated.toLocaleString('th-TH')} ราย`)
    onImported()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !running && (reset(), onClose())}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>นำเข้าสมาชิกจากไฟล์</DialogTitle>
          <DialogDescription>
            รองรับ .xlsx และ .csv · เลขสมาชิกที่มีอยู่แล้วจะถูกปรับปรุง ที่ยังไม่มีจะถูกเพิ่ม · ควรจัดคอลัมน์เลขสมาชิกใน Excel เป็น "ข้อความ" ก่อน เพื่อไม่ให้ศูนย์นำหน้าหาย
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed bg-white p-4 hover:bg-sky-50">
          <Upload className="size-6 text-primary" />
          <span className="text-sm">{file ? file.name : 'เลือกไฟล์ .xlsx หรือ .csv'}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>

        {sheet && mapping && (
          <div className="grid gap-3 sm:grid-cols-4">
            {IMPORT_FIELDS.map((f) => (
              <Field key={f.field} id={`map-${f.field}`} label={`${f.label}${f.required ? ' *' : ''}`}>
                <select
                  id={`map-${f.field}`}
                  className={selectClass}
                  value={mapping[f.field]}
                  onChange={(e) => setMapping({ ...mapping, [f.field]: Number(e.target.value) })}
                >
                  <option value={-1}>— ไม่มี —</option>
                  {sheet.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `คอลัมน์ ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        )}

        {preview && !missingRequired && (
          <>
            <Notice tone={errors.length ? 'error' : 'info'}>
              พร้อมนำเข้า {preview.rows.length.toLocaleString('th-TH')} จาก {sheet!.rows.length.toLocaleString('th-TH')} แถว
              {errors.length > 0 && ` · ข้อผิดพลาด ${errors.length} แถว (จะไม่ถูกนำเข้า)`}
              {warnings.length > 0 && ` · คำเตือน ${warnings.length} แถว`}
            </Notice>
            {preview.issues.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg border bg-white p-2 text-xs">
                {preview.issues.slice(0, 200).map((i, k) => (
                  <li key={k} className={i.level === 'error' ? 'text-destructive' : 'text-warning-foreground'}>
                    แถว {i.row}: {i.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-xs">
                <thead className="bg-secondary text-left [&_th]:px-2 [&_th]:py-1">
                  <tr><th>เลขสมาชิก</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th><th>ประเภท</th></tr>
                </thead>
                <tbody className="divide-y [&_td]:px-2 [&_td]:py-1">
                  {preview.rows.slice(0, 8).map((r) => (
                    <tr key={r.memberId}>
                      <td className="font-mono">{r.memberId}</td><td>{r.fullName}</td><td>{r.office}</td><td>{MEMBER_TYPE_LABEL[r.memberType]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {missingRequired && sheet && <Notice tone="error">กรุณาจับคู่คอลัมน์ที่มี * ให้ครบ</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}

        <DialogFooter>
          <Button variant="outline" disabled={running} onClick={() => { reset(); onClose() }}>ปิด</Button>
          <Button disabled={!preview || missingRequired || preview.rows.length === 0 || running || !!done} onClick={() => void run()}>
            {running && <Loader2 className="animate-spin" />}
            {progress || `นำเข้า ${preview?.rows.length.toLocaleString('th-TH') ?? 0} ราย`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
