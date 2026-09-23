# DEZE7 — Gestão Interna + Loja Separada

A DEZE7 está dividida em duas partes independentes nesta etapa.

## 1. Sistema interno de gestão
O arquivo `admin.html` é o painel restrito à equipe autorizada. Ele administra:
- visão geral com indicadores;
- vendas internas e baixa automática de estoque;
- produtos, preço de venda e custo;
- estoque por tamanho e histórico de movimentações;
- despesas e categorias;
- clientes;
- fornecedores;
- relatórios de faturamento, CMV, despesas, lucro e margem.

O acesso usa Supabase Auth e a tabela `deze7_staff`. Usuários que não estiverem autorizados não entram no painel.

## 2. Loja pública
A loja (`index.html`) está propositalmente desacoplada do sistema interno. Ela funciona como apresentação da coleção e não registra vendas nem altera estoque no painel. A integração com e-commerce será feita em uma etapa posterior.

## Banco de dados
Os dados internos usam tabelas com prefixo `deze7_`, separadas das tabelas do Immagine. Entre elas:
- `deze7_products` e `deze7_variants`;
- `deze7_staff`;
- `deze7_sales` e `deze7_sale_items`;
- `deze7_stock_movements`;
- `deze7_expenses` e `deze7_expense_categories`;
- `deze7_customers`;
- `deze7_suppliers`.

## Segurança
O frontend contém apenas a chave pública publishable do Supabase. Não coloque `service_role`, senha do banco ou outras chaves secretas no GitHub.
