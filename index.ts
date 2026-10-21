// Edge Function: owner-only staff management. Uses the privileged key on the SERVER only.
// Deploy: supabase functions deploy team   (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided by Supabase)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const ROLES = ['manager', 'cashier']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: u } = await caller.auth.getUser()
    if (!u.user) return json({ error: 'Please sign in again.' }, 401)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()
    const biz = String(body.business_id ?? '')
    const { data: me } = await admin.from('memberships').select('role').eq('business_id', biz).eq('user_id', u.user.id).maybeSingle()
    if (me?.role !== 'owner') return json({ error: 'Only the business owner can manage staff.' }, 403)

    if (body.action === 'list') {
      const { data: rows } = await admin.from('memberships').select('user_id,role').eq('business_id', biz)
      const out = []
      for (const r of rows ?? []) { const { data } = await admin.auth.admin.getUserById(r.user_id); out.push({ user_id: r.user_id, role: r.role, email: data.user?.email ?? '' }) }
      return json({ members: out })
    }
    if (body.action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
      if (!ROLES.includes(body.role)) return json({ error: 'Choose manager or cashier.' }, 400)
      let uid: string | undefined
      const inv = await admin.auth.admin.inviteUserByEmail(email)
      if (inv.data?.user) uid = inv.data.user.id
      else {
        const { data: all } = await admin.auth.admin.listUsers({ perPage: 1000 })
        uid = all.users.find((x) => x.email?.toLowerCase() === email)?.id
      }
      if (!uid) return json({ error: 'Could not invite that email. Try again later.' }, 400)
      const { error } = await admin.from('memberships').upsert({ business_id: biz, user_id: uid, role: body.role })
      if (error) return json({ error: 'Could not add this person.' }, 400)
      await admin.from('audit_logs').insert({ business_id: biz, actor: u.user.id, action: 'team.invite', entity: 'memberships', entity_id: uid, detail: { role: body.role } })
      return json({ ok: true })
    }
    if (body.action === 'set_role' || body.action === 'remove') {
      const target = String(body.user_id ?? '')
      const { data: t } = await admin.from('memberships').select('role').eq('business_id', biz).eq('user_id', target).maybeSingle()
      if (!t) return json({ error: 'Person not found.' }, 404)
      if (t.role === 'owner') return json({ error: 'The owner cannot be changed or removed.' }, 400)
      if (body.action === 'set_role') {
        if (!ROLES.includes(body.role)) return json({ error: 'Choose manager or cashier.' }, 400)
        await admin.from('memberships').update({ role: body.role }).eq('business_id', biz).eq('user_id', target)
      } else await admin.from('memberships').delete().eq('business_id', biz).eq('user_id', target)
      await admin.from('audit_logs').insert({ business_id: biz, actor: u.user.id, action: 'team.' + body.action, entity: 'memberships', entity_id: target, detail: { role: body.role ?? null } })
      return json({ ok: true })
    }
    return json({ error: 'Unknown action.' }, 400)
  } catch (_e) {
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
