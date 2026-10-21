-- Smart Biashara Manager: core schema (Phase 1 foundation)
-- Money = bigint cents (KES x 100). Quantities = numeric(12,3). Timestamps = timestamptz (UTC; show in Africa/Nairobi in the UI).

create extension if not exists pgcrypto;

-- ===== Tenancy =====
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  location text,
  category text,
  currency text not null default 'KES',
  timezone text not null default 'Africa/Nairobi',
  next_receipt_no bigint not null default 1,
  created_at timestamptz not null default now()
);

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','employee')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on business_members (user_id);

create function is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = b and user_id = auth.uid());
$$;

create function is_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = b and user_id = auth.uid() and role = 'owner');
$$;

-- Creates a business and makes the caller its owner (atomic).
create function create_business(p_name text, p_location text, p_category text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Business name is required.'; end if;
  insert into businesses(name, location, category) values (trim(p_name), p_location, p_category) returning id into b;
  insert into business_members(business_id, user_id, role) values (b, auth.uid(), 'owner');
  return b;
end $$;

-- ===== Catalogue =====
create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  unique (business_id, name)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  sku text,
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  price_cents bigint not null check (price_cents >= 0),
  quantity_on_hand numeric(12,3) not null default 0 check (quantity_on_hand >= 0), -- maintained only by trigger
  min_stock numeric(12,3) not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, sku)
);
create index on products (business_id, name);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null, phone text, notes text,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null, phone text,
  created_at timestamptz not null default now()
);

-- ===== Sales =====
create table sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  receipt_no bigint not null,
  client_txn_id uuid not null,                       -- idempotency key (duplicate-submit / offline sync safe)
  customer_id uuid references customers(id),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0 and total_cents = subtotal_cents - discount_cents),
  due_date date,
  status text not null default 'completed' check (status in ('completed','reversed')),
  reversed_at timestamptz, reversal_reason text,
  sold_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (business_id, receipt_no),
  unique (business_id, client_txn_id)
);
create index on sales (business_id, sold_at desc);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),  -- snapshot
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),    -- snapshot for COGS
  line_total_cents bigint not null check (line_total_cents >= 0)
);
create index on sale_items (sale_id);

-- ===== Payments (separate from sales) =====
create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id),
  method text not null check (method in ('cash','mpesa','bank')),
  amount_cents bigint not null check (amount_cents > 0),
  reference text,                                    -- e.g. M-Pesa code, entered manually in MVP
  received_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  voided boolean not null default false
);
create unique index payments_ref_uniq on payments (business_id, method, reference) where reference is not null;

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete cascade,
  sale_id uuid not null references sales(id),
  amount_cents bigint not null check (amount_cents > 0)
);
create index on payment_allocations (sale_id);

-- ===== Inventory ledger (append-only) =====
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id),
  kind text not null check (kind in ('opening','received','sold','damaged','returned','adjustment','sale_reversal')),
  quantity_delta numeric(12,3) not null check (quantity_delta <> 0),
  reason text not null check (length(trim(reason)) > 0),
  sale_id uuid references sales(id),
  purchase_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on inventory_movements (business_id, product_id, created_at desc);

create function apply_movement() returns trigger language plpgsql as $$
begin
  update products set quantity_on_hand = quantity_on_hand + new.quantity_delta
   where id = new.product_id and business_id = new.business_id;   -- CHECK >= 0 aborts the whole transaction
  if not found then raise exception 'Product not found for this business.'; end if;
  return new;
end $$;
create trigger trg_apply_movement after insert on inventory_movements
  for each row execute function apply_movement();

create function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'This ledger is append-only. Record a reversal or adjustment instead.'; end $$;
create trigger trg_movements_immutable before update or delete on inventory_movements
  for each row execute function forbid_change();

-- ===== Expenses (operating costs only; stock buying goes through purchases) =====
create table expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category text not null,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('cash','mpesa','bank')),
  description text,
  expense_date date not null,
  voided boolean not null default false, void_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on expenses (business_id, expense_date);

-- ===== Purchases =====
create table purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  invoice_no text,
  total_cents bigint not null check (total_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0 and paid_cents <= total_cents),
  purchased_at timestamptz not null default now()
);
create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0)
);

-- ===== Customer ledger & audit =====
create table customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id),
  sale_id uuid references sales(id),
  payment_id uuid references payments(id),
  amount_cents bigint not null check (amount_cents <> 0),   -- + owes more, - paid / reversed
  note text,
  created_at timestamptz not null default now()
);
create index on customer_ledger_entries (business_id, customer_id);

