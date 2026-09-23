# DEZE7 — Sistema Interno de Gestão

Painel interno independente da loja pública, usando GitHub Pages + Supabase.

## Redesign 2026
O painel foi refeito para funcionar como um ERP/PDV leve da DEZE7:
- dashboard executivo com faturamento, lucro, despesas e estoque;
- PDV visual com fotos dos produtos e seleção por tamanho;
- produtos em cards com preço, custo, margem, cor e identidade da logo;
- estoque por produto, logo, cor, tamanho e SKU;
- movimentações de estoque com rastreabilidade;
- despesas, fornecedores e categorias;
- clientes com resumo de compras;
- relatórios de faturamento, CMV, despesas, lucro, margem, canais e produtos;
- perfis de acesso por função: administrador, gestor, vendedor, financeiro e estoque;
- layout responsivo para computador e celular.

## Camisetas
O catálogo interno considera 8 camisetas diferentes:
- Preta — Símbolo
- Preta — DEZE7 escrito
- Branca — Símbolo
- Branca — DEZE7 escrito
- Off-white — Símbolo
- Off-white — DEZE7 escrito
- Cinza — Símbolo
- Cinza — DEZE7 escrito

Cada camiseta possui tamanhos P, M e G. O estoque inicial das 24 variações está em zero.

## Kits
Os kits continuam usando as imagens já existentes:
- Camiseta + corrente
- Camiseta + porta-cartões

## Segurança
O painel usa Supabase Auth e RLS. A permissão é aplicada no banco, e não apenas escondida na interface.

- Vendedor: vendas, clientes e consulta de estoque/produtos.
- Gestor: gestão operacional e financeira.
- Financeiro: despesas, fornecedores e relatórios.
- Estoque: produtos, fornecedores e movimentações de estoque.
- Administrador: acesso completo.

## Loja pública
A loja pública permanece desacoplada nesta etapa. Ela não cria vendas nem movimenta estoque do painel interno.
