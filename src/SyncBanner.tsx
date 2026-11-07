import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { fmtKes } from './lib/money'
import { list, flush, discard, retry, makeBackup, restoreBackup, subscribe, type Pending } from './lib/queue'

export default function SyncBanner({ biz, onSynced }: { biz: string; onSynced: () => void }) {
  const [items, setItems] = useState<Pending[]>(() => list(biz)); const [note, setNote] = useState('')
  const [backupError, setBackupError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const upload = async () => {
    const r = await flush(p => supabase.rpc('record_sale', p.args) as unknown as Promise<{ error?: { code?: string; message?: string } | null }>)
    if (r.sent) { setNote(`${r.sent} sale${r.sent > 1 ? 's' : ''} uploaded.`); onSynced() }
  }
  useEffect(() => { const u = subscribe(() => setItems(list(biz))); setItems(list(biz)); upload(); const t = setInterval(upload, 60000); window.addEventListener('online', upload); return () => { u(); clearInterval(t); window.removeEventListener('online', upload) } }, [biz])
  function saveBackup() {
    const url = URL.createObjectURL(new Blob([makeBackup(biz)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `smart-biashara-pending-sales-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
  }
  async function openBackup(file?: File) {
    if (!file) return
    setBackupError('')
    try {
      if (file.size > 5_000_000) throw new Error('Backup file is too large.')
      const count = restoreBackup(await file.text(), biz)
      setNote(count ? `${count} saved sale${count === 1 ? '' : 's'} restored. They will upload when online.` : 'No new sales were found in that backup.')
    } catch (e) {
      setBackupError((e as Error).message || 'Could not read that backup file.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }
  const wait = items.filter(i => i.status === 'pending'), bad = items.filter(i => i.status === 'rejected')
  if (!items.length && !note) return null
  return <div style={{ marginBottom: 8 }}>
    {note && !wait.length && <div className="ok" role="status">{note}</div>}
    {wait.length > 0 && <div className="err" role="status" style={{ background: '#fff4d6', color: '#6b4e00' }}>{wait.length} sale{wait.length > 1 ? 's' : ''} saved on this phone, not uploaded yet ({fmtKes(wait.reduce((s, w) => s + w.total, 0))}). They are not in your reports or stock until they upload. <button className="ghost" style={{ minHeight: 36, marginLeft: 8 }} onClick={upload}>Upload now</button></div>}
    {items.length > 0 && <div className="row backup-actions"><button className="ghost" onClick={saveBackup}>Download pending-sales backup</button><button className="ghost" onClick={() => fileInput.current?.click()}>Restore backup</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => void openBackup(e.target.files?.[0])} /></div>}
    {backupError && <div className="err" role="alert">{backupError}</div>}
    {bad.map(b => <div className="err" role="alert" key={b.id}>A saved sale of {fmtKes(b.total)} was refused: {b.error}. Check the stock or customer, then retry. <button className="ghost" style={{ minHeight: 36 }} onClick={() => retry(b.id)}>Retry</button><button className="ghost" style={{ minHeight: 36, marginLeft: 6 }} onClick={() => discard(b.id)}>Dismiss</button></div>)}
  </div>
}
