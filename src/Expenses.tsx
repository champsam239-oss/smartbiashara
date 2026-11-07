import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes, toMinor } from './lib/money'
import { nairobiToday } from './lib/dates'

type E = { id: string; category: string; amount_minor: number; method: string; incurred_on: string; description: string | null }
const CATS = ['Rent', 'Transport', 'Electricity', 'Wages', 'Packaging', 'Supplier charges', 'Repairs', 'Other']
export default function Expenses({ biz }: { biz: string }) {
  const [list, setList] = useState<E[]>([]); const [cat, setCat] = useState(CATS[0]); const [amt, setAmt] = useState(''); const [method, setMethod] = useState('cash')
  const [date, setDate] = useState(nairobiToday()); const [desc, setDesc] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(() => { supabase.from('expenses').select('id,category,amount_minor,method,incurred_on,description').eq('business_id', biz).is('reversed_at', null).order('incurred_on', { ascending: false }).limit(50).then(r => setList((r.data as E[]) ?? [])) }, [biz])
  useEffect(load, [load])
  async function add() {
    setErr(''); const a = toMinor(amt)
    if (!a || a <= 0) return setErr('Enter the amount as a number more than zero, e.g. 1500.')
    setBusy(true)
    const { error } = await supabase.rpc('record_expense', { p_business: biz, p_category: cat, p_amount: a, p_method: method, p_on: date, p_desc: desc || null })
    setBusy(false); if (error) return setErr(error.message)
    setAmt(''); setDesc(''); load()
  }
  async function reverse(id: string) {
    const reason = window.prompt('Why are you removing this expense?'); if (!reason?.trim()) return
    const { error } = await supabase.rpc('reverse_expense', { p_business: biz, p_expense: id, p_reason: reason }); if (error) setErr(error.message); else load()
  }
  return <>
    <div className="card"><h2 style={{ marginTop: 0 }}>Record an expense</h2>
      <div className="row"><select value={cat} onChange={e => setCat(e.target.value)} aria-label="Category">{CATS.map(c => <option key={c}>{c}</option>)}</select><input inputMode="decimal" placeholder="Amount" value={amt} onChange={e => setAmt(e.target.value)} aria-label="Amount" /></div>
      <div className="row" style={{ marginTop: 8 }}><select value={method} onChange={e => setMethod(e.target.value)} aria-label="Paid by"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select><input type="date" value={date} max={nairobiToday()} onChange={e => setDate(e.target.value)} aria-label="Date" /></div>
      <input style={{ marginTop: 8 }} placeholder="Note (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
      <small>Buying stock to resell? Record it as a purchase, not an expense.</small>
      {err && <div className="err" role="alert">{err}</div>}
      <button onClick={add} disabled={busy} style={{ width: '100%', marginTop: 12 }}>{busy ? 'Saving…' : 'Save expense'}</button></div>
    {list.length === 0 ? <div className="empty">No expenses recorded yet. Add rent, transport or wages above.</div>
      : list.map(e => <div className="card item" key={e.id}><div><strong>{e.category}</strong><small>{e.incurred_on} · {e.method}{e.description ? ' · ' + e.description : ''}</small></div><div className="row" style={{ flex: '0 0 auto' }}><strong>{fmtKes(e.amount_minor)}</strong><button className="ghost fit" onClick={() => reverse(e.id)}>Remove</button></div></div>)}
  </>
}
