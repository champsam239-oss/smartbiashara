-- Per-customer debt: completed sales minus non-reversed payment allocations. RLS applies (security invoker).
create function customer_balances(p_business uuid)
returns table (customer_id uuid, name text, phone text, balance_minor bigint, overdue_minor bigint)
language sql stable security invoker set search_path = public as $$
  with per_sale as (
    select s.customer_id, s.due_date,
      s.total_minor - coalesce((select sum(a.amount_minor) from payment_allocations a join payments p on p.id = a.payment_id
        where a.sale_id = s.id and p.reversed_at is null), 0) as bal
    from sales s where s.business_id = p_business and s.status = 'completed' and s.customer_id is not null)
  select c.id, c.name, c.phone,
    coalesce(sum(ps.bal) filter (where ps.bal > 0), 0)::bigint,
    coalesce(sum(ps.bal) filter (where ps.bal > 0 and ps.due_date < (now() at time zone 'Africa/Nairobi')::date), 0)::bigint
  from customers c left join per_sale ps on ps.customer_id = c.id
  where c.business_id = p_business group by c.id order by 4 desc, c.name;
$$;
grant execute on function customer_balances to authenticated;
