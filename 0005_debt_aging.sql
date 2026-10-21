-- Debt aging per customer. Age counts from the due date, or the sale date when no due date was set.
create function debt_aging(p_business uuid)
returns table (customer_id uuid, name text, not_due_minor bigint, d1_30_minor bigint, d31_60_minor bigint, d60_plus_minor bigint, total_minor bigint)
language sql stable security invoker set search_path = public as $$
  with per_sale as (
    select s.customer_id,
      (now() at time zone 'Africa/Nairobi')::date - coalesce(s.due_date, (s.created_at at time zone 'Africa/Nairobi')::date) as late,
      s.total_minor - coalesce((select sum(a.amount_minor) from payment_allocations a join payments p on p.id = a.payment_id
        where a.sale_id = s.id and p.reversed_at is null), 0) as bal
    from sales s where s.business_id = p_business and s.status = 'completed' and s.customer_id is not null)
  select c.id, c.name,
    coalesce(sum(bal) filter (where late <= 0), 0)::bigint, coalesce(sum(bal) filter (where late between 1 and 30), 0)::bigint,
    coalesce(sum(bal) filter (where late between 31 and 60), 0)::bigint, coalesce(sum(bal) filter (where late > 60), 0)::bigint,
    coalesce(sum(bal), 0)::bigint
  from customers c join per_sale ps on ps.customer_id = c.id and ps.bal > 0
  where c.business_id = p_business group by c.id, c.name order by 7 desc;
$$;
grant execute on function debt_aging to authenticated;
