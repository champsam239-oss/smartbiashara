import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes } from './lib/money'
import { list, flush, discard, subscribe, type Pending } from './lib/queue'

export default function SyncBanner({ biz, onSynced }: { biz: string; onSynced: () => void }) {
  const [items, setItems] = useState<Pending[]>(() => list(biz)); const [note, setNote] = useState('')
  const upload = async () => {
    const r = await flush(p => supabase.rpc('record_sale', p.args) as unknown as Promise<{ error?: { code?: string; message?: string } | null }>)
    if (r.sent) { setNote(`${r.sent} sale${r.sent > 1 ? 's' : ''} uploaded.`); onSynced() }
  }
  useEffect(() => { const u = subscribe(() => setItems(list(biz))); setItems(list(biz)); upload(); const t = setInterval(upload, 60000); window.addEventListener('online', upload); return () => { u(); clearInterval(t); window.removeEventListener('online', upload) } }, [biz])
  const wait = items.filter(i => i.status === 'pending'), bad = items.filter(i => i.status === 'rejected')
  if (!items.length && !note) return null
  return <div style={{ marginBottom: 8 }}>
    {note && !wait.length && <div className="ok" role="status">{note}</div>}
    {wait.length > 0 && <div className="err" role="status" style={{ background: '#fff4d6', color: '#6b4e00' }}>{wait.length} sale{wait.length > 1 ? 's' : ''} saved on this phone, not uploaded yet ({fmtKes(wait.reduce((s, w) => s + w.total, 0))}). They are not in your reports or stock until they upload. <button className="ghost" style={{ minHeight: 36, marginLeft: 8 }} onClick={upload}>Upload now</button></div>}
    {bad.map(b => <div className="err" role="alert" key={b.id}>A saved sale of {fmtKes(b.total)} was refused: {b.error}. Fix the stock or record it again by hand. <button className="ghost" style={{ minHeight: 36 }} onClick={() => discard(b.id)}>Dismiss</button></div>)}
  </div>
}
