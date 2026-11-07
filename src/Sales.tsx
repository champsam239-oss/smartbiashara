import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes, fmtNairobi } from './lib/money'

type Rc = { items: { qty: number; unit_price_minor: number; products: { name: string } | null }[]; pays: { amount_minor: number; payments: { method: string; reference: string | null } | null }[]; shop: string }
type S = { subtotal_minor: number; discount_minor: number; id: string; receipt_no: string; total_minor: number; status: string; created_at: string; reversal_reason: string | null; customers: { name: string } | null }
export default function Sales({ biz, onChange }: { biz: string; onChange: () => void }) {
  const [rows, setRows] = useState<S[]>([]); const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(''); const [rc, setRc] = useState<Rc | null>(null)
  async function show(sid: string) {
    if (open === sid) { setOpen(''); return } setOpen(sid); setRc(null)
    const [a, b, c] = await Promise.all([supabase.from('sale_items').select('qty,unit_price_minor,products(name)').eq('sale_id', sid), supabase.from('payment_allocations').select('amount_minor,payments(method,reference)').eq('sale_id', sid), supabase.from('businesses').select('name').eq('id', biz).single()])
    setRc({ items: (a.data ?? []) as unknown as Rc['items'], pays: (b.data ?? []) as unknown as Rc['pays'], shop: (c.data as { name: string } | null)?.name ?? '' })
  }
  const load = useCallback(() => {
    let query = supabase.from('sales').select('id,subtotal_minor,discount_minor,receipt_no,total_minor,status,created_at,reversal_reason,customers(name)').eq('business_id', biz).order('created_at', { ascending: false }).limit(50)
    if (q.trim()) query = query.ilike('receipt_no', `%${q.trim().replace(/[%_]/g, '')}%`)
    query.then(r => { if (r.error) setErr(r.error.message); else setRows(r.data as unknown as S[]); setLoading(false) })
  }, [biz, q])
  useEffect(load, [load])
  async function reverse(s: S) {
    setErr(''); setOk('')
    const reason = window.prompt(`Reverse receipt ${s.receipt_no}? Stock will be returned and payments voided. Why?`); if (!reason?.trim()) return
    const { error } = await supabase.rpc('reverse_sale', { p_business: biz, p_sale: s.id, p_reason: reason })
    if (error) return setErr(error.message)
    setOk(`Receipt ${s.receipt_no} reversed.`); load(); onChange()
  }
  return <>
    <input placeholder="Search by receipt number" value={q} onChange={e => setQ(e.target.value)} aria-label="Search receipts" />
    {err && <div className="err" role="alert">{err}</div>}{ok && <div className="ok" role="status">{ok}</div>}
    {loading ? <p>Loading…</p> : rows.length === 0 ? <div className="empty">No sales found. Completed sales appear here with their receipt numbers.</div>
      : rows.map(s => <div key={s.id}><div className="card item" style={s.status === 'reversed' ? { opacity: .6 } : undefined}>
        <div onClick={() => show(s.id)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && show(s.id)} style={{ cursor: 'pointer' }}><strong>{s.receipt_no}</strong><small>{fmtNairobi(s.created_at)}{s.customers ? ' · ' + s.customers.name : ''}</small>{s.status === 'reversed' && <small className="low">Reversed: {s.reversal_reason}</small>}</div>
        <div className="row" style={{ flex: '0 0 auto' }}><strong>{fmtKes(s.total_minor)}</strong>{s.status === 'completed' && <button className="ghost fit" onClick={() => reverse(s)}>Reverse</button>}</div></div>
        {open === s.id && <div className="card" style={{ borderStyle: 'dashed' }}>{!rc ? 'Loading…' : <>
          <div style={{ textAlign: 'center' }}><strong>{rc.shop}</strong><br /><small>Receipt {s.receipt_no} · {fmtNairobi(s.created_at)}</small></div><hr />
          {rc.items.map((i, k) => <div className="item" key={k}><span>{i.qty} × {i.products?.name ?? 'Item'}</span><span>{fmtKes(i.qty * i.unit_price_minor)}</span></div>)}
          {s.discount_minor > 0 && <div className="item"><span>Discount</span><span>-{fmtKes(s.discount_minor)}</span></div>}
          <div className="item" style={{ fontWeight: 800 }}><span>Total</span><span>{fmtKes(s.total_minor)}</span></div>
          {rc.pays.map((x, k) => <div className="item" key={k}><small>Paid ({x.payments?.method}{x.payments?.reference ? ' ' + x.payments.reference : ''})</small><small>{fmtKes(x.amount_minor)}</small></div>)}
          {s.status === 'completed' && s.total_minor - rc.pays.reduce((a, x) => a + x.amount_minor, 0) > 0 && <div className="item low"><span>Balance due</span><span>{fmtKes(s.total_minor - rc.pays.reduce((a, x) => a + x.amount_minor, 0))}</span></div>}
          <div className="row" style={{ marginTop: 8 }}><button className="ghost" onClick={() => window.print()}>Print</button><a href={`https://wa.me/?text=${encodeURIComponent(`${rc.shop}\nReceipt ${s.receipt_no}\n${rc.items.map(i => `${i.qty} x ${i.products?.name ?? 'Item'}  ${fmtKes(i.qty * i.unit_price_minor)}`).join('\n')}\nTotal ${fmtKes(s.total_minor)}\nThank you!`)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', fontWeight: 600, textAlign: 'center' }}>Share on WhatsApp</a></div></>}</div>}
      </div>)}
  </>
}
