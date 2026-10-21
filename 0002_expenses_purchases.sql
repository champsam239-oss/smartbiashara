-- Expenses and purchases. Stock purchases are NOT expenses (avoids double-counting COGS).
create function record_expense(p_business uuid, p_category text, p_amount bigint, p_method text, p_on date, p_desc text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  if not is_member(p_business, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if p_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  insert into expenses (business_id, category, amount_minor, method, incurred_on, description, created_by)
    values (p_business, p_category, p_amount, p_method, p_on, p_desc, auth.uid()) returning id into e;
  insert into audit_logs (business_id, actor, action, entity, entity_id, detail)
    values (p_business, auth.uid(), 'expense.create', 'expenses', e, jsonb_build_object('amount_minor', p_amount));
  return e;
end $$;

create function reverse_expense(p_business uuid, p_expense uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_business, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'Please give a reason'; end if;
  update expenses set reversed_at = now(), reversal_reason = p_reason
    where id = p_expense and business_id = p_business and reversed_at is null;
  if not found then raise exception 'Expense not found or already reversed'; end if;
  insert into audit_logs (business_id, actor, action, entity, entity_id, detail)
    values (p_business, auth.uid(), 'expense.reverse', 'expenses', p_expense, jsonb_build_object('reason', p_reason));
end $$;

-- p_items: [{"product_id":..,"qty":10,"unit_cost_minor":5000}]
create function record_purchase(p_business uuid, p_supplier uuid, p_invoice text, p_paid bigint, p_on date, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare pu uuid; it jsonb; tot bigint := 0;
begin
  if not is_member(p_business, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if jsonb_array_length(coalesce(p_items,'[]')) = 0 then raise exception 'Add at least one item'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    tot := tot + (it->>'qty')::int * (it->>'unit_cost_minor')::bigint;
  end loop;
  if p_paid < 0 or p_paid > tot then raise exception 'Amount paid must be between 0 and the invoice total'; end if;
  insert into purchases (business_id, supplier_id, invoice_no, total_minor, paid_minor, purchased_on)
    values (p_business, p_supplier, p_invoice, tot, p_paid, p_on) returning id into pu;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into purchase_items (purchase_id, business_id, product_id, qty, unit_cost_minor)
      values (pu, p_business, (it->>'product_id')::uuid, (it->>'qty')::int, (it->>'unit_cost_minor')::bigint);
    update products set stock_qty = stock_qty + (it->>'qty')::int, cost_minor = (it->>'unit_cost_minor')::bigint
      where id = (it->>'product_id')::uuid and business_id = p_business;
    if not found then raise exception 'Product not found'; end if;
    insert into inventory_movements (business_id, product_id, kind, qty_change, reason, created_by)
      values (p_business, (it->>'product_id')::uuid, 'received', (it->>'qty')::int, 'Purchase ' || coalesce(p_invoice,pu::text), auth.uid());
  end loop;
  insert into audit_logs (business_id, actor, action, entity, entity_id, detail)
    values (p_business, auth.uid(), 'purchase.create', 'purchases', pu, jsonb_build_object('total_minor', tot));
  return pu;
end $$;
grant execute on function record_expense, reverse_expense, record_purchase to authenticated;
