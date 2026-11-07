/** Offline sale queue. Safe because record_sale is idempotent on its client transaction id: replaying a sale that already
 *  reached the server returns the original sale instead of creating a second one. Receipt numbers are assigned on upload. */
export type Pending = { id: string; biz: string; args: Record<string, unknown>; total: number; at: string; status: 'pending' | 'rejected'; error?: string }
type Result = { error?: { code?: string; message?: string } | null }
const KEY = 'biashara:queue:v1'
const isPending = (value: unknown): value is Pending => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Pending>
  const args = item.args as { p_business?: unknown; p_client_txn?: unknown; p_items?: unknown } | undefined
  return typeof item.id === 'string' && item.id === args?.p_client_txn
    && typeof item.biz === 'string' && item.biz === args?.p_business
    && typeof item.total === 'number' && Number.isSafeInteger(item.total) && item.total >= 0
    && typeof item.at === 'string' && Number.isFinite(Date.parse(item.at))
    && (item.status === 'pending' || item.status === 'rejected')
    && Array.isArray(args?.p_items)
    && args.p_items.every(line => Boolean(line) && typeof line === 'object'
      && typeof (line as { product_id?: unknown }).product_id === 'string'
      && Number.isSafeInteger((line as { qty?: unknown }).qty) && Number((line as { qty: number }).qty) > 0)
}
const read = (): Pending[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(value) ? value.filter(isPending) : []
  } catch { return [] }
}
const write = (l: Pending[]) => { localStorage.setItem(KEY, JSON.stringify(l)); listeners.forEach(f => f()) }
const listeners = new Set<() => void>()
export const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const list = (biz: string) => read().filter(p => p.biz === biz)
export function enqueue(p: Pending) { const l = read(); if (!l.some(x => x.id === p.id)) write([...l, p]) }
export const discard = (id: string) => write(read().filter(p => p.id !== id))
export const retry = (id: string) => write(read().map(p => p.id === id ? { id: p.id, biz: p.biz, args: p.args, total: p.total, at: p.at, status: 'pending' } : p))
export const makeBackup = (biz: string) => JSON.stringify({ version: 1, businessId: biz, savedAt: new Date().toISOString(), sales: list(biz) }, null, 2)
export function restoreBackup(source: string, biz: string): number {
  const data: unknown = JSON.parse(source)
  if (!data || typeof data !== 'object' || (data as { version?: unknown }).version !== 1 || (data as { businessId?: unknown }).businessId !== biz || !Array.isArray((data as { sales?: unknown }).sales)) {
    throw new Error('This backup is invalid or belongs to a different business.')
  }
  const existing = read()
  const ids = new Set(existing.map(item => item.id))
  const restore = ((data as { sales: unknown[] }).sales).filter(isPending).filter(item => item.biz === biz && !ids.has(item.id)).slice(0, 1000)
  write([...existing, ...restore])
  return restore.length
}
/** Units of a product already promised in unsynced sales, so the screen does not oversell while offline. */
export const pendingQty = (biz: string, productId: string) =>
  list(biz).filter(p => p.status === 'pending').reduce((s, p) => s + ((p.args.p_items as { product_id: string; qty: number }[]) ?? []).filter(i => i.product_id === productId).reduce((a, i) => a + i.qty, 0), 0)
/** Only a clear server-side rejection (rule broken) is final. Anything else (no network, auth refresh) is retried later. */
export const isRejection = (e: { code?: string } | null | undefined) => !!e?.code && (e.code === 'P0001' || /^(22|23)/.test(e.code))
export const isNetworkError = (e: { code?: string; message?: string } | null | undefined) => !!e && !isRejection(e) && (!e.code || /fetch|network|load failed/i.test(e.message ?? ''))
let busy = false
export async function flush(send: (p: Pending) => Promise<Result>): Promise<{ sent: number; rejected: number; stopped: boolean }> {
  if (busy) return { sent: 0, rejected: 0, stopped: false }
  busy = true; let sent = 0, rejected = 0, stopped = false
  try {
    for (const p of read().filter(x => x.status === 'pending')) {
      let r: Result
      try { r = await send(p) } catch { stopped = true; break }
      if (!r.error) { discard(p.id); sent++ }
      else if (isRejection(r.error)) { write(read().map(x => (x.id === p.id ? { ...x, status: 'rejected' as const, error: r.error?.message } : x))); rejected++ }
      else { stopped = true; break }
    }
  } finally { busy = false }
  return { sent, rejected, stopped }
}
