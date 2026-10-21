import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes, toMinor } from './lib/money'

type B = { customer_id: string; name: string; phone: string | null; balance_minor: number; overdue_minor: number }
export default function Customers({ biz }: { biz: string }) {
  const [rows, setRows] = useState<B[]>([]); const [name, setName] = useState(''); const [phone, setPhone] = useState('')
  const [open, setOpen] = useState(''); const [amt, setAmt] = useState(''); const [method, setMethod] = useState('cash'); const [ref, setRef] = useState('')
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const load = useCallback(() => { supabase.rpc('customer_balances', { p_business: biz }).then(r => setRows((r.data as B[]) ?? [])) }, [biz])
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
  return <>
    <div className="card"><small>Total owed to you</small><div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{fmtKes(total)}</div></div>
    <div className="card"><div className="row"><input placeholder="Customer name" value={name} onChange={e => setName(e.target.value)} aria-label="Customer name" /><input inputMode="tel" placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} aria-label="Phone" /></div>
      <button onClick={addCustomer} style={{ width: '100%', marginTop: 8 }}>Add customer</button></div>
    {err && <div className="err" role="alert">{err}</div>}{ok && <div className="ok" role="status">{ok}</div>}
    {rows.length === 0 ? <div className="empty">No customers yet. Add one here, or while recording a credit sale.</div>
      : rows.map(r => <div className="card" key={r.customer_id}>
        <div className="item"><div><strong>{r.name}</strong><small>{r.phone ?? 'No phone'}{r.overdue_minor > 0 && <span className="low"> · Overdue {fmtKes(r.overdue_minor)}</span>}</small></div>
          <div className="row" style={{ flex: '0 0 auto' }}><strong>{fmtKes(r.balance_minor)}</strong>{r.balance_minor > 0 && <button className="ghost fit" onClick={() => { setOpen(open === r.customer_id ? '' : r.customer_id); setErr(''); setOk('') }}>Receive payment</button>}</div></div>
        {open === r.customer_id && <div style={{ marginTop: 8 }}><div className="row"><input inputMode="decimal" placeholder="Amount received" value={amt} onChange={e => setAmt(e.target.value)} aria-label="Amount received" /><select value={method} onChange={e => setMethod(e.target.value)} aria-label="Method"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></div>
          {method !== 'cash' && <input style={{ marginTop: 8 }} placeholder="Transaction reference (optional)" value={ref} onChange={e => setRef(e.target.value)} />}
          <button onClick={() => pay(r.customer_id, r.balance_minor)} style={{ width: '100%', marginTop: 8 }}>Save payment</button></div>}
      </div>)}
  </>
}
