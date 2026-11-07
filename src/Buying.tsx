import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes, toMinor } from './lib/money'
import { nairobiToday } from './lib/dates'

type P = { id: string; name: string }
type Sup = { id: string; name: string }
type Pu = { id: string; invoice_no: string | null; total_minor: number; paid_minor: number; purchased_on: string; suppliers: { name: string } | null }
type Line = { product_id: string; qty: string; cost: string }
export default function Buying({ biz, products, reload }: { biz: string; products: P[]; reload: () => void }) {
  const [sups, setSups] = useState<Sup[]>([]); const [list, setList] = useState<Pu[]>([]); const [sName, setSName] = useState('')
  const [sup, setSup] = useState(''); const [inv, setInv] = useState(''); const [paid, setPaid] = useState(''); const [lines, setLines] = useState<Line[]>([{ product_id: '', qty: '', cost: '' }])
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const load = useCallback(() => {
    supabase.from('suppliers').select('id,name').eq('business_id', biz).order('name').then(r => setSups((r.data as Sup[]) ?? []))
    supabase.from('purchases').select('id,invoice_no,total_minor,paid_minor,purchased_on,suppliers(name)').eq('business_id', biz).order('created_at', { ascending: false }).limit(30).then(r => setList((r.data as unknown as Pu[]) ?? []))
  }, [biz])
  useEffect(load, [load])
  const upd = (i: number, k: keyof Line, v: string) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  async function addSup() { if (sName.trim().length < 2) return setErr('Enter the supplier name.'); const { error } = await supabase.from('suppliers').insert({ business_id: biz, name: sName.trim() }); if (error) setErr(error.message); else { setSName(''); load() } }
  async function save() {
    setErr(''); setOk('')
    const items = []
    for (const l of lines) {
      const qty = Number(l.qty), cost = toMinor(l.cost)
      if (!l.product_id || !Number.isInteger(qty) || qty < 1 || cost === null) return setErr('Each line needs a product, a whole-number quantity and a unit cost.')
      items.push({ product_id: l.product_id, qty, unit_cost_minor: cost })
    }
    const total = items.reduce((s, i) => s + i.qty * i.unit_cost_minor, 0), p = paid === '' ? 0 : toMinor(paid)
    if (p === null || p > total) return setErr(`Amount paid must be a number up to ${fmtKes(total)}.`)
    const { error } = await supabase.rpc('record_purchase', { p_business: biz, p_supplier: sup || null, p_invoice: inv || null, p_paid: p, p_on: nairobiToday(), p_items: items })
    if (error) return setErr(error.message)
    setOk('Stock received and recorded.'); setLines([{ product_id: '', qty: '', cost: '' }]); setInv(''); setPaid(''); load(); reload()
  }
  async function payInvoice(x: Pu) {
    const v = window.prompt(`Amount paid to supplier (unpaid: ${fmtKes(x.total_minor - x.paid_minor)})`); if (!v) return
    const a = toMinor(v); if (!a) return setErr('Enter the amount as a number.')
    const { error } = await supabase.rpc('pay_purchase', { p_business: biz, p_purchase: x.id, p_amount: a }); if (error) setErr(error.message); else load()
  }
  return <>
    <div className="card"><h2 style={{ marginTop: 0 }}>Receive stock from a supplier</h2>
      <div className="row"><select value={sup} onChange={e => setSup(e.target.value)} aria-label="Supplier"><option value="">No supplier</option>{sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input placeholder="Invoice no. (optional)" value={inv} onChange={e => setInv(e.target.value)} /></div>
      {lines.map((l, i) => <div className="row" style={{ marginTop: 8 }} key={i}><select value={l.product_id} onChange={e => upd(i, 'product_id', e.target.value)} aria-label="Product"><option value="">Product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input inputMode="numeric" placeholder="Qty" value={l.qty} onChange={e => upd(i, 'qty', e.target.value)} aria-label="Quantity" /><input inputMode="decimal" placeholder="Cost each" value={l.cost} onChange={e => upd(i, 'cost', e.target.value)} aria-label="Cost each" /></div>)}
      <button className="ghost" style={{ marginTop: 8 }} onClick={() => setLines([...lines, { product_id: '', qty: '', cost: '' }])}>Add another product</button>
      <input style={{ marginTop: 8 }} inputMode="decimal" placeholder="Amount paid now (leave empty if unpaid)" value={paid} onChange={e => setPaid(e.target.value)} aria-label="Amount paid now" />
      <small>Stock purchases are recorded here, not as expenses. Their cost reaches profit when the goods are sold.</small>
      {err && <div className="err" role="alert">{err}</div>}{ok && <div className="ok" role="status">{ok}</div>}
      <button onClick={save} style={{ width: '100%', marginTop: 12 }}>Save purchase</button></div>
    <div className="card"><div className="row"><input placeholder="New supplier name" value={sName} onChange={e => setSName(e.target.value)} aria-label="New supplier name" /><button className="ghost fit" onClick={addSup}>Add supplier</button></div></div>
    {list.length === 0 ? <div className="empty">No purchases yet. Record stock you receive to keep costs accurate.</div> : list.map(x => <div className="card item" key={x.id}><div><strong>{x.suppliers?.name ?? 'No supplier'}</strong><small>{x.purchased_on}{x.invoice_no ? ' · ' + x.invoice_no : ''} · {fmtKes(x.total_minor)}</small></div>
      {x.total_minor > x.paid_minor ? <button className="ghost fit" onClick={() => payInvoice(x)}>Owe {fmtKes(x.total_minor - x.paid_minor)}</button> : <span>Paid</span>}</div>)}
  </>
}
