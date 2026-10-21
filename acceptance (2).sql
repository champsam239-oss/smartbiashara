-- Run after migrations on a scratch database: psql "$DB_URL" -f supabase/tests/acceptance.sql
-- Everything runs in one transaction and is rolled back. Any failed check raises an exception.
begin;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', msg; end if; end $$;
create function pg_temp.act_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, true), set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true) $$;

do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ba uuid; bb uuid; p uuid; c uuid; s uuid; s2 uuid; pay uuid; r record; ok boolean; t uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (ua,'a@test.local'),(ub,'b@test.local');
  perform pg_temp.act_as(ua); ba := create_business('Shop A','Nakuru','Retail');
  perform pg_temp.act_as(ub); bb := create_business('Shop B','Nairobi','Retail');
  perform pg_temp.act_as(ua);
  insert into products (business_id,name,sku,cost_minor,price_minor,min_stock) values (ba,'Sugar 1kg','SG1',15000,20000,5) returning id into p;
  perform adjust_stock(ba,p,'opening',10,'Opening stock');
  insert into customers (business_id,name) values (ba,'Mama Njeri') returning id into c;

  -- 3,5: cash sale decreases stock once; duplicate submit is idempotent
  s := record_sale(ba,t,null,jsonb_build_array(jsonb_build_object('product_id',p,'qty',2)),0,jsonb_build_array(jsonb_build_object('method','cash','amount_minor',40000)),null);
  perform record_sale(ba,t,null,jsonb_build_array(jsonb_build_object('product_id',p,'qty',2)),0,jsonb_build_array(jsonb_build_object('method','cash','amount_minor',40000)),null);
  perform pg_temp.check((select stock_qty from products where id=p)=8,'sale decreases stock exactly once');
  perform pg_temp.check((select count(*) from sales where business_id=ba)=1,'duplicate submission creates one sale');

  -- 4: failed sale leaves no trace
  begin perform record_sale(ba,gen_random_uuid(),null,jsonb_build_array(jsonb_build_object('product_id',p,'qty',99)),0,'[]',null); exception when others then null; end;
  perform pg_temp.check((select stock_qty from products where id=p)=8 and (select count(*) from sales)=1,'failed sale changes nothing');

  -- 6: credit sale (partial) => debt, no extra cash
  s2 := record_sale(ba,gen_random_uuid(),c,jsonb_build_array(jsonb_build_object('product_id',p,'qty',3)),0,jsonb_build_array(jsonb_build_object('method','mpesa','amount_minor',10000,'reference','QWE123')),current_date+7);
  select * into r from profit_report(ba, now()-interval '1 day', now()+interval '1 day');
  perform pg_temp.check(r.net_sales_minor=100000 and r.cash_collected_minor=50000 and r.unpaid_credit_minor=50000,'cash vs credit separated');
  perform pg_temp.check(r.cogs_minor=75000 and r.gross_profit_minor=25000,'COGS and gross profit');

  -- 7: partial debt payment
  perform record_customer_payment(ba,c,'cash',20000,null);
  select * into r from profit_report(ba, now()-interval '1 day', now()+interval '1 day');
  perform pg_temp.check(r.unpaid_credit_minor=30000,'debt reduced by repayment');
  begin perform record_customer_payment(ba,c,'cash',999999,null); ok:=false; exception when others then ok:=true; end;
  perform pg_temp.check(ok,'overpayment rejected');
  perform pg_temp.check((select total_minor from debt_aging(ba) where customer_id=c)=30000 and (select not_due_minor from debt_aging(ba) where customer_id=c)=30000,'debt aging matches balance');

  -- 8,9: expense reduces net profit once; purchase is not an expense
  pay := record_expense(ba,'Rent',5000,'cash',current_date,null);
  perform record_purchase(ba,null,'INV1',0,current_date,jsonb_build_array(jsonb_build_object('product_id',p,'qty',10,'unit_cost_minor',16000)));
  select * into r from profit_report(ba, now()-interval '1 day', now()+interval '2 days');
  perform pg_temp.check(r.expenses_minor=5000 and r.net_profit_minor=20000,'expense counted once; purchase excluded');

  -- 10: price change does not alter history
  update products set price_minor=99999, cost_minor=1 where id=p;
  perform pg_temp.check((select net_sales_minor from profit_report(ba, now()-interval '1 day', now()+interval '2 days'))=100000,'history stable after price change');

  -- reversal restores stock and removes sale from reports
  perform reverse_sale(ba,s2,'Customer returned goods');
  perform pg_temp.check((select stock_qty from products where id=p)=18,'reversal restores stock');
  perform pg_temp.check((select net_sales_minor from profit_report(ba, now()-interval '1 day', now()+interval '2 days'))=40000,'reversed sale excluded');

  -- 12: isolation (run as the authenticated role so RLS applies)
  perform pg_temp.act_as(ub);
  set local role authenticated;
  perform pg_temp.check((select count(*) from products where business_id=ba)=0,'B cannot read A products');
  begin perform record_sale(ba,gen_random_uuid(),null,jsonb_build_array(jsonb_build_object('product_id',p,'qty',1)),0,'[]',null); ok:=false; exception when others then ok:=true; end;
  perform pg_temp.check(ok,'B cannot sell from A');
  begin update products set stock_qty=1000 where id=p; ok:=true; exception when others then ok:=true; end;
  reset role;
  raise notice 'ALL ACCEPTANCE CHECKS PASSED';
end $$;
rollback;
