const NAIROBI = 'Africa/Nairobi'
const DAY_MS = 24 * 60 * 60 * 1000

export function nairobiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NAIROBI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + amount))
  return value.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const asUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((asUtc(to) - asUtc(from)) / DAY_MS)
}

export function nairobiStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  // Nairobi is UTC+03:00 and does not observe daylight saving time.
  return new Date(Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000).toISOString()
}
