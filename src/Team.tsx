import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type M = { user_id: string; role: string; email: string }
export default function Team({ biz }: { biz: string }) {
  const [rows, setRows] = useState<M[]>([]); const [email, setEmail] = useState(''); const [role, setRole] = useState('cashier'); const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('team', { body: { business_id: biz, ...body } })
    if (error) { let m = 'Could not reach the server. Check your connection.'; try { m = (await (error as { context: Response }).context.json()).error ?? m } catch { /* keep default */ } throw new Error(m) }
    return data
  }
  const load = useCallback(() => { call({ action: 'list' }).then(d => setRows(d.members)).catch(e => setErr(e.message)) }, [biz])
  useEffect(load, [load])
  async function run(b: Record<string, unknown>, done: string) { setErr(''); setOk(''); setBusy(true); try { await call(b); setOk(done); setEmail(''); load() } catch (e) { setErr((e as Error).message) } setBusy(false) }
  return <>
    <div className="card"><h2 style={{ marginTop: 0 }}>Add a team member</h2>
      <input type="email" placeholder="Their email address" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
      <select style={{ marginTop: 8 }} value={role} onChange={e => setRole(e.target.value)} aria-label="Role"><option value="cashier">Cashier: sells and records customer payments</option><option value="manager">Manager: also manages products, stock and expenses</option></select>
      <button disabled={busy} onClick={() => run({ action: 'invite', email, role }, 'Invitation sent. They will get an email to set a password.')} style={{ width: '100%', marginTop: 12 }}>Send invitation</button></div>
    {err && <div className="err" role="alert">{err}</div>}{ok && <div className="ok" role="status">{ok}</div>}
    {rows.map(m => <div className="card item" key={m.user_id}><div><strong>{m.email}</strong><small>{m.role}</small></div>
      {m.role !== 'owner' && <div className="row" style={{ flex: '0 0 auto' }}>
        <select value={m.role} aria-label={`Role for ${m.email}`} onChange={e => run({ action: 'set_role', user_id: m.user_id, role: e.target.value }, 'Role updated.')}><option value="manager">manager</option><option value="cashier">cashier</option></select>
        <button className="ghost fit" onClick={() => window.confirm(`Remove ${m.email}? They will lose access.`) && run({ action: 'remove', user_id: m.user_id }, 'Person removed.')}>Remove</button></div>}</div>)}
  </>
}
