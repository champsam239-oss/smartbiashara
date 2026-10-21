import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './lib/supabase'
import { fmtKes, toMinor } from './lib/money'
import Dashboard from './Dashboard'
import Expenses from './Expenses'
import Customers from './Customers'
import Sales from './Sales'
import Reports from './Reports'
import Buying from './Buying'
import Team from './Team'
import SyncBanner from './SyncBanner'
import { enqueue, pendingQty, isNetworkError } from './lib/queue'

type Product = { id: string; name: string; sku: string | null; cost_minor: number; price_minor: number; stock_qty: number; min_stock: number }
type Customer = { id: string; name: string }
const msg = (e: unknown) => (e as { message?: string })?.message ?? 'Something went wrong. Please try again.'

function Auth() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [err, setErr] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState(false)
  async function go() {
    setErr(''); setInfo(''); setBusy(true)
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Enter a valid email address.'); setBusy(false); return }
    if (mode !== 'reset' && pw.length < 8) { setErr('Password must have at least 8 characters.'); setBusy(false); return }
    const r = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password: pw })
      : mode === 'up' ? await supabase.auth.signUp({ email, password: pw })
      : await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
    setBusy(false)
    if (r.error) setErr(r.error.message)
    else if (mode === 'up') setInfo('Account created. Check your email to confirm, then sign in.')
    else if (mode === 'reset') setInfo('If that email has an account, a reset link is on its way.')
  }
  return <main><h1>Smart Biashara Manager</h1>
    <div className="card">
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
      {mode !== 'reset' && <label>Password<input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>}
      {err && <div className="err" role="alert">{err}</div>}{info && <div className="ok">{info}</div>}
      <button onClick={go} disabled={busy} style={{ width: '100%', marginTop: 12 }}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'New here? Create account' : 'Have an account? Sign in'}</button>
        <button className="ghost" onClick={() => setMode('reset')}>Forgot password</button>
      </div></div></main>
}

