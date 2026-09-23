import { getSupabase } from './supabase-client.js';

const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const num = v => Number(v||0);
const todayISO = () => new Date().toISOString().slice(0,10);
const monthISO = () => new Date().toISOString().slice(0,7);
const dateBR = v => v ? new Date(v).toLocaleDateString('pt-BR') : '-';
const dateTimeBR = v => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '-';
const slugify=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

let sb=null;
let currentStaff=null;
let saleLines=[];
let state={products:[],variants:[],sales:[],saleItems:[],expenses:[],customers:[],suppliers:[],categories:[],movements:[],staff:[]};

const permissions={
  sell:['admin','manager','seller'],
  finance:['admin','manager','finance'],
  reports:['admin','manager','finance'],
  stock:['admin','manager','stock'],
  supplier:['admin','manager','finance','stock'],
  customer:['admin','manager','seller','finance'],
  access:['admin','manager'],
  'product-edit':['admin','manager','stock']
};
const can = p => !p || (permissions[p]||[]).includes(currentStaff?.role);
const roleLabel=r=>({admin:'Administrador',manager:'Gestor',seller:'Vendedor',finance:'Financeiro',stock:'Estoque'}[r]||r||'Usuário');
const designLabel=d=>d==='wordmark'?'DEZE7 escrito':d==='simbolo'?'Símbolo':'Outro';

function toast(message,type='ok'){
  const t=$('toast'); t.textContent=message; t.className=`toast show ${type}`;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.className='toast',3200);
}
function productMap(){return Object.fromEntries(state.products.map(x=>[x.id,x]))}
function variantMap(){return Object.fromEntries(state.variants.map(x=>[x.id,x]))}
function customerMap(){return Object.fromEntries(state.customers.map(x=>[x.id,x]))}
function supplierMap(){return Object.fromEntries(state.suppliers.map(x=>[x.id,x]))}
function categoryMap(){return Object.fromEntries(state.categories.map(x=>[x.id,x]))}
function variantsFor(productId){return state.variants.filter(v=>v.product_id===productId&&v.active)}
function totalStock(productId){return variantsFor(productId).reduce((a,v)=>a+num(v.stock),0)}
function imageFor(p){return p.image_url || 'assets/logo-deze7.png'}
function monthRange(month=monthISO()){
  const [y,m]=month.split('-').map(Number);return {start:new Date(y,m-1,1),end:new Date(y,m,1)};
}
function inRange(v,start,end){const d=new Date(v);return d>=start&&d<end}

