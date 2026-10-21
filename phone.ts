/** Kenyan mobile numbers to international digits (254…), or null if it does not look valid. */
export function normalizeKePhone(input: string): string | null {
  const d = input.replace(/[\s\-()]/g, '').replace(/^\+/, '')
  if (/^0[17]\d{8}$/.test(d)) return '254' + d.slice(1)
  if (/^254[17]\d{8}$/.test(d)) return d
  if (/^[17]\d{8}$/.test(d)) return '254' + d
  return null
}