function Setup({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState(''); const [loc, setLoc] = useState(''); const [cat, setCat] = useState('Retail shop'); const [err, setErr] = useState('')
  async function save() {
    const { data, error } = await supabase.rpc('create_business', { p_name: name, p_location: loc, p_category: cat })
    if (error) setErr(error.message); else onDone(data as string)
  }
  return <main><h1>Set up your business</h1><div className="card">
    <label>Business name<input value={name} onChange={e => setName(e.target.value)} /></label>
    <label>Location<input value={loc} onChange={e => setLoc(e.target.value)} placeholder="e.g. Nakuru" /></label>
    <label>Type of business<select value={cat} onChange={e => setCat(e.target.value)}>{['Retail shop', 'Cosmetics', 'Mini-market', 'Hardware', 'Other'].map(c => <option key={c}>{c}</option>)}</select></label>
    {err && <div className="err" role="alert">{err}</div>}
    <button onClick={save} style={{ width: '100%', marginTop: 12 }}>Create business</button></div></main>
}

function Products({ biz, products, reload }: { biz: string; products: Product[]; reload: () => void }) {
  const [f, setF] = useState({ name: '', sku: '', cost: '', price: '', qty: '0', min: '0' }); const [err, setErr] = useState('')
  async function add() {
    setErr('')
    const cost = toMinor(f.cost), price = toMinor(f.price), qty = Number(f.qty), min = Number(f.min)
    if (f.name.trim().length < 2) return setErr('Enter the product name.')
    if (cost === null || price === null) return setErr('Enter cost and price as numbers, e.g. 150 or 150.50.')
    if (!Number.isInteger(qty) || qty < 0 || !Number.isInteger(min) || min < 0) return setErr('Quantities must be whole numbers, 0 or more.')
    const { data, error } = await supabase.from('products').insert({ business_id: biz, name: f.name.trim(), sku: f.sku.trim() || null, cost_minor: cost, price_minor: price, min_stock: min }).select('id').single()
    if (error) return setErr(error.message.includes('duplicate') ? 'That SKU is already used.' : error.message)
    if (qty > 0) { const r = await supabase.rpc('adjust_stock', { p_business: biz, p_product: data.id, p_kind: 'opening', p_qty_change: qty, p_reason: 'Opening stock' }); if (r.error) return setErr(r.error.message) }
    setF({ name: '', sku: '', cost: '', price: '', qty: '0', min: '0' }); reload()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return <>
    <div className="card"><h2 style={{ marginTop: 0 }}>Add a product</h2>
      <input placeholder="Product name" value={f.name} onChange={set('name')} aria-label="Product name" />
      <div className="row" style={{ marginTop: 8 }}><input placeholder="SKU (optional)" value={f.sku} onChange={set('sku')} aria-label="SKU" /><input inputMode="decimal" placeholder="Buying price" value={f.cost} onChange={set('cost')} aria-label="Buying price" /><input inputMode="decimal" placeholder="Selling price" value={f.price} onChange={set('price')} aria-label="Selling price" /></div>
      <div className="row" style={{ marginTop: 8 }}><input inputMode="numeric" placeholder="Stock now" value={f.qty} onChange={set('qty')} aria-label="Opening stock" /><input inputMode="numeric" placeholder="Warn me below" value={f.min} onChange={set('min')} aria-label="Low-stock level" /></div>
      {err && <div className="err" role="alert">{err}</div>}
      <button onClick={add} style={{ width: '100%', marginTop: 12 }}>Save product</button></div>
    {products.length === 0 ? <div className="empty">No products yet. Add your first product above, then you can start selling.</div>
      : products.map(p => <div className="card item" key={p.id}><div><strong>{p.name}</strong><small>{p.sku ?? 'No SKU'} · Buy {fmtKes(p.cost_minor)} · Sell {fmtKes(p.price_minor)}</small></div>
        <div className={p.stock_qty <= p.min_stock ? 'low' : ''}>{p.stock_qty} left{p.stock_qty <= p.min_stock && <small className="low">Low stock</small>}</div></div>)}
  </>
}

function Sell({ biz, products, reload }: { biz: string; products: Product[]; reload: () => void }) {
  const [q, setQ] = useState(''); const [cart, setCart] = useState<Record<string, number>>({})
  const [method, setMethod] = useState('cash'); const [discount, setDiscount] = useState(''); const [paid, setPaid] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([]); const [cust, setCust] = useState(''); const [newCust, setNewCust] = useState('')
  const [due, setDue] = useState('')
  const [msgs, setMsgs] = useState<{ err?: string; ok?: string }>({}); const [busy, setBusy] = useState(false)
  const txn = useRef(crypto.randomUUID())
  useEffect(() => { supabase.from('customers').select('id,name').eq('business_id', biz).order('name').then(r => setCustomers((r.data as Customer[]) ?? [])) }, [biz])
  const lines = useMemo(() => products.filter(p => cart[p.id]).map(p => ({ p, qty: cart[p.id] })), [products, cart])
  const subtotal = lines.reduce((s, l) => s + l.p.price_minor * l.qty, 0)
  const disc = discount ? toMinor(discount) : 0
  const total = Math.max(subtotal - (disc ?? 0), 0)
  const paidMinor = method === 'credit' ? 0 : paid === '' ? total : toMinor(paid)
  const shown = products.filter(p => (p.name + (p.sku ?? '')).toLowerCase().includes(q.toLowerCase()))
  const change = (id: string, d: number, max: number) => setCart(c => { const n = Math.min(Math.max((c[id] ?? 0) + d, 0), max); const { [id]: _, ...rest } = c; return n ? { ...rest, [id]: n } : rest })

  async function complete() {
    setMsgs({})
    if (!lines.length) return setMsgs({ err: 'Tap a product to add it to the sale.' })
    if (disc === null) return setMsgs({ err: 'Discount must be a number, e.g. 50.' })
    if (disc > subtotal) return setMsgs({ err: 'Discount cannot be more than the sale amount.' })
    if (paidMinor === null) return setMsgs({ err: 'Amount paid must be a number.' })
    if (paidMinor > total) return setMsgs({ err: 'Amount paid is more than the total.' })
    let customerId: string | null = cust || null
    setBusy(true)
    try {
      if (paidMinor < total) {
        if (!customerId && newCust.trim()) {
          if (!navigator.onLine) { setBusy(false); return setMsgs({ err: 'You are offline. Choose an existing customer, or add the new customer when you are back online.' }) }
          const r = await supabase.from('customers').insert({ business_id: biz, name: newCust.trim() }).select('id').single()
          if (r.error) throw r.error; customerId = r.data.id
        }
        if (!customerId) { setBusy(false); return setMsgs({ err: 'Choose or add a customer. The unpaid balance will be recorded as their debt.' }) }
      }
      const payments = paidMinor > 0 ? [{ method: method === 'credit' ? 'cash' : method, amount_minor: paidMinor }] : []
      const args = { p_business: biz, p_client_txn: txn.current, p_customer: customerId, p_items: lines.map(l => ({ product_id: l.p.id, qty: l.qty })), p_discount_minor: disc ?? 0, p_payments: payments, p_due_date: paidMinor < total ? (due || null) : null }
      const queueIt = () => { enqueue({ id: txn.current, biz, args, total, at: new Date().toISOString(), status: 'pending' }); txn.current = crypto.randomUUID(); setCart({}); setDiscount(''); setPaid(''); setCust(''); setNewCust(''); setDue(''); setMethod('cash'); setMsgs({ ok: 'No connection. Sale saved on this phone and will upload automatically. It is not in your reports or stock until then.' }); setBusy(false) }
      if (!navigator.onLine) return queueIt()
      const { data, error } = await supabase.rpc('record_sale', args)
      if (error && isNetworkError(error)) return queueIt()
      if (error) throw error
      const { data: s } = await supabase.from('sales').select('receipt_no').eq('id', data as string).single()
      txn.current = crypto.randomUUID()
      setCart({}); setDiscount(''); setPaid(''); setCust(''); setNewCust(''); setDue(''); setMethod('cash'); reload()
      setMsgs({ ok: `Sale saved. Receipt ${s?.receipt_no ?? ''}` })
    } catch (e) { setMsgs({ err: msg(e) + ' Nothing was saved. Check your connection and try again.' }) }
    setBusy(false)
  }
  return <>
    <input placeholder="Search product or SKU" value={q} onChange={e => setQ(e.target.value)} aria-label="Search products" />
    {products.length === 0 && <div className="empty">Add products first (Products tab), then come back to sell.</div>}
    <div style={{ marginTop: 8 }}>{shown.map(p => <div className="card item" key={p.id}>
      <div><strong>{p.name}</strong><small>{fmtKes(p.price_minor)} · {p.stock_qty - pendingQty(biz, p.id)} in stock</small></div>
      <div className="qty">{cart[p.id] ? <><button aria-label={`Remove one ${p.name}`} onClick={() => change(p.id, -1, p.stock_qty)}>−</button><span>{cart[p.id]}</span></> : null}
        <button aria-label={`Add ${p.name}`} disabled={p.stock_qty - pendingQty(biz, p.id) <= 0 || (cart[p.id] ?? 0) >= p.stock_qty - pendingQty(biz, p.id)} onClick={() => change(p.id, 1, p.stock_qty - pendingQty(biz, p.id))}>{cart[p.id] ? '+' : 'Add'}</button></div></div>)}</div>
    <div className="checkout"><div>
      {msgs.err && <div className="err" role="alert">{msgs.err}</div>}{msgs.ok && <div className="ok" role="status">{msgs.ok}</div>}
      <div className="total">{fmtKes(total)}</div>
      <div className="row"><select value={method} onChange={e => setMethod(e.target.value)} aria-label="Payment method"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="credit">Credit (pay later)</option></select>
        <input inputMode="decimal" placeholder="Discount" value={discount} onChange={e => setDiscount(e.target.value)} aria-label="Discount" /></div>
      {method !== 'credit' && <input style={{ marginTop: 6 }} inputMode="decimal" placeholder={`Amount paid (full: ${fmtKes(total)})`} value={paid} onChange={e => setPaid(e.target.value)} aria-label="Amount paid" />}
      {(method === 'credit' || (paidMinor !== null && paidMinor < total)) && <div className="row" style={{ marginTop: 6 }}>
        <select value={cust} onChange={e => setCust(e.target.value)} aria-label="Customer"><option value="">Choose customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input placeholder="Or new customer name" value={newCust} onChange={e => setNewCust(e.target.value)} aria-label="New customer name" /></div>}
      {(method === 'credit' || (paidMinor !== null && paidMinor < total)) && <label style={{ display: 'block', marginTop: 6 }}>Customer promises to pay by<input type="date" value={due} min={new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)} onChange={e => setDue(e.target.value)} /></label>}
      <button onClick={complete} disabled={busy || lines.length === 0}>{busy ? 'Saving…' : 'Complete sale'}</button></div></div>
  </>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false)
  const [biz, setBiz] = useState<string | null>(null); const [role, setRole] = useState('owner'); const [tab, setTab] = useState<'home' | 'sell' | 'sales' | 'products' | 'expenses' | 'customers' | 'reports' | 'buying' | 'team'>('home'); const [products, setProducts] = useState<Product[]>([])
  useEffect(() => { supabase.auth.getSession().then(r => { setSession(r.data.session); setReady(true) }); const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s)); return () => data.subscription.unsubscribe() }, [])
  useEffect(() => { if (!session) { setBiz(null); return } const ck = 'biashara:ctx:' + session.user.id; supabase.from('memberships').select('business_id,role').eq('user_id', session.user.id).limit(1).then(r => { if (r.error) { try { const c = JSON.parse(localStorage.getItem(ck) || 'null'); if (c) { setBiz(c.b); setRole(c.r); if (c.r === 'cashier') setTab('sell') } } catch { /* ignore */ } return } localStorage.setItem(ck, JSON.stringify({ b: r.data?.[0]?.business_id ?? '', r: r.data?.[0]?.role ?? 'cashier' })); setBiz(r.data?.[0]?.business_id ?? ''); const rl = r.data?.[0]?.role ?? 'cashier'; setRole(rl); if (rl === 'cashier') setTab('sell') }) }, [session])
  const reload = () => { if (biz) supabase.from('products').select('*').eq('business_id', biz).eq('active', true).order('name').then(r => { const k = 'biashara:products:' + biz; if (r.error) { try { setProducts(JSON.parse(localStorage.getItem(k) || '[]')) } catch { /* ignore */ } } else { localStorage.setItem(k, JSON.stringify(r.data)); setProducts((r.data as Product[]) ?? []) } }) }
  useEffect(reload, [biz])
  if (!configured) return <main><h1>Almost ready</h1><div className="err">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart.</div></main>
  if (!ready) return <main><p>Loading…</p></main>
  if (!session) return <Auth />
  if (biz === null) return <main><p>Loading your business…</p></main>
  if (biz === '') return <Setup onDone={setBiz} />
  return <main><div className="row" style={{ marginBottom: 8 }}><h1 style={{ margin: 0 }}>Smart Biashara</h1><button className="ghost fit" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
    <SyncBanner biz={biz} onSynced={reload} />
    <nav style={{ overflowX: 'auto' }}>{([['home', 'Home'], ['sell', 'Sell'], ['sales', 'Receipts'], ['products', 'Products'], ['expenses', 'Expenses'], ['customers', 'Debts'], ['buying', 'Stock in'], ['reports', 'Reports'], ['team', 'Team']] as const).filter(([k]) => role !== 'cashier' || ['sell', 'sales', 'customers'].includes(k)).filter(([k]) => k !== 'team' || role === 'owner').map(([k, l]) => <button key={k} aria-current={tab === k} onClick={() => setTab(k)}>{l}</button>)}</nav>
    {tab === 'home' ? <Dashboard biz={biz} products={products} /> : tab === 'sell' ? <Sell biz={biz} products={products} reload={reload} /> : tab === 'sales' ? <Sales biz={biz} onChange={reload} /> : tab === 'team' ? <Team biz={biz} /> : tab === 'buying' ? <Buying biz={biz} products={products} reload={reload} /> : tab === 'reports' ? <Reports biz={biz} /> : tab === 'products' ? <Products biz={biz} products={products} reload={reload} /> : tab === 'expenses' ? <Expenses biz={biz} /> : <Customers biz={biz} />}
  </main>
}
