// Owner-only staff management. The privileged key is used on the server only.
// Deploy with: supabase functions deploy team
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const ROLES = ['manager', 'cashier']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey) return json({ error: 'Staff service is not configured.' }, 503)

    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Please sign in again.' }, 401)
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Please sign in again.' }, 401)

    const body = await req.json()
    const businessId = String(body.business_id ?? '')
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(businessId)) return json({ error: 'Choose a valid business.' }, 400)

    const admin = createClient(url, serviceKey)
    const { data: owner, error: ownerError } = await admin.from('memberships').select('role').eq('business_id', businessId).eq('user_id', userData.user.id).maybeSingle()
    if (ownerError) return json({ error: 'Could not verify your owner access.' }, 500)
    if (owner?.role?.toLowerCase() !== 'owner') return json({ error: 'Only the business owner can manage staff.' }, 403)

    if (body.action === 'list') {
      const { data: members, error } = await admin.from('memberships').select('user_id,role').eq('business_id', businessId)
      if (error) return json({ error: 'Could not load staff.' }, 500)
      const result = await Promise.all((members ?? []).map(async (member) => {
        const { data, error: lookupError } = await admin.auth.admin.getUserById(member.user_id)
        if (lookupError) throw lookupError
        return { user_id: member.user_id, role: member.role, email: data.user?.email ?? '' }
      }))
      return json({ members: result })
    }

    if (body.action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
      if (!ROLES.includes(body.role)) return json({ error: 'Choose manager or cashier.' }, 400)

      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email)
      let userId = invitation.user?.id
      if (!userId && inviteError) {
        const { data: page, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
        if (listError) return json({ error: 'Could not invite that email. Try again later.' }, 400)
        userId = page.users.find((user) => user.email?.toLowerCase() === email)?.id
      }
      if (!userId) return json({ error: 'Could not invite that email. Try again later.' }, 400)

      const { error } = await admin.from('memberships').upsert({ business_id: businessId, user_id: userId, role: body.role })
      if (error) return json({ error: 'Could not add this person.' }, 400)
      const { error: auditError } = await admin.from('audit_logs').insert({ business_id: businessId, actor: userData.user.id, action: 'team.invite', entity: 'memberships', entity_id: userId, detail: { role: body.role } })
      if (auditError) return json({ error: 'The staff member was added, but the audit record could not be saved.' }, 500)
      return json({ ok: true })
    }

    if (body.action === 'set_role' || body.action === 'remove') {
      const target = String(body.user_id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(target)) return json({ error: 'Choose a valid staff member.' }, 400)
      const { data: member, error } = await admin.from('memberships').select('role').eq('business_id', businessId).eq('user_id', target).maybeSingle()
      if (error) return json({ error: 'Could not verify this staff member.' }, 500)
      if (!member) return json({ error: 'Person not found.' }, 404)
      if (member.role.toLowerCase() === 'owner') return json({ error: 'The owner cannot be changed or removed.' }, 400)

      if (body.action === 'set_role') {
        if (!ROLES.includes(body.role)) return json({ error: 'Choose manager or cashier.' }, 400)
        const { error: updateError } = await admin.from('memberships').update({ role: body.role }).eq('business_id', businessId).eq('user_id', target)
        if (updateError) return json({ error: 'Could not update this person's role.' }, 400)
      } else {
        const { error: deleteError } = await admin.from('memberships').delete().eq('business_id', businessId).eq('user_id', target)
        if (deleteError) return json({ error: 'Could not remove this person.' }, 400)
      }

      const { error: auditError } = await admin.from('audit_logs').insert({ business_id: businessId, actor: userData.user.id, action: `team.${body.action}`, entity: 'memberships', entity_id: target, detail: { role: body.role ?? null } })
      if (auditError) return json({ error: 'The staff change succeeded, but the audit record could not be saved.' }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch {
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
