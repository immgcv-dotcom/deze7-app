insert into public.deze7_products (slug,name,description,category,price,active,featured,sort_order) values
('camiseta-preta','Camiseta DEZE7 Preta','Preta · Modelagem regular','camiseta',86.50,true,false,10),
('camiseta-branca','Camiseta DEZE7 Branca','Branca · Modelagem regular','camiseta',86.50,true,false,20),
('camiseta-off-white','Camiseta DEZE7 Off-white','Off-white · Modelagem regular','camiseta',86.50,true,false,30),
('camiseta-cinza','Camiseta DEZE7 Cinza','Cinza · Modelagem regular','camiseta',86.50,true,false,40),
('kit-camiseta-corrente','Kit DEZE7 Camiseta + Corrente','Camiseta preta + corrente · Caixa DEZE7','kit',129.90,true,true,50),
('kit-camiseta-porta-cartoes','Kit DEZE7 Camiseta + Porta-cartões','Camiseta preta + porta-cartões · Caixa DEZE7','kit',129.90,true,true,60)
on conflict (slug) do nothing;
-- As variantes P/M/G foram provisionadas no Supabase com estoque inicial 0.
