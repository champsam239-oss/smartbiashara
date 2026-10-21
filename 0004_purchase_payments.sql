-- Pay down a supplier invoice. Bounded by the invoice total; audited.
create function pay_purchase(p_business uuid, p_purchase uuid, p_amount bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_business, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if p_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  update purchases set paid_minor = paid_minor + p_amount
    where id = p_purchase and business_id = p_business and paid_minor + p_amount <= total_minor;
  if not found then raise exception 'Invoice not found, or the payment is more than the unpaid balance'; end if;
  insert into audit_logs (business_id, actor, action, entity, entity_id, detail)
    values (p_business, auth.uid(), 'purchase.pay', 'purchases', p_purchase, jsonb_build_object('amount_minor', p_amount));
end $$;
grant execute on function pay_purchase to authenticated;