create table audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ===== Atomic sale =====
-- items:    [{"product_id": "...", "quantity": 2, "discount_cents": 0?}]  (price/cost are read server-side, never trusted from client)
-- payments: [{"method": "cash|mpesa|bank", "amount_cents": 50000, "reference": "ABC123"?}]
-- Anything unpaid becomes customer credit (requires p_customer).
create function create_sale(p_business uuid, p_client_txn uuid, p_customer uuid,
                            p_items jsonb, p_discount_cents bigint, p_payments jsonb, p_due date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s uuid; rno bigint; it jsonb; pr products%rowtype; pay jsonb; pid uuid;
  sub bigint := 0; line bigint; qty numeric; paid bigint := 0; total bigint;
begin
  if not is_member(p_business) then raise exception 'You do not have access to this business.'; end if;

  select id into s from sales where business_id = p_business and client_txn_id = p_client_txn;
  if found then return s; end if;                                   -- duplicate submit: return original

  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Add at least one product.'; end if;
  if coalesce(p_discount_cents,0) < 0 then raise exception 'Discount cannot be negative.'; end if;
  if p_customer is not null and not exists (select 1 from customers where id = p_customer and business_id = p_business)
    then raise exception 'Customer not found.'; end if;

  update businesses set next_receipt_no = next_receipt_no + 1 where id = p_business returning next_receipt_no - 1 into rno;

  insert into sales(business_id, receipt_no, client_txn_id, customer_id, subtotal_cents, discount_cents, total_cents, due_date, created_by)
  values (p_business, rno, p_client_txn, p_customer, 0, 0, 0, p_due, auth.uid()) returning id into s;

  for it in select * from jsonb_array_elements(p_items) loop
    qty := (it->>'quantity')::numeric;
    if qty is null or qty <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and business_id = p_business and active for update;
    if not found then raise exception 'A selected product was not found.'; end if;
    if pr.quantity_on_hand < qty then raise exception 'Not enough stock for %. Available: %.', pr.name, pr.quantity_on_hand; end if;
    line := round(pr.price_cents * qty) - coalesce((it->>'discount_cents')::bigint, 0);
    if line < 0 then raise exception 'Discount on % is larger than the price.', pr.name; end if;
    insert into sale_items(sale_id, business_id, product_id, quantity, unit_price_cents, unit_cost_cents, line_total_cents)
      values (s, p_business, pr.id, qty, pr.price_cents, pr.cost_cents, line);
    insert into inventory_movements(business_id, product_id, kind, quantity_delta, reason, sale_id, created_by)
      values (p_business, pr.id, 'sold', -qty, 'Sale receipt #' || rno, s, auth.uid());
    sub := sub + line;
  end loop;

  if p_discount_cents > sub then raise exception 'Discount cannot exceed the sale amount.'; end if;
  total := sub - coalesce(p_discount_cents,0);
  update sales set subtotal_cents = sub, discount_cents = coalesce(p_discount_cents,0), total_cents = total where id = s;

  for pay in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    if (pay->>'amount_cents')::bigint <= 0 then raise exception 'Payment must be greater than zero.'; end if;
    insert into payments(business_id, customer_id, method, amount_cents, reference, created_by)
      values (p_business, p_customer, pay->>'method', (pay->>'amount_cents')::bigint, nullif(pay->>'reference',''), auth.uid())
      returning id into pid;
    insert into payment_allocations(business_id, payment_id, sale_id, amount_cents)
      values (p_business, pid, s, (pay->>'amount_cents')::bigint);
    paid := paid + (pay->>'amount_cents')::bigint;
  end loop;

  if paid > total then raise exception 'Payment is more than the sale total.'; end if;
  if paid < total then
    if p_customer is null then raise exception 'Choose a customer to sell on credit.'; end if;
    insert into customer_ledger_entries(business_id, customer_id, sale_id, amount_cents, note)
      values (p_business, p_customer, s, total - paid, 'Credit balance, receipt #' || rno);
  end if;

  insert into audit_logs(business_id, actor, action, entity, entity_id, detail)
    values (p_business, auth.uid(), 'sale.create', 'sale', s, jsonb_build_object('receipt_no', rno, 'total_cents', total, 'paid_cents', paid));
  return s;
end $$;

-- ===== Row Level Security =====
do $$
declare t text;
begin
  foreach t in array array['businesses','business_members','categories','products','suppliers','customers','sales','sale_items',
    'payments','payment_allocations','inventory_movements','expenses','purchases','purchase_items','customer_ledger_entries','audit_logs']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy businesses_read on businesses for select using (is_member(id));
create policy businesses_update on businesses for update using (is_owner(id));
create policy members_read on business_members for select using (is_member(business_id));
create policy members_owner_write on business_members for all using (is_owner(business_id)) with check (is_owner(business_id));

do $$
declare t text;
begin
  -- members can read everything in their business
  foreach t in array array['categories','products','suppliers','customers','sales','sale_items','payments','payment_allocations',
    'inventory_movements','expenses','purchases','purchase_items','customer_ledger_entries','audit_logs']
  loop
    execute format('create policy %I on %I for select using (is_member(business_id))', t||'_read', t);
  end loop;
  -- simple master data: members can insert/update (no delete)
  foreach t in array array['categories','products','suppliers','customers','expenses']
  loop
    execute format('create policy %I on %I for insert with check (is_member(business_id))', t||'_ins', t);
    execute format('create policy %I on %I for update using (is_member(business_id)) with check (is_member(business_id))', t||'_upd', t);
  end loop;
end $$;
-- Sales, payments, ledger and inventory movements have NO direct write policies:
-- they change only through security-definer functions such as create_sale().
revoke execute on function create_sale(uuid,uuid,uuid,jsonb,bigint,jsonb,date) from public, anon;
grant execute on function create_sale(uuid,uuid,uuid,jsonb,bigint,jsonb,date) to authenticated;
grant execute on function create_business(text,text,text) to authenticated;
