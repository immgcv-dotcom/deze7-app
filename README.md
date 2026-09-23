# DEZE7 — Loja + Painel

Base independente da DEZE7 usando GitHub Pages + Supabase.

## Estrutura atual
- Loja pública responsiva.
- 4 camisetas a R$ 86,50.
- 2 kits a R$ 129,90.
- Estoque por tamanho P / M / G.
- Sacola e registro de pedidos.
- Painel administrativo com preço, custo, estoque e status dos pedidos.
- Supabase compartilhado com o Immagine, mas com tabelas isoladas pelo prefixo `deze7_`.
- RLS habilitado nas tabelas da DEZE7.

## Banco
As tabelas usadas são:
- `deze7_products`
- `deze7_variants`
- `deze7_admins`
- `deze7_orders`
- `deze7_order_items`

A loja pública lê apenas produtos/variações ativos. Pedidos são criados por `deze7_create_order`, que recalcula os valores no servidor.

## Configuração
`config.js` usa somente a URL do projeto Supabase e a chave pública publishable. Nunca adicione `service_role`, senha do banco ou outra chave secreta ao repositório.

## Administrador
Para acessar `admin.html`, o usuário deve existir no Supabase Auth e seu `user_id` precisa constar em `deze7_admins`.
