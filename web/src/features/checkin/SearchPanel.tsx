import { forwardRef, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { ArrowsClockwiseIcon, CircleNotchIcon, MagnifyingGlassIcon, UserMinusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatClock, MEMBER_TYPE_LABEL } from '@/lib/format'
import { searchMembers, type IndexedMember } from '@/lib/search'
import type { Member } from '@/types/api'
import type { useMembers } from '@/hooks/useMembers'

const DEBOUNCE_MS = 250
const MAX_RESULTS = 20

interface Props {
  members: ReturnType<typeof useMembers>
  query: string
  onQueryChange: (q: string) => void
  selectedId: string | null
  disabled: boolean
  onSelect: (m: Member) => void
}

export const SearchPanel = forwardRef<HTMLInputElement, Props>(function SearchPanel(
  { members, query, onQueryChange, selectedId, disabled, onSelect },
  inputRef,
) {
  const [debounced, setDebounced] = useState(query)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  const results: IndexedMember[] = useMemo(
    () => (members.items ? searchMembers(members.items, debounced, MAX_RESULTS) : []),
    [members.items, debounced],
  )

  useEffect(() => setHighlight(0), [results])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // กด Enter ก่อนครบ debounce ให้ค้นทันที
      const list = debounced === query ? results : members.items ? searchMembers(members.items, query, MAX_RESULTS) : []
      const pick = list[debounced === query ? highlight : 0]
      if (pick && !disabled) onSelect(pick)
    }
  }

  const pending = debounced !== query

  return (
    <section className="flex min-h-0 flex-col gap-3" aria-label="ค้นหาสมาชิก">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="พิมพ์เลขสมาชิก หรือ ชื่อ-นามสกุล"
          aria-label="ค้นหาเลขสมาชิกหรือชื่อ"
          aria-controls="member-results"
          className="h-14 rounded-xl bg-card pl-11 text-lg"
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {members.items
            ? `สมาชิก ${members.items.length.toLocaleString('th-TH')} คน · อัปเดต ${members.loadedAt ? formatClock(members.loadedAt) : '-'} น.`
            : members.error || 'กำลังโหลดรายชื่อสมาชิก…'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void members.refresh()} disabled={members.loading}>
          <ArrowsClockwiseIcon className={members.loading ? 'animate-spin' : ''} />
          รีเฟรชรายชื่อ
        </Button>
      </div>

      {!members.items && !members.error && (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <CircleNotchIcon className="animate-spin" /> กำลังโหลดรายชื่อสมาชิก…
        </div>
      )}
      {!members.items && members.error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {members.error}
          <Button className="mt-2 w-full" variant="outline" onClick={() => void members.refresh()}>
            ลองโหลดใหม่
          </Button>
        </div>
      )}

      {members.items && query.trim() !== '' && !pending && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-6 text-center">
          <UserMinusIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">ไม่พบสมาชิก "{query.trim()}"</p>
          <p className="text-sm text-muted-foreground">
            ลองค้นด้วยเลขสมาชิกหรือนามสกุล หากยังไม่พบ กรุณาส่งสมาชิกไปที่ผู้ดูแลระบบ
            แล้วกด "รีเฟรชรายชื่อ" หลังผู้ดูแลระบบเพิ่มข้อมูลแล้ว
          </p>
        </div>
      )}

      {results.length > 0 && (
        <ul id="member-results" role="listbox" aria-label="ผลการค้นหา" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {results.map((m, i) => {
            const active = i === highlight
            const selected = m.memberId === selectedId
            return (
              <li key={m.memberId} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => onSelect(m)}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                    selected ? 'border-primary ring-2 ring-primary/30' : active ? 'border-primary/50 bg-accent' : 'hover:bg-accent'
                  }`}
                >
                  <span className="w-20 shrink-0 font-mono text-sm font-semibold text-primary">{m.memberId}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m.office}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{MEMBER_TYPE_LABEL[m.memberType]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {members.items && query.trim() === '' && (
        <p className="hidden py-6 text-center text-sm text-muted-foreground md:block">
          ใช้ปุ่ม ↑ ↓ เลือกรายชื่อ แล้วกด Enter
        </p>
      )}
    </section>
  )
})
