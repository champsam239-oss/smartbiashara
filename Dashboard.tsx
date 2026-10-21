import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes } from './lib/money'
import { nairobiToday, addDays, daysBetween, nairobiStart } from './lib/dates'

type R = { net_sales_minor: number; cogs_minor: number; gross_profit_minor: number; expenses_minor: number; net_profit_minor: number; cash_collected_minor: number; unpaid_credit_minor: number }
type P = { name: string; cost_minor: number; stock_qty: number; min_stock: number }
const report = async (biz: string, from: string, toIncl: string) => {
  const { data, error } = await supabase.rpc('profit_report', { p_business: biz, p_from: nairobiStart(from), p_to: nairobiStart(addDays(toIncl, 1)) })
  if (error) throw error; return (data as R[])[0]
}
function Card({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return <div className="card" style={strong ? { background: 'var(--green)', color: '#fff' } : undefined}><small style={{ color: strong ? '#cfe3d8' : 'var(--grey)' }}>{label}</small><div style={{ fontSize: strong ? '1.8rem' : '1.3rem', fontWeight: 800 }}>{value}</div>{note && <small style={{ color: strong ? '#cfe3d8' : 'var(--grey)' }}>{note}</small>}</div>
}
export default function Dashboard({ biz, products }: { biz: string; products: P[] }) {
  const [from, setFrom] = useState(nairobiToday()); const [to, setTo] = useState(nairobiToday())
  const [cur, setCur] = useState<R | null>(null); const [prev, setPrev] = useState<R | null>(null)
  const [debt, setDebt] = useState(0); const [err, setErr] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (from > to) { setErr('The start date must be on or before the end date.'); return }
    const n = daysBetween(from, to) + 1; setErr(''); setLoading(true)
    Promise.all([report(biz, from, to), report(biz, addDays(from, -n), addDays(from, -1)),
      supabase.rpc('customer_balances', { p_business: biz })])
      .then(([c, p, d]) => { setCur(c); setPrev(p); setDebt(((d.data ?? []) as { balance_minor: number }[]).reduce((s, x) => s + x.balance_minor, 0)) })
      .catch(e => setErr((e as Error).message + ' Check your connection and try again.')).finally(() => setLoading(false))
  }, [biz, from, to])
  const low = products.filter(p => p.stock_qty <= p.min_stock)
  const stockValue = products.reduce((s, p) => s + p.stock_qty * p.cost_minor, 0)
  const diff = cur && prev ? cur.net_sales_minor - prev.net_sales_minor : 0
  return <>
    <div className="row"><label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label></div>
    {err && <div className="err" role="alert">{err}</div>}
    {loading && !cur ? <p>Loading…</p> : cur && <>
      <Card strong label="Estimated net profit" value={fmtKes(cur.net_profit_minor)} note="Gross profit minus recorded expenses. An estimate; it depends on accurate records." />
      {cur.net_sales_minor === 0 && cur.expenses_minor === 0 && <div className="empty">No sales or expenses in this period yet. Record a sale to see your numbers.</div>}
      <div className="row"><Card label="Sales (revenue)" value={fmtKes(cur.net_sales_minor)} note={prev ? `${diff >= 0 ? 'Up' : 'Down'} ${fmtKes(Math.abs(diff))} on the previous ${daysBetween(from, to) + 1} day(s)` : undefined} /><Card label="Gross profit" value={fmtKes(cur.gross_profit_minor)} note={`Cost of goods ${fmtKes(cur.cogs_minor)}`} /></div>
      <div className="row"><Card label="Cash collected" value={fmtKes(cur.cash_collected_minor)} note="Money actually received (cash, M-Pesa, bank)" /><Card label="Unpaid credit sales" value={fmtKes(cur.unpaid_credit_minor)} note="Not yet received. Not counted as cash." /></div>
      <div className="row"><Card label="Expenses" value={fmtKes(cur.expenses_minor)} /><Card label="Stock value (at cost)" value={fmtKes(stockValue)} /></div>
      <Card label="All customer debts owed to you" value={fmtKes(debt)} />
    </>}
    <h2>Low stock</h2>
    {low.length === 0 ? <div className="empty">No products are below their minimum level.</div> : low.map(p => <div className="card item" key={p.name}><strong>{p.name}</strong><span className="low">{p.stock_qty} left (warn at {p.min_stock})</span></div>)}
  </>
}
