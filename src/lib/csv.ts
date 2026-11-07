/** RFC 4180 CSV with spreadsheet-formula guard (cells starting = + - @ are prefixed with a quote). */
const cell = (v: string | number | null | undefined) => {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = "'" + s
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export const toCsv = (rows: (string | number | null)[][]) => rows.map(r => r.map(cell).join(',')).join('\r\n')
export function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}