async function init(){
  sb=await getSupabase();
  if(!sb){toast('Configuração do Supabase não encontrada.','error');return}
  $('today').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace('.','');
  $('expenseDate').value=todayISO(); $('reportMonth').value=monthISO();
  $('loginform').onsubmit=login;
  const {data:{session}}=await sb.auth.getSession();
  if(session) await authorize(session.user.id);
}
async function login(e){
  e.preventDefault();
  const {data,error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});
  if(error){toast('E-mail ou senha inválidos.','error');return}
  await authorize(data.user.id);
}
async function authorize(uid){
  const {data,error}=await sb.from('deze7_staff').select('user_id,name,role,active').eq('user_id',uid).eq('active',true).maybeSingle();
  if(error||!data){await sb.auth.signOut();toast('Este usuário não está autorizado na DEZE7.','error');return}
  currentStaff=data;
  $('staffName').textContent=data.name||'Equipe DEZE7'; $('staffRole').textContent=roleLabel(data.role);
  $('staffAvatar').textContent=(data.name||'D7').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  $('loginbox').classList.add('hidden'); $('mgmt').classList.remove('hidden');
  applyRoleUI(); bindUI(); await loadAll(); showView('dashboard');
}
function applyRoleUI(){
  $$('[data-permission]').forEach(el=>{const p=el.dataset.permission;el.classList.toggle('permission-hidden',!can(p))});
  $$('.finance-only').forEach(el=>el.classList.toggle('permission-hidden',!can('finance')));
  $$('.finance-col').forEach(el=>el.classList.toggle('permission-hidden',!can('finance')));
}
function bindUI(){
  $$('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $$('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
  $('logout').onclick=()=>sb.auth.signOut().then(()=>location.reload());
  $('menuBtn').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
  $('quickSale').onclick=()=>showView('sales');
  $('saleProductSearch').oninput=renderSaleProducts;
  $('salesSearch').oninput=renderSalesHistory;
  $('saleDiscount').oninput=renderSaleCart;
  $('finishSale').onclick=saveSale;
  $('productSearch').oninput=renderProducts;
  $('newProduct').onclick=()=>openProductEditor();
  $('closeProductEditor').onclick=closeProductEditor;
  $('clearProduct').onclick=()=>openProductEditor();
  $('productForm').onsubmit=saveProduct;
  $('stockSearch').oninput=renderStock;
  $('toggleExpenseForm').onclick=()=>togglePanel('expenseEditor',true);
  $('closeExpenseEditor').onclick=()=>togglePanel('expenseEditor',false);
  $('expenseForm').onsubmit=saveExpense;
  $('expenseSearch').oninput=renderExpenses;
  $('toggleCustomerForm').onclick=()=>togglePanel('customerEditor',true);
  $('closeCustomerEditor').onclick=()=>togglePanel('customerEditor',false);
  $('customerForm').onsubmit=saveCustomer;
  $('customerSearch').oninput=renderCustomers;
  $('toggleSupplierForm').onclick=()=>togglePanel('supplierEditor',true);
  $('closeSupplierEditor').onclick=()=>togglePanel('supplierEditor',false);
  $('supplierForm').onsubmit=saveSupplier;
  $('reportMonth').onchange=renderReports;
}
function togglePanel(id,open){$(id).classList.toggle('hidden',!open);if(open)$(id).scrollIntoView({behavior:'smooth',block:'start'})}
function showView(view){
  const target=$(`view-${view}`);if(!target||target.classList.contains('permission-hidden'))return;
  $$('.view').forEach(v=>v.classList.add('hidden'));target.classList.remove('hidden');
  $$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  const meta={
    dashboard:['DEZE7 / GESTÃO','Visão geral','Acompanhe a operação da marca em tempo real.'],
    sales:['COMERCIAL','Vendas','PDV interno com baixa automática de estoque.'],
    products:['CATÁLOGO','Produtos','Fotos, custos, preços e margem por peça.'],
    stock:['OPERAÇÃO','Estoque','Saldo por produto, identidade e tamanho.'],
    expenses:['FINANCEIRO','Despesas','Controle os gastos da operação.'],
    customers:['RELACIONAMENTO','Clientes','Cadastro e histórico da base.'],
    suppliers:['COMPRAS','Fornecedores','Contatos e parceiros da operação.'],
    reports:['INTELIGÊNCIA','Relatórios','Indicadores para apoiar as decisões da marca.'],
    access:['SEGURANÇA','Acessos','Perfis e permissões da equipe.']
  }[view];
  $('viewEyebrow').textContent=meta[0];$('viewTitle').textContent=meta[1];$('viewSubtitle').textContent=meta[2];
  document.querySelector('.sidebar').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}

async function loadAll(){
  const req=[];
  req.push(['products',sb.from('deze7_products').select('*').order('sort_order')]);
  req.push(['variants',sb.from('deze7_variants').select('*').order('sku')]);
  req.push(['movements',sb.from('deze7_stock_movements').select('*').order('created_at',{ascending:false}).limit(300)]);
  if(can('customer')) req.push(['customers',sb.from('deze7_customers').select('*').eq('active',true).order('name')]);
  if(['admin','manager','seller','finance'].includes(currentStaff.role)) req.push(['sales',sb.from('deze7_sales').select('*').order('sale_date',{ascending:false}).limit(1000)]);
  if(can('finance')){
    req.push(['expenses',sb.from('deze7_expenses').select('*').order('expense_date',{ascending:false}).limit(1000)]);
    req.push(['categories',sb.from('deze7_expense_categories').select('*').eq('active',true).order('sort_order')]);
  }
  if(can('supplier')) req.push(['suppliers',sb.from('deze7_suppliers').select('*').eq('active',true).order('name')]);
  if(can('reports')) req.push(['saleItems',sb.from('deze7_sale_items').select('*').order('created_at',{ascending:false}).limit(3000)]);
  if(can('access')) req.push(['staff',sb.from('deze7_staff').select('*').order('created_at')]);

  const results=await Promise.all(req.map(async ([key,promise])=>[key,await promise]));
  for(const [key,res] of results){
    if(res.error){console.error(key,res.error);state[key]=[]}
    else state[key]=res.data||[];
  }
  renderAll();
}
function renderAll(){
  renderDashboard();renderLookups();renderSaleProducts();renderSaleCart();renderSalesHistory();renderProducts();renderStock();
  if(can('finance'))renderExpenses();if(can('customer'))renderCustomers();if(can('supplier'))renderSuppliers();if(can('reports'))renderReports();if(can('access'))renderStaff();
}
function renderLookups(){
  if(can('customer')) $('saleCustomer').innerHTML='<option value="">Venda sem cliente</option>'+state.customers.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  if(can('finance')) $('expenseCategory').innerHTML=state.categories.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  if(can('finance')) $('expenseSupplier').innerHTML='<option value="">Sem fornecedor</option>'+state.suppliers.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
}

function renderDashboard(){
  const {start,end}=monthRange();
  const monthSales=state.sales.filter(s=>s.status!=='cancelled'&&s.payment_status!=='cancelled'&&inRange(s.sale_date,start,end));
  const monthExpenses=state.expenses.filter(e=>e.status!=='cancelled'&&inRange(e.expense_date+'T12:00:00',start,end));
  const revenue=monthSales.reduce((a,s)=>a+num(s.total),0),cogs=monthSales.reduce((a,s)=>a+num(s.cogs),0),expenses=monthExpenses.reduce((a,e)=>a+num(e.amount),0);
  const activeVariants=state.variants.filter(v=>v.active),stock=activeVariants.reduce((a,v)=>a+num(v.stock),0),low=activeVariants.filter(v=>num(v.stock)<=num(v.min_stock??3)).length;
  $('kpiRevenue').textContent=money(revenue);$('kpiRevenueSub').textContent=`${monthSales.length} venda${monthSales.length===1?'':'s'} registrada${monthSales.length===1?'':'s'}`;
  $('kpiProfit').textContent=money(revenue-cogs-expenses);$('kpiExpenses').textContent=money(expenses);$('kpiExpenseSub').textContent=`${monthExpenses.length} lançamento${monthExpenses.length===1?'':'s'}`;
  $('kpiStock').textContent=stock;$('kpiStockSub').textContent=`${activeVariants.length} variações · ${low} em atenção`;
  $('salesMonthTotal').textContent=money(revenue);$('dashRevenue').textContent=money(revenue);$('dashCogs').textContent=money(cogs);$('dashExpenses').textContent=money(expenses);$('dashResult').textContent=money(revenue-cogs-expenses);
  renderDailyBars('salesChart',monthSales,start,end,false);
  renderLowStock();renderRecentSales();
}
function renderDailyBars(id,sales,start,end,tall=false){
  const days=Math.max(1,Math.ceil((end-start)/86400000));const now=new Date();const maxDay=(now>=start&&now<end)?now.getDate():days;
  const values=Array.from({length:maxDay},(_,i)=>sales.filter(s=>new Date(s.sale_date).getDate()===i+1).reduce((a,s)=>a+num(s.total),0));
  const max=Math.max(...values,1);
  $(id).innerHTML=values.map((v,i)=>`<div class="bar-wrap" title="Dia ${i+1}: ${money(v)}"><div class="bar" style="height:${Math.max(v?8:2,(v/max)*100)}%"></div></div>`).join('')||'<div class="empty-state compact">Sem vendas no período.</div>';
}
function renderLowStock(){
  const pm=productMap();const rows=state.variants.filter(v=>v.active&&num(v.stock)<=num(v.min_stock??3)).sort((a,b)=>num(a.stock)-num(b.stock)).slice(0,8);
  $('lowStockList').innerHTML=rows.length?rows.map(v=>{const p=pm[v.product_id]||{};return `<div class="compact-row"><img src="${esc(imageFor(p))}" alt=""><div><strong>${esc(p.name||'-')}</strong><span>${esc(v.size||'-')} · ${esc(v.color||p.color_name||'')}</span></div><b class="stock-pill ${num(v.stock)===0?'zero':'low'}">${v.stock}</b></div>`}).join(''):'<div class="empty-state compact">Nenhum item em atenção.</div>';
}
function renderRecentSales(){
  const cm=customerMap();const rows=state.sales.slice(0,6);
  $('recentSales').innerHTML=rows.length?rows.map(s=>`<div class="activity-row"><div class="activity-icon">#${s.sale_number}</div><div><strong>${esc(cm[s.customer_id]?.name||'Venda balcão')}</strong><span>${dateTimeBR(s.sale_date)} · ${esc(s.channel)}</span></div><b>${money(s.total)}</b></div>`).join(''):'<div class="empty-state compact">Nenhuma venda registrada ainda.</div>';
}

function renderSaleProducts(){
  if(!can('sell'))return;
  const q=$('saleProductSearch').value.trim().toLowerCase();
  const products=state.products.filter(p=>p.active&&(!q||`${p.name} ${p.color_name||''} ${designLabel(p.design)}`.toLowerCase().includes(q)));
  $('saleProductGrid').innerHTML=products.map(p=>{
    const vs=variantsFor(p.id).sort((a,b)=>['P','M','G','GG'].indexOf(a.size)-['P','M','G','GG'].indexOf(b.size));
    const sizes=vs.map(v=>`<button class="size-stock ${num(v.stock)<=0?'soldout':''}" data-add-variant="${v.id}" ${num(v.stock)<=0?'disabled':''}><span>${esc(v.size||'-')}</span><small>${v.stock}</small></button>`).join('');
    return `<article class="pos-card"><div class="pos-image"><img src="${esc(imageFor(p))}" alt="${esc(p.name)}"><span class="design-chip">${esc(designLabel(p.design))}</span></div><div class="pos-card-body"><h3>${esc(p.name)}</h3><div class="product-meta"><span>${esc(p.color_name||'')}</span><strong>${money(p.price)}</strong></div><div class="size-stock-row">${sizes}</div></div></article>`
  }).join('')||'<div class="empty-state">Nenhum produto encontrado.</div>';
  $$('[data-add-variant]').forEach(b=>b.onclick=()=>addVariantToSale(b.dataset.addVariant));
}
function addVariantToSale(id){
  const v=state.variants.find(x=>x.id===id),p=state.products.find(x=>x.id===v?.product_id);if(!v||!p||num(v.stock)<=0)return;
  const row=saleLines.find(x=>x.variant_id===id);
  if(row){if(row.quantity>=num(v.stock)){toast('Quantidade máxima em estoque atingida.','warn');return}row.quantity++}
  else saleLines.push({product_id:p.id,variant_id:v.id,name:p.name,size:v.size,color:v.color,quantity:1,stock:num(v.stock),unit_price:num(p.price),image:imageFor(p)});
  renderSaleCart();
}
function renderSaleCart(){
  const discount=Math.max(0,num($('saleDiscount')?.value));const subtotal=saleLines.reduce((a,x)=>a+x.quantity*x.unit_price,0),total=Math.max(0,subtotal-discount);
  $('saleItemCount').textContent=`${saleLines.reduce((a,x)=>a+x.quantity,0)} itens`;
  $('saleCartEmpty').classList.toggle('hidden',saleLines.length>0);
  $('saleCartList').innerHTML=saleLines.map(x=>`<div class="cart-line"><img src="${esc(x.image)}" alt=""><div class="cart-line-main"><strong>${esc(x.name)}</strong><span>${esc(x.color||'')} · ${esc(x.size||'')} · ${money(x.unit_price)}</span><div class="qty-control"><button data-dec="${x.variant_id}">−</button><b>${x.quantity}</b><button data-inc="${x.variant_id}">+</button></div></div><div class="cart-line-side"><strong>${money(x.quantity*x.unit_price)}</strong><button class="remove-btn" data-remove="${x.variant_id}">×</button></div></div>`).join('');
  $('saleSubtotal').textContent=money(subtotal);$('saleDiscountValue').textContent=money(discount);$('saleTotal').textContent=money(total);$('finishSale').disabled=!saleLines.length;
  $$('[data-inc]').forEach(b=>b.onclick=()=>changeSaleQty(b.dataset.inc,1));$$('[data-dec]').forEach(b=>b.onclick=()=>changeSaleQty(b.dataset.dec,-1));$$('[data-remove]').forEach(b=>b.onclick=()=>{saleLines=saleLines.filter(x=>x.variant_id!==b.dataset.remove);renderSaleCart()});
}
function changeSaleQty(id,delta){const x=saleLines.find(x=>x.variant_id===id);if(!x)return;const next=x.quantity+delta;if(next<=0)saleLines=saleLines.filter(y=>y.variant_id!==id);else if(next<=x.stock)x.quantity=next;else toast('Quantidade máxima em estoque atingida.','warn');renderSaleCart()}
async function saveSale(){
  if(!saleLines.length)return;
  $('finishSale').disabled=true;$('finishSale').textContent='Registrando...';
  const {data,error}=await sb.rpc('deze7_create_internal_sale',{p_customer_id:$('saleCustomer').value||null,p_channel:$('saleChannel').value,p_payment_method:$('salePayment').value,p_payment_status:'paid',p_discount:num($('saleDiscount').value),p_notes:$('saleNotes').value.trim(),p_items:saleLines.map(x=>({product_id:x.product_id,variant_id:x.variant_id,quantity:x.quantity,unit_price:x.unit_price}))});
  $('finishSale').textContent='Finalizar venda';
  if(error){$('finishSale').disabled=false;toast(error.message,'error');return}
  saleLines=[];$('saleDiscount').value='0';$('saleNotes').value='';await loadAll();toast('Venda registrada e estoque atualizado.');
}
function renderSalesHistory(){
  const q=$('salesSearch').value.trim().toLowerCase(),cm=customerMap();
  const rows=state.sales.filter(s=>!q||`${s.sale_number} ${cm[s.customer_id]?.name||''} ${s.channel}`.toLowerCase().includes(q));
  $('salesTable').innerHTML=rows.map(s=>{const margin=num(s.total)-num(s.cogs);return `<tr><td><b>#${s.sale_number}</b></td><td>${dateTimeBR(s.sale_date)}</td><td>${esc(cm[s.customer_id]?.name||'Balcão')}</td><td><span class="tag">${esc(s.channel)}</span></td><td><b>${money(s.total)}</b></td><td class="finance-col">${money(s.cogs)}</td><td class="finance-col"><span class="positive">${money(margin)}</span></td></tr>`}).join('')||`<tr><td colspan="7"><div class="empty-state compact">Nenhuma venda encontrada.</div></td></tr>`;
  applyRoleUI();
}

function renderProducts(){
  const q=$('productSearch').value.trim().toLowerCase();const rows=state.products.filter(p=>!q||`${p.name} ${p.color_name||''} ${p.category}`.toLowerCase().includes(q));
  $('productsGrid').innerHTML=rows.map(p=>{
    const stock=totalStock(p.id),margin=p.cost==null?null:num(p.price)-num(p.cost),pct=margin==null||!num(p.price)?null:(margin/num(p.price))*100;
    return `<article class="product-card"><div class="product-photo"><img src="${esc(imageFor(p))}" alt="${esc(p.name)}"><div class="product-badges"><span>${esc(p.color_name||p.category)}</span>${p.category==='camiseta'?`<span>${esc(designLabel(p.design))}</span>`:''}</div></div><div class="product-card-content"><div class="product-title-row"><h3>${esc(p.name)}</h3><span class="status-dot ${p.active?'on':'off'}"></span></div><div class="product-numbers"><div><span>Venda</span><strong>${money(p.price)}</strong></div><div class="finance-only"><span>Custo</span><strong>${p.cost==null?'—':money(p.cost)}</strong></div><div class="finance-only"><span>Margem</span><strong>${pct==null?'—':pct.toFixed(0)+'%'}</strong></div><div><span>Estoque</span><strong>${stock}</strong></div></div>${can('product-edit')?`<button class="btn btn-secondary full" data-edit-product="${p.id}">Editar produto</button>`:''}</div></article>`
  }).join('')||'<div class="empty-state">Nenhum produto encontrado.</div>';
  $$('[data-edit-product]').forEach(b=>b.onclick=()=>openProductEditor(b.dataset.editProduct));applyRoleUI();
}
function openProductEditor(id=''){
  if(!can('product-edit'))return;const p=state.products.find(x=>x.id===id);
  $('productId').value=p?.id||'';$('productName').value=p?.name||'';$('productCategory').value=p?.category||'camiseta';$('productActive').value=String(p?.active??true);$('productColor').value=p?.color_name||variantsFor(p?.id).find(Boolean)?.color||'';$('productDesign').value=p?.design||'simbolo';$('productPrice').value=p?.price??'';$('productCost').value=p?.cost??'';$('productImage').value=p?.image_url||'';$('productDescription').value=p?.description||'';$('productEditorTitle').textContent=p?'Editar produto':'Novo produto';togglePanel('productEditor',true);
}
function closeProductEditor(){togglePanel('productEditor',false)}
async function saveProduct(e){
  e.preventDefault();const id=$('productId').value,color=$('productColor').value.trim();const payload={name:$('productName').value.trim(),category:$('productCategory').value,active:$('productActive').value==='true',color_name:color||null,design:$('productDesign').value||null,price:num($('productPrice').value),cost:$('productCost').value===''?null:num($('productCost').value),image_url:$('productImage').value.trim()||null,description:$('productDescription').value.trim()};
  if(id){const r=await sb.from('deze7_products').update(payload).eq('id',id);if(r.error)return toast(r.error.message,'error');const vr=await sb.from('deze7_variants').update({color}).eq('product_id',id);if(vr.error)return toast(vr.error.message,'error')}
  else {const slug=slugify(payload.name)+'-'+Date.now().toString().slice(-5);const r=await sb.from('deze7_products').insert({...payload,slug,sort_order:(state.products.length+1)*10}).select('id').single();if(r.error)return toast(r.error.message,'error');for(const size of ['P','M','G']){const sku='D7-'+Date.now().toString().slice(-6)+'-'+size+'-'+Math.random().toString(36).slice(2,5).toUpperCase();const vr=await sb.from('deze7_variants').insert({product_id:r.data.id,sku,size,color,stock:0,min_stock:3,active:true});if(vr.error)return toast(vr.error.message,'error')}}
  closeProductEditor();e.target.reset();await loadAll();toast('Produto salvo.');
}

function renderStock(){
  const q=$('stockSearch').value.trim().toLowerCase(),pm=productMap();const active=state.variants.filter(v=>v.active),zero=active.filter(v=>num(v.stock)===0),low=active.filter(v=>num(v.stock)>0&&num(v.stock)<=num(v.min_stock??3));
  $('stockTotal').textContent=active.reduce((a,v)=>a+num(v.stock),0);$('stockZero').textContent=zero.length;$('stockLow').textContent=low.length;$('stockProducts').textContent=state.products.filter(p=>p.active).length;
  const products=state.products.filter(p=>!q||`${p.name} ${p.color_name||''} ${variantsFor(p.id).map(v=>v.sku).join(' ')}`.toLowerCase().includes(q));
  $('stockCards').innerHTML=products.map(p=>{
    const vs=variantsFor(p.id);if(!vs.length)return '';
    return `<div class="stock-product"><div class="stock-product-info"><img src="${esc(imageFor(p))}" alt=""><div><strong>${esc(p.name)}</strong><span>${esc(p.color_name||'')} · ${esc(designLabel(p.design))}</span><small>${vs.map(v=>esc(v.sku)).join(' · ')}</small></div></div><div class="stock-sizes">${vs.sort((a,b)=>String(a.size).localeCompare(String(b.size))).map(v=>`<div class="stock-size-card ${num(v.stock)===0?'zero':num(v.stock)<=num(v.min_stock??3)?'low':''}"><span>${esc(v.size||'-')}</span><strong>${v.stock}</strong><small>unidades</small>${can('stock')?`<button class="text-btn" data-adjust-stock="${v.id}">Ajustar</button>`:''}</div>`).join('')}</div></div>`
  }).join('')||'<div class="empty-state">Nenhum produto encontrado.</div>';
  $$('[data-adjust-stock]').forEach(b=>b.onclick=()=>adjustStock(b.dataset.adjustStock));
  const vm=variantMap();$('movementTable').innerHTML=state.movements.slice(0,150).map(m=>{const v=vm[m.variant_id],p=v&&pm[v.product_id];return `<tr><td>${dateTimeBR(m.created_at)}</td><td>${esc(p?.name||'-')} · ${esc(v?.size||'')}</td><td><span class="tag">${esc(m.movement_type)}</span></td><td class="${num(m.quantity_delta)>0?'positive':'negative'}"><b>${num(m.quantity_delta)>0?'+':''}${m.quantity_delta}</b></td><td>${esc(m.reason||'-')}</td></tr>`}).join('')||`<tr><td colspan="5"><div class="empty-state compact">Nenhuma movimentação.</div></td></tr>`;
}
async function adjustStock(id){
  if(!can('stock'))return;const v=variantMap()[id],p=productMap()[v.product_id];const target=prompt(`${p.name} · ${v.size}\nEstoque atual: ${v.stock}\nDigite o NOVO saldo:`);if(target===null)return;const next=Math.max(0,parseInt(target,10)||0),delta=next-num(v.stock);if(!delta)return;const reason=prompt('Motivo do ajuste:','Ajuste pelo painel')||'Ajuste pelo painel';const {error}=await sb.rpc('deze7_adjust_stock',{p_variant_id:id,p_quantity_delta:delta,p_reason:reason,p_movement_type:'adjustment'});if(error)return toast(error.message,'error');await loadAll();toast('Estoque atualizado.');
}

function renderExpenses(){
  if(!can('finance'))return;const q=$('expenseSearch').value.trim().toLowerCase(),{start,end}=monthRange(),month=state.expenses.filter(e=>e.status!=='cancelled'&&inRange(e.expense_date+'T12:00:00',start,end));
  const paid=month.filter(e=>e.status==='paid').reduce((a,e)=>a+num(e.amount),0),pending=state.expenses.filter(e=>e.status==='pending').reduce((a,e)=>a+num(e.amount),0),total=month.reduce((a,e)=>a+num(e.amount),0);
  $('expensePaidMonth').textContent=money(paid);$('expensePending').textContent=money(pending);$('expenseMonthTotal').textContent=money(total);
  const cm=categoryMap(),sm=supplierMap();const rows=state.expenses.filter(e=>!q||`${e.description} ${cm[e.category_id]?.name||''} ${sm[e.supplier_id]?.name||''}`.toLowerCase().includes(q));
  $('expensesList').innerHTML=rows.map(e=>`<div class="finance-row"><div class="finance-date"><b>${dateBR(e.expense_date+'T12:00:00')}</b><span>${e.status==='paid'?'Pago':'Pendente'}</span></div><div class="finance-desc"><strong>${esc(e.description)}</strong><span>${esc(cm[e.category_id]?.name||'Sem categoria')} · ${esc(sm[e.supplier_id]?.name||'Sem fornecedor')}</span></div><div class="finance-value">${money(e.amount)}</div></div>`).join('')||'<div class="empty-state compact">Nenhuma despesa encontrada.</div>';
}
async function saveExpense(e){e.preventDefault();const payload={expense_date:$('expenseDate').value,category_id:$('expenseCategory').value||null,supplier_id:$('expenseSupplier').value||null,description:$('expenseDescription').value.trim(),amount:num($('expenseAmount').value),payment_method:$('expensePayment').value,status:$('expenseStatus').value,created_by:currentStaff.user_id};const {error}=await sb.from('deze7_expenses').insert(payload);if(error)return toast(error.message,'error');e.target.reset();$('expenseDate').value=todayISO();togglePanel('expenseEditor',false);await loadAll();toast('Despesa registrada.')}

function renderCustomers(){
  if(!can('customer'))return;const q=$('customerSearch').value.trim().toLowerCase();
  $('customersGrid').innerHTML=state.customers.filter(c=>!q||`${c.name} ${c.phone||''} ${c.email||''} ${c.city||''}`.toLowerCase().includes(q)).map(c=>{const sales=state.sales.filter(s=>s.customer_id===c.id&&s.status!=='cancelled'),spent=sales.reduce((a,s)=>a+num(s.total),0),last=sales[0]?.sale_date;return `<article class="contact-card"><div class="contact-avatar">${esc(c.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div class="contact-main"><h3>${esc(c.name)}</h3><p>${esc(c.phone||'Sem telefone')} · ${esc(c.city||'Cidade não informada')}</p><div class="contact-stats"><span><b>${sales.length}</b> compras</span><span><b>${money(spent)}</b> total</span><span><b>${last?dateBR(last):'—'}</b> última</span></div></div></article>`}).join('')||'<div class="empty-state">Nenhum cliente encontrado.</div>';
}
async function saveCustomer(e){e.preventDefault();const {error}=await sb.from('deze7_customers').insert({name:$('customerName').value.trim(),phone:$('customerPhone').value.trim(),email:$('customerEmail').value.trim()||null,city:$('customerCity').value.trim()});if(error)return toast(error.message,'error');e.target.reset();togglePanel('customerEditor',false);await loadAll();toast('Cliente cadastrado.')}

function renderSuppliers(){
  if(!can('supplier'))return;const expBySupplier={};state.expenses.forEach(e=>expBySupplier[e.supplier_id]=(expBySupplier[e.supplier_id]||0)+num(e.amount));
  $('suppliersGrid').innerHTML=state.suppliers.map(s=>`<article class="supplier-card"><div class="supplier-top"><div class="contact-avatar">${esc(s.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><span class="status-chip">Ativo</span></div><h3>${esc(s.name)}</h3><p>${esc(s.contact_name||'Sem contato principal')}</p><div class="supplier-contact"><span>${esc(s.phone||'—')}</span><span>${esc(s.email||'—')}</span></div>${can('finance')?`<div class="supplier-spend"><span>Gasto registrado</span><strong>${money(expBySupplier[s.id]||0)}</strong></div>`:''}</article>`).join('')||'<div class="empty-state">Nenhum fornecedor cadastrado.</div>';
}
async function saveSupplier(e){e.preventDefault();const {error}=await sb.from('deze7_suppliers').insert({name:$('supplierName').value.trim(),contact_name:$('supplierContact').value.trim(),phone:$('supplierPhone').value.trim(),email:$('supplierEmail').value.trim()||null});if(error)return toast(error.message,'error');e.target.reset();togglePanel('supplierEditor',false);await loadAll();toast('Fornecedor cadastrado.')}

function renderReports(){
  if(!can('reports'))return;const m=$('reportMonth').value||monthISO(),{start,end}=monthRange(m);const sales=state.sales.filter(s=>s.status!=='cancelled'&&s.payment_status!=='cancelled'&&inRange(s.sale_date,start,end)),expenses=state.expenses.filter(e=>e.status!=='cancelled'&&inRange(e.expense_date+'T12:00:00',start,end)),items=state.saleItems.filter(i=>inRange(i.created_at,start,end));
  const revenue=sales.reduce((a,s)=>a+num(s.total),0),cogs=sales.reduce((a,s)=>a+num(s.cogs),0),exp=expenses.reduce((a,e)=>a+num(e.amount),0),profit=revenue-cogs-exp;
  $('repRevenue').textContent=money(revenue);$('repCogs').textContent=money(cogs);$('repExpenses').textContent=money(exp);$('repProfit').textContent=money(profit);$('repMargin').textContent=(revenue?profit/revenue*100:0).toFixed(1)+'%';
  const channels={};sales.forEach(s=>channels[s.channel]=(channels[s.channel]||0)+num(s.total));renderRankList('channelReport',channels,revenue,true);
  const cm=categoryMap(),cats={};expenses.forEach(e=>{const k=cm[e.category_id]?.name||'Sem categoria';cats[k]=(cats[k]||0)+num(e.amount)});renderRankList('expenseReport',cats,exp,true);
  const prod={};items.forEach(i=>prod[i.product_name]=(prod[i.product_name]||0)+num(i.quantity));renderRankList('productReport',prod,Object.values(prod).reduce((a,b)=>a+b,0),false);
  renderDailyBars('reportDailyChart',sales,start,end,true);
}
function renderRankList(id,obj,total,currency){const rows=Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,8);$(id).innerHTML=rows.length?rows.map(([k,v],i)=>`<div class="rank-row"><span class="rank-no">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(k)}</strong><div class="rank-track"><i style="width:${total?Math.max(3,v/total*100):0}%"></i></div></div><b>${currency?money(v):v+' un.'}</b></div>`).join(''):'<div class="empty-state compact">Sem dados no período.</div>'}

