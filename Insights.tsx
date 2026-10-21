import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { insights, marginPct } from './lib/insights'
import { nairobiToday, addDays, nairobiStart } from './lib/dates'

export default function Insights({ biz, lowStock }: { biz: string; lowStock: number }) {
  const [lines, setLines] = useState<string[] | null>(null)
  useEffect(() => {
    const t = nairobiToday(), rep = (a: string, b: string) => supabase.rpc('profit_report', { p_business: biz, p_from: nairobiStart(a), p_to: nairobiStart(addDays(b, 1)) })
    Promise.all([rep(addDays(t, -6), t), rep(addDays(t, -13), addDays(t, -7)), supabase.rpc('customer_balances', { p_business: biz }),
      supabase.from('sale_items').select('product_id,qty,unit_price_minor,unit_cost_minor,products(name),sales!inner(status,created_at)').eq('business_id', biz).eq('sales.status', 'completed').gte('sales.created_at', nairobiStart(addDays(t, -29)))])
      .then(([a, b, c, d]) => {
        const n = (a.data as { net_sales_minor: number; expenses_minor: number }[])?.[0], p = (b.data as { net_sales_minor: number; expenses_minor: number }[])?.[0]
        if (!n || !p) return setLines([])
        const od = ((c.data ?? []) as { overdue_minor: number }[]).filter(x => x.overdue_minor > 0)
        const m: Record<string, { name: string; units: number; rev: number; cost: number }> = {}
        for (const i of (d.data ?? []) as unknown as { product_id: string; qty: number; unit_price_minor: number; unit_cost_minor: number; products: { name: string } | null }[]) {
          const x = m[i.product_id] ??= { name: i.products?.name ?? 'A product', units: 0, rev: 0, cost: 0 }; x.units += i.qty; x.rev += i.qty * i.unit_price_minor; x.cost += i.qty * i.unit_cost_minor
        }
        const lowMargin = Object.values(m).filter(x => x.units >= 5 && marginPct(x.rev, x.cost) < 15).map(x => ({ name: x.name, units: x.units, marginPct: marginPct(x.rev, x.cost) })).sort((a, b) => b.units - a.units)
        setLines(insights({ salesNow: n.net_sales_minor, salesPrev: p.net_sales_minor, expNow: n.expenses_minor, expPrev: p.expenses_minor, lowStock, overdueCustomers: od.length, overdueTotal: od.reduce((s, x) => s + x.overdue_minor, 0), lowMargin }))
      }).catch(() => setLines([]))
  }, [biz, lowStock])
  if (!lines || lines.length === 0) return null
  return <><h2>What your records show</h2><div className="card">{lines.map(l => <p key={l} style={{ margin: '6px 0' }}>{l}</p>)}<small>Worked out from your recorded sales, expenses and stock. These are observations, not predictions.</small></div></>
}
