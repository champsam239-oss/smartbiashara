import { describe, it, expect, beforeEach } from 'vitest'
import { enqueue, flush, list, pendingQty, isRejection, isNetworkError } from './queue'
const mem: Record<string, string> = {}
;(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v }, removeItem: k => { delete mem[k] }, clear: () => {}, key: () => null, length: 0 }
const sale = (id: string, qty = 2) => ({ id, biz: 'b', args: { p_items: [{ product_id: 'p1', qty }] }, total: 100, at: '', status: 'pending' as const })
beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k] })
describe('offline queue', () => {
  it('does not queue the same sale twice and counts reserved stock', () => { enqueue(sale('a')); enqueue(sale('a')); enqueue(sale('b', 3)); expect(list('b')).toHaveLength(2); expect(pendingQty('b', 'p1')).toBe(5) })
  it('uploads in order and removes sent sales', async () => { enqueue(sale('a')); enqueue(sale('b')); const seen: string[] = []; const r = await flush(async p => { seen.push(p.id); return {} }); expect(seen).toEqual(['a', 'b']); expect(r.sent).toBe(2); expect(list('b')).toHaveLength(0) })
  it('keeps sales and stops when the network fails', async () => { enqueue(sale('a')); enqueue(sale('b')); const r = await flush(async () => ({ error: { message: 'TypeError: Failed to fetch' } })); expect(r.stopped).toBe(true); expect(list('b')).toHaveLength(2) })
  it('marks a rule-breaking sale as rejected without blocking others', async () => { enqueue(sale('a')); enqueue(sale('b')); const r = await flush(async p => (p.id === 'a' ? { error: { code: 'P0001', message: 'Not enough stock for Sugar' } } : {})); expect(r.rejected).toBe(1); expect(r.sent).toBe(1); expect(list('b')[0]).toMatchObject({ id: 'a', status: 'rejected' }); expect(pendingQty('b', 'p1')).toBe(0) })
  it('classifies errors', () => { expect(isRejection({ code: 'P0001' })).toBe(true); expect(isRejection({ code: 'PGRST301' })).toBe(false); expect(isNetworkError({ message: 'Failed to fetch' })).toBe(true); expect(isNetworkError({ code: 'P0001' })).toBe(false) })
})