function renderStaff(){
  if(!can('access'))return;$('staffList').innerHTML=state.staff.map(s=>`<div class="staff-row"><div class="contact-avatar">${esc((s.name||'D7').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div class="staff-info"><strong>${esc(s.name||'Usuário DEZE7')}</strong><span>${s.user_id===currentStaff.user_id?'Seu acesso':'Usuário autorizado'}</span></div><select data-staff-role="${s.user_id}" ${currentStaff.role!=='admin'?'disabled':''}>${['admin','manager','seller','finance','stock'].map(r=>`<option value="${r}" ${r===s.role?'selected':''}>${roleLabel(r)}</option>`).join('')}</select><label class="switch-label"><input type="checkbox" data-staff-active="${s.user_id}" ${s.active?'checked':''} ${currentStaff.role!=='admin'||s.user_id===currentStaff.user_id?'disabled':''}><span>Ativo</span></label></div>`).join('')||'<div class="empty-state compact">Nenhum usuário.</div>';
  $$('[data-staff-role]').forEach(s=>s.onchange=()=>updateStaff(s.dataset.staffRole,{role:s.value}));$$('[data-staff-active]').forEach(s=>s.onchange=()=>updateStaff(s.dataset.staffActive,{active:s.checked}));
}
async function updateStaff(id,payload){const {error}=await sb.from('deze7_staff').update(payload).eq('user_id',id);if(error)return toast(error.message,'error');await loadAll();toast('Permissão atualizada.')}

init();
