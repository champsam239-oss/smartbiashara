import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes, toMinor } from './lib/money'
import { normalizeKePhone } from './lib/phone'
import { download, toCsv } from './lib/csv'

type B = { customer_id: string; name: string; phone: string | null; balance_minor: number; overdue_minor: number }
export default function Customers({ biz }: { biz: string }) {
  const [rows, setRows] = useState<B[]>([]); const [name, setName] = useState(''); const [phone, setPhone] = useState('')
  const [open, setOpen] = useState(''); const [amt, setAmt] = useState(''); const [method, setMethod] = useState('cash'); const [ref, setRef] = useState('')
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState<'all' | 'owing' | 'overdue'>('all'); const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const load = useCallback(() => {
    setLoading(true)
    void (async () => {
      try {
        const r = await supabase.rpc('customer_balances', { p_business: biz })
        if (r.error) setErr(r.error.message); else setRows((r.data as B[]) ?? [])
      } catch { setErr('Could not load customer balances. Check your connection.') }
      finally { setLoading(false) }
    })()
  }, [biz])
  useEffect(load, [load])
  async function addCustomer() {
    setErr(''); if (name.trim().length < 2) return setErr('Enter the customer name.')
    const { error } = await supabase.from('customers').insert({ business_id: biz, name: name.trim(), phone: phone.trim() || null })
    if (error) return setErr(error.message); setName(''); setPhone(''); load()
  }
  async function pay(id: string, owed: number) {
    setErr(''); setOk(''); const a = toMinor(amt)
    if (!a || a <= 0) return setErr('Enter the amount received as a number, e.g. 500.')
    if (a > owed) return setErr(`This customer owes ${fmtKes(owed)}. You cannot receive more than that.`)
    const { error } = await supabase.rpc('record_customer_payment', { p_business: biz, p_customer: id, p_method: method, p_amount: a, p_reference: ref || null })
    if (error) return setErr(error.message.includes('payments_ref_uniq') ? 'That M-Pesa reference was already recorded.' : error.message)
    setOk('Payment recorded.'); setOpen(''); setAmt(''); setRef(''); load()
  }
  const total = rows.reduce((s, r) => s + r.balance_minor, 0)
  const overdueTotal = rows.reduce((s, r) => s + r.overdue_minor, 0)
  const visibleRows = rows.filter(r => (filter === 'all' || (filter === 'owing' ? r.balance_minor > 0 : r.overdue_minor > 0)) && `${r.name} ${r.phone ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  function exportDebts() {
    download(`customer-balances-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['Customer', 'Phone', 'Balance (KES)', 'Overdue (KES)'],
      ...visibleRows.map(r => [r.name, r.phone ?? '', r.balance_minor / 100, r.overdue_minor / 100]),
    ]))
  }
  return <>
    <div className="row"><div className="card"><small>Total owed to you</small><div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{fmtKes(total)}</div></div><div className="card"><small>Overdue</small><div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{fmtKes(overdueTotal)}</div></div></div>
    <div className="card"><div className="row"><input placeholder="Customer name" value={name} onChange={e => setName(e.target.value)} aria-label="Customer name" /><input inputMode="tel" placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} aria-label="Phone" /></div>
      <button onClick={addCustomer} style={{ width: '100%', marginTop: 8 }}>Add customer</button></div>
    {err && <div className="err" role="alert">{err}</div>}{ok && <div className="ok" role="status">{ok}</div>}
    {rows.length > 0 && <><div className="row"><input placeholder="Find customer" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find customer by name or phone" /><button className="ghost fit" onClick={exportDebts}>Export balances</button></div><nav aria-label="Customer debt filter">{(['all', 'owing', 'overdue'] as const).map(k => <button key={k} aria-current={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'All customers' : k === 'owing' ? 'Owing' : 'Overdue'}</button>)}</nav></>}
    {loading ? <div className="empty">Loading customer balances…</div> : rows.length === 0 ? <div className="empty">No customers yet. Add one here, or while recording a credit sale.</div>
      : visibleRows.length === 0 ? <div className="empty">No customers match this filter.</div> : visibleRows.map(r => <div className="card" key={r.customer_id}>
        <div className="item"><div><strong>{r.name}</strong><small>{r.phone ?? 'No phone'}{r.overdue_minor > 0 && <span className="low"> · Overdue {fmtKes(r.overdue_minor)}</span>}</small></div>
          <div className="row" style={{ flex: '0 0 auto' }}><strong>{fmtKes(r.balance_minor)}</strong>{r.overdue_minor > 0 && normalizeKePhone(r.phone ?? '') && (() => { const t = encodeURIComponent(`Hello ${r.name}, a friendly reminder that ${fmtKes(r.overdue_minor)} of your balance is overdue. Please contact us if you have already paid. Thank you.`), n = normalizeKePhone(r.phone ?? ''); return <a className="fit" href={`https://wa.me/${n}?text=${t}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', fontWeight: 600, padding: '0 6px' }}>Remind</a> })()}{r.balance_minor > 0 && <button className="ghost fit" onClick={() => { setOpen(open === r.customer_id ? '' : r.customer_id); setErr(''); setOk('') }}>Receive payment</button>}</div></div>
        {open === r.customer_id && <div style={{ marginTop: 8 }}><div className="row"><input inputMode="decimal" placeholder="Amount received" value={amt} onChange={e => setAmt(e.target.value)} aria-label="Amount received" /><select value={method} onChange={e => setMethod(e.target.value)} aria-label="Method"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></div>
          {method !== 'cash' && <input style={{ marginTop: 8 }} placeholder="Transaction reference (optional)" value={ref} onChange={e => setRef(e.target.value)} />}
          <button onClick={() => pay(r.customer_id, r.balance_minor)} style={{ width: '100%', marginTop: 8 }}>Save payment</button></div>}
      </div>)}
  </>
}
