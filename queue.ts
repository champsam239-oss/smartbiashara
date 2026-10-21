/** Offline sale queue. Safe because record_sale is idempotent on its client transaction id: replaying a sale that already
 *  reached the server returns the original sale instead of creating a second one. Receipt numbers are assigned on upload. */
export type Pending = { id: string; biz: string; args: Record<string, unknown>; total: number; at: string; status: 'pending' | 'rejected'; error?: string }
type Result = { error?: { code?: string; message?: string } | null }
const KEY = 'biashara:queue:v1'
const read = (): Pending[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const write = (l: Pending[]) => { localStorage.setItem(KEY, JSON.stringify(l)); listeners.forEach(f => f()) }
const listeners = new Set<() => void>()
export const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const list = (biz: string) => read().filter(p => p.biz === biz)
export function enqueue(p: Pending) { const l = read(); if (!l.some(x => x.id === p.id)) write([...l, p]) }
export const discard = (id: string) => write(read().filter(p => p.id !== id))
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
