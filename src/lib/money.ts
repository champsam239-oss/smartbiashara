/** Money is integer cents (KES minor units). Never use floats for arithmetic. */
export function toMinor(input: string): number | null {
  const s = input.replace(/[,\s]|KES/gi, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}
export function fmtKes(minor: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cents = abs % 100
  return `${sign}KES ${whole}${cents ? '.' + String(cents).padStart(2, '0') : ''}`
}
export const fmtNairobi = (iso: string) =>
  new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
