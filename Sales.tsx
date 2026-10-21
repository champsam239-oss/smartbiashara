import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes, fmtNairobi } from './lib/money'

type S = { id: string; receipt_no: string; total_minor: number; status: string; created_at: string; reversal_reason: string | null; customers: { name: string } | null }
export default function Sales({ biz, onChange }: { biz: string; onChange: () => void }) {
  const [rows, setRows] = useState<S[]>([]); const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    let query = supabase.from('sales').select('id,receipt_no,total_minor,status,created_at,reversal_reason,customers(name)').eq('business_id', biz).order('created_at', { ascending: false }).limit(50)
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
      : rows.map(s => <div className="card item" key={s.id} style={s.status === 'reversed' ? { opacity: .6 } : undefined}>
        <div><strong>{s.receipt_no}</strong><small>{fmtNairobi(s.created_at)}{s.customers ? ' · ' + s.customers.name : ''}</small>{s.status === 'reversed' && <small className="low">Reversed: {s.reversal_reason}</small>}</div>
        <div className="row" style={{ flex: '0 0 auto' }}><strong>{fmtKes(s.total_minor)}</strong>{s.status === 'completed' && <button className="ghost fit" onClick={() => reverse(s)}>Reverse</button>}</div></div>)}
  </>
}
