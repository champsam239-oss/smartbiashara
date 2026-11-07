-- Apply after reviewing the expected owner/manager access below.
-- This patch is based on the current deployed schema and does not alter data.
begin;

-- These views intentionally use the view owner's column privileges because
-- SELECT on products.cost_minor and sale_items.unit_cost_minor is revoked from
-- authenticated users. Their definitions filter to owners. Keep the barrier
-- and grant the views only to signed-in users; do not switch them to invoker
-- security without redesigning the column grants.
alter view public.products_owner set (security_barrier = true);
alter view public.sale_items_owner set (security_barrier = true);
revoke all on public.products_owner, public.sale_items_owner from public, anon, authenticated;
grant select on public.products_owner, public.sale_items_owner to authenticated;

-- Aggregate profit data uses restricted sale-item cost columns. Run it as the
-- function owner only after checking that the caller is an owner or manager.
create or replace function public.profit_report(
  p_business uuid,
  p_from timestamp with time zone,
  p_to timestamp with time zone
)
returns table(
  net_sales_minor bigint,
  cogs_minor bigint,
  gross_profit_minor bigint,
  expenses_minor bigint,
  net_profit_minor bigint,
  cash_collected_minor bigint,
  unpaid_credit_minor bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.memberships m
    where m.business_id = p_business
      and m.user_id = auth.uid()
      and lower(m.role) in ('owner', 'manager')
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  with s as (
    select id, total_minor
    from public.sales
    where business_id = p_business
      and status = 'completed'
      and created_at >= p_from
      and created_at < p_to
  ),
  c as (
    select coalesce(sum(si.qty * si.unit_cost_minor), 0)::bigint as value
    from public.sale_items si join s on s.id = si.sale_id
  ),
  e as (
    select coalesce(sum(amount_minor), 0)::bigint as value
    from public.expenses
    where business_id = p_business
      and reversed_at is null
      and incurred_on >= (p_from at time zone 'Africa/Nairobi')::date
      and incurred_on < (p_to at time zone 'Africa/Nairobi')::date
  ),
  pc as (
    select coalesce(sum(amount_minor), 0)::bigint as value
    from public.payments
    where business_id = p_business
      and reversed_at is null
      and received_at >= p_from
      and received_at < p_to
  ),
  ns as (
    select coalesce(sum(total_minor), 0)::bigint as value from s
  )
  select ns.value,
         c.value,
         ns.value - c.value,
         e.value,
         ns.value - c.value - e.value,
         pc.value,
         greatest(
           ns.value - coalesce((
             select sum(a.amount_minor)
             from public.payment_allocations a
             join public.payments p on p.id = a.payment_id
             where a.sale_id in (select id from s)
               and p.reversed_at is null
           ), 0)::bigint,
           0
         )
  from ns, c, e, pc;
end
$function$;

revoke all on function public.profit_report(uuid, timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.profit_report(uuid, timestamp with time zone, timestamp with time zone) to authenticated;

-- Fix mutable search paths on public security-definer functions, plus the five
-- functions identified by the Supabase advisor.
do $$
declare
  function_row record;
begin
  for function_row in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosecdef or p.proname = any (array[
        'block_mutation',
        'sb_protect_last_owner',
        'sb_has_business_id',
        'sb_grant_staff',
        'sb_make_staff_view'
      ]))
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, pg_temp',
      function_row.signature
    );
  end loop;
end
$$;

commit;
