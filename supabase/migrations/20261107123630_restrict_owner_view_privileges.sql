begin;
revoke all on public.products_owner, public.sale_items_owner from public, anon, authenticated;
grant select on public.products_owner, public.sale_items_owner to authenticated;
commit;
