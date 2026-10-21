import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes } from './lib/money'
import { nairobiToday, addDays, nairobiStart } from './lib/dates'
import { toCsv, download } from './lib/csv'

type R = { net_sales_minor: number; cogs_minor: number; gross_profit_minor: number; expenses_minor: number; net_profit_minor: number; cash_collected_minor: number; unpaid_credit_minor: number }
type Aging = { customer_id: string; name: string; not_due_minor: number; d1_30_minor: number; d31_60_minor: number; d60_plus_minor: number; total_minor: number }
type Item = { product_id: string; qty: number; unit_price_minor: number; unit_cost_minor: number; products: { name: string } | null }
const PRESETS = { Today: 0, 'Last 7 days': 6, 'Last 30 days': 29 } as const
export default function Reports({ biz }: { biz: string }) {
  const [preset, setPreset] = useState<keyof typeof PRESETS>('Last 7 days')
  const to = nairobiToday(); const from = addDays(to, -PRESETS[preset])
  const [r, setR] = useState<R | null>(null); const [items, setItems] = useState<Item[]>([]); const [err, setErr] = useState('')
  const [aging, setAging] = useState<Aging[]>([]); const [slow, setSlow] = useState<{ name: string; stock_qty: number }[]>([])
  useEffect(() => {
    supabase.rpc('debt_aging', { p_business: biz }).then(a => setAging((a.data as Aging[]) ?? []))
    const since = nairobiStart(addDays(nairobiToday(), -29))
    Promise.all([supabase.from('products').select('id,name,stock_qty').eq('business_id', biz).eq('active', true).gt('stock_qty', 0),
      supabase.from('sale_items').select('product_id,sales!inner(status,created_at)').eq('business_id', biz).eq('sales.status', 'completed').gte('sales.created_at', since)])
      .then(([p, i]) => { const sold = new Set(((i.data ?? []) as unknown as { product_id: string }[]).map(x => x.product_id)); setSlow(((p.data ?? []) as { id: string; name: string; stock_qty: number }[]).filter(x => !sold.has(x.id))) })
  }, [biz])
  useEffect(() => {
    setErr('')
    const p_from = nairobiStart(from), p_to = nairobiStart(addDays(to, 1))
    Promise.all([
      supabase.rpc('profit_report', { p_business: biz, p_from, p_to }),
      supabase.from('sale_items').select('product_id,qty,unit_price_minor,unit_cost_minor,products(name),sales!inner(status,created_at)').eq('business_id', biz).eq('sales.status', 'completed').gte('sales.created_at', p_from).lt('sales.created_at', p_to)])
      .then(([a, b]) => { if (a.error || b.error) throw (a.error ?? b.error); setR((a.data as R[])[0]); setItems(b.data as unknown as Item[]) })
      .catch(e => setErr((e as Error).message))
  }, [biz, from, to])
  const byProduct = Object.values(items.reduce<Record<string, { name: string; qty: number; revenue: number; profit: number }>>((m, i) => {
    const x = m[i.product_id] ??= { name: i.products?.name ?? 'Unknown', qty: 0, revenue: 0, profit: 0 }
    x.qty += i.qty; x.revenue += i.qty * i.unit_price_minor; x.profit += i.qty * (i.unit_price_minor - i.unit_cost_minor); return m
  }, {})).sort((a, b) => b.qty - a.qty)
  function exportCsv() {
    if (!r) return
    download(`report-${from}-to-${to}.csv`, toCsv([
      ['Smart Biashara report (estimate; depends on accurate records)', `${from} to ${to}`], [],
      ['Net sales (KES)', r.net_sales_minor / 100], ['Cost of goods sold', r.cogs_minor / 100], ['Gross profit', r.gross_profit_minor / 100],
      ['Operating expenses', r.expenses_minor / 100], ['Estimated net operating profit', r.net_profit_minor / 100],
      ['Cash and digital collected', r.cash_collected_minor / 100], ['Unpaid credit', r.unpaid_credit_minor / 100], [],
      ['Product', 'Units sold', 'Sales before discount (KES)', 'Profit before discount (KES)'], ...byProduct.map(p => [p.name, p.qty, p.revenue / 100, p.profit / 100])]))
  }
  const Row = ({ l, v, b }: { l: string; v: number; b?: boolean }) => <div className="item" style={{ padding: '6px 0', fontWeight: b ? 800 : 400 }}><span>{l}</span><span>{fmtKes(v)}</span></div>
  return <>
    <nav>{(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(k => <button key={k} aria-current={preset === k} onClick={() => setPreset(k)}>{k}</button>)}</nav>
    {err && <div className="err" role="alert">{err}</div>}
    {r && <div className="card"><h2 style={{ marginTop: 0 }}>{from === to ? from : `${from} to ${to}`}</h2>
      <Row l="Net sales (after discounts)" v={r.net_sales_minor} /><Row l="Cost of goods sold" v={-r.cogs_minor} /><Row b l="Gross profit" v={r.gross_profit_minor} />
      <Row l="Operating expenses" v={-r.expenses_minor} /><Row b l="Estimated net operating profit" v={r.net_profit_minor} />
      <hr /><Row l="Cash and digital collected" v={r.cash_collected_minor} /><Row l="Unpaid credit from these sales" v={r.unpaid_credit_minor} />
      <small>Estimates only. Results depend on accurate records of sales, costs and expenses.</small></div>}
    <h2>Products sold</h2>
    {byProduct.length === 0 ? <div className="empty">No sales in this period.</div> : byProduct.map(p => <div className="card item" key={p.name}><div><strong>{p.name}</strong><small>{p.qty} sold · profit {fmtKes(p.profit)}</small></div><span>{fmtKes(p.revenue)}</span></div>)}
    <h2>Customer debt aging</h2>
    {aging.length === 0 ? <div className="empty">No customer owes you money.</div> : aging.map(a => <div className="card" key={a.customer_id}><div className="item"><strong>{a.name}</strong><strong>{fmtKes(a.total_minor)}</strong></div>
      <small>Not yet due {fmtKes(a.not_due_minor)} · 1–30 days late {fmtKes(a.d1_30_minor)} · 31–60 days {fmtKes(a.d31_60_minor)} · over 60 days {fmtKes(a.d60_plus_minor)}</small></div>)}
    <h2>Slow-moving stock</h2>
    {slow.length === 0 ? <div className="empty">Every product in stock has sold in the last 30 days.</div> : slow.map(x => <div className="card item" key={x.name}><span>{x.name}</span><span>{x.stock_qty} unsold</span></div>)}
    <button className="ghost" onClick={() => window.print()} style={{ width: '100%', marginTop: 8 }}>Print or save as PDF</button>
    <button onClick={exportCsv} disabled={!r} style={{ width: '100%', marginTop: 8 }}>Download CSV</button>
  </>
}
