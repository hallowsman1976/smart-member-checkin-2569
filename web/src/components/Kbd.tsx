/** ปุ่มลัดคีย์บอร์ด — แสดงเฉพาะจอกว้าง (มือถือ/แท็บเล็ตไม่มีคีย์บอร์ด) */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ml-1 hidden rounded border border-current/25 px-1.5 py-px font-sans text-[0.7em] font-medium opacity-70 md:inline">
      {children}
    </kbd>
  )
}
