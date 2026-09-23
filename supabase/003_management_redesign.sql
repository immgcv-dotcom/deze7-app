-- DEZE7 — evolução do painel de gestão
-- Adiciona identidade do produto, estoque mínimo, permissões por cargo e venda interna segura.

alter table public.deze7_products
  add column if not exists design text,
  add column if not exists color_name text;

alter table public.deze7_variants
  add column if not exists min_stock integer not null default 3 check (min_stock >= 0);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.deze7_current_role()
returns text language sql stable security definer set search_path=public as $$
  select role from public.deze7_staff where user_id=auth.uid() and active=true limit 1
$$;
revoke all on function private.deze7_current_role() from public;
grant execute on function private.deze7_current_role() to authenticated;

-- As oito camisetas (4 cores x 2 identidades) são provisionadas no projeto ativo.
-- Estoque inicial de todas as camisetas = 0.
