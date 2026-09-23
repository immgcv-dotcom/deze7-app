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
let currentUserEmail='';
const AUDIT_OWNER_EMAIL='immgcv@gmail.com';
let saleLines=[];
let bundleEditingProductId=null;
let state={
  products:[],variants:[],bundleRules:[],sales:[],saleItems:[],
  expenses:[],customers:[],suppliers:[],categories:[],movements:[],staff:[]
};

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
const isAuditOwner=()=>currentUserEmail===AUDIT_OWNER_EMAIL;
function auditActor(uid){
  if(!isAuditOwner()||!uid)return '';
  const s=state.staff.find(x=>x.user_id===uid);
  const who=uid===currentStaff?.user_id?`Você · ${currentUserEmail}`:(s?.name||'Usuário não identificado');
  return `<small style="display:block;margin-top:4px;color:#8f8a82;font-size:11px">Lançado por: ${esc(who)}</small>`;
}

function toast(message,type='ok'){
  const t=$('toast'); t.textContent=message; t.className=`toast show ${type}`;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.className='toast',3400);
}
function productMap(){return Object.fromEntries(state.products.map(x=>[x.id,x]))}
function variantMap(){return Object.fromEntries(state.variants.map(x=>[x.id,x]))}
function customerMap(){return Object.fromEntries(state.customers.map(x=>[x.id,x]))}
function supplierMap(){return Object.fromEntries(state.suppliers.map(x=>[x.id,x]))}
function categoryMap(){return Object.fromEntries(state.categories.map(x=>[x.id,x]))}
function variantsFor(productId){return state.variants.filter(v=>v.product_id===productId&&v.active)}
function totalStock(productId){return variantsFor(productId).reduce((a,v)=>a+num(v.stock),0)}
function imageFor(p){return p?.image_url || 'assets/logo-deze7.png'}
function monthRange(month=monthISO()){
  const [y,m]=month.split('-').map(Number);return {start:new Date(y,m-1,1),end:new Date(y,m,1)};
}
function inRange(v,start,end){const d=new Date(v);return d>=start&&d<end}
function isBundle(p){return p?.inventory_mode==='bundle'||p?.category==='kit'}
function bundleRulesFor(productId){return state.bundleRules.filter(r=>r.bundle_product_id===productId).sort((a,b)=>num(a.sort_order)-num(b.sort_order))}
function eligibleBundleVariants(rule){
  const pm=productMap();
  return state.variants.filter(v=>{
    if(!v.active)return false;
    const p=pm[v.product_id];
    if(!p||!p.active)return false;
    if(p.category!==rule.allowed_category)return false;
    if(rule.allowed_product_id&&p.id!==rule.allowed_product_id)return false;
    return true;
  });
}
function bundleAvailability(productId){
  const rules=bundleRulesFor(productId);
  if(!rules.length)return 0;
  const values=rules.map(r=>{
    const total=eligibleBundleVariants(r).reduce((a,v)=>a+num(v.stock),0);
    return Math.floor(total/Math.max(1,num(r.quantity)));
  });
  return Math.max(0,Math.min(...values));
}
function productSubline(p){
  if(isBundle(p))return 'Kit montável';
  if(p.category==='camiseta')return `${p.color_name||''} · ${designLabel(p.design)}`;
  if(p.category==='acessorio')return 'Acessório';
  return p.category||'Produto';
}

async function init(){
  sb=await getSupabase();
  if(!sb){toast('Configuração do Supabase não encontrada.','error');return}
  $('today').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace('.','');
  $('expenseDate').value=todayISO(); $('reportMonth').value=monthISO();
  $('loginform').onsubmit=login;
  ensureBundleUI();
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
  const {data:{user}}=await sb.auth.getUser();
  currentUserEmail=(user?.email||'').trim().toLowerCase();
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
  const movementSelect=isAuditOwner()?'*':'id,variant_id,movement_type,quantity_delta,reason,reference_type,reference_id,created_at';
  const saleSelect=isAuditOwner()?'*':'id,sale_number,sale_date,customer_id,channel,payment_method,payment_status,status,subtotal,discount,total,cogs,notes,created_at,updated_at';
  const expenseSelect=isAuditOwner()?'*':'id,expense_date,due_date,paid_at,category_id,supplier_id,description,amount,payment_method,status,notes,created_at,updated_at';
  req.push(['products',sb.from('deze7_products').select('*').order('sort_order')]);
  req.push(['variants',sb.from('deze7_variants').select('*').order('sku')]);
  req.push(['bundleRules',sb.from('deze7_bundle_rules').select('*').order('sort_order')]);
  req.push(['movements',sb.from('deze7_stock_movements').select(movementSelect).order('created_at',{ascending:false}).limit(300)]);
  if(can('customer')) req.push(['customers',sb.from('deze7_customers').select('*').eq('active',true).order('name')]);
  if(['admin','manager','seller','finance'].includes(currentStaff.role)) req.push(['sales',sb.from('deze7_sales').select(saleSelect).order('sale_date',{ascending:false}).limit(1000)]);
  if(can('finance')){
    req.push(['expenses',sb.from('deze7_expenses').select(expenseSelect).order('expense_date',{ascending:false}).limit(1000)]);
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
  $('recentSales').innerHTML=rows.length?rows.map(s=>`<div class="activity-row"><div class="activity-icon">#${s.sale_number}</div><div><strong>${esc(cm[s.customer_id]?.name||'Venda balcão')}</strong><span>${dateTimeBR(s.sale_date)} · ${esc(s.channel)}</span>${auditActor(s.seller_id)}</div><b>${money(s.total)}</b></div>`).join(''):'<div class="empty-state compact">Nenhuma venda registrada ainda.</div>';
}

function renderSaleProducts(){
  if(!can('sell'))return;
  const q=$('saleProductSearch').value.trim().toLowerCase();
  const products=state.products.filter(p=>p.active&&p.sellable!==false&&(!q||`${p.name} ${p.color_name||''} ${designLabel(p.design)} ${p.category}`.toLowerCase().includes(q)));
  $('saleProductGrid').innerHTML=products.map(p=>{
    if(isBundle(p)){
      const available=bundleAvailability(p.id);
      return `<article class="pos-card bundle-pos-card">
        <div class="pos-image"><img src="${esc(imageFor(p))}" alt="${esc(p.name)}"><span class="design-chip">KIT MONTÁVEL</span></div>
        <div class="pos-card-body">
          <h3>${esc(p.name)}</h3>
          <div class="product-meta"><span>${available} possível${available===1?'':'is'} no estoque</span><strong>${money(p.price)}</strong></div>
          <button class="btn btn-primary full" data-build-bundle="${p.id}" ${available<=0?'disabled':''}>${available>0?'Montar kit':'Sem componentes'}</button>
        </div>
      </article>`;
    }
    const vs=variantsFor(p.id).sort((a,b)=>['P','M','G','GG','Único'].indexOf(a.size)-['P','M','G','GG','Único'].indexOf(b.size));
    const sizes=vs.map(v=>`<button class="size-stock ${num(v.stock)<=0?'soldout':''}" data-add-variant="${v.id}" ${num(v.stock)<=0?'disabled':''}><span>${esc(v.size||'-')}</span><small>${v.stock}</small></button>`).join('');
    return `<article class="pos-card"><div class="pos-image"><img src="${esc(imageFor(p))}" alt="${esc(p.name)}"><span class="design-chip">${esc(p.category==='camiseta'?designLabel(p.design):'PRODUTO')}</span></div><div class="pos-card-body"><h3>${esc(p.name)}</h3><div class="product-meta"><span>${esc(p.color_name||'')}</span><strong>${money(p.price)}</strong></div><div class="size-stock-row">${sizes}</div></div></article>`
  }).join('')||'<div class="empty-state">Nenhum produto encontrado.</div>';

  $$('[data-add-variant]').forEach(b=>b.onclick=()=>addVariantToSale(b.dataset.addVariant));
  $$('[data-build-bundle]').forEach(b=>b.onclick=()=>openBundleBuilder(b.dataset.buildBundle));
}

function addVariantToSale(id){
  const v=state.variants.find(x=>x.id===id),p=state.products.find(x=>x.id===v?.product_id);if(!v||!p||num(v.stock)<=0)return;
  const row=saleLines.find(x=>x.line_id===id);
  if(row){if(row.quantity>=num(v.stock)){toast('Quantidade máxima em estoque atingida.','warn');return}row.quantity++}
  else saleLines.push({line_id:id,product_id:p.id,variant_id:v.id,name:p.name,size:v.size,color:v.color,quantity:1,stock:num(v.stock),unit_price:num(p.price),image:imageFor(p),bundle:false});
  renderSaleCart();
}

function ensureBundleUI(){
  if(document.getElementById('bundleModal'))return;
  const style=document.createElement('style');
  style.textContent=`
    .bundle-modal{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:2000;display:grid;place-items:center;padding:18px}
    .bundle-modal.hidden{display:none}
    .bundle-dialog{width:min(720px,100%);max-height:90vh;overflow:auto;background:#111;border:1px solid #303030;border-radius:22px;padding:24px;box-shadow:0 30px 90px rgba(0,0,0,.55)}
    .bundle-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}
    .bundle-head h2{margin:4px 0 6px}.bundle-close{border:0;background:#222;color:#fff;border-radius:10px;width:40px;height:40px;font-size:23px}
    .bundle-product-preview{display:flex;gap:14px;align-items:center;padding:14px;border:1px solid #292929;border-radius:16px;background:#0d0d0d;margin-bottom:18px}
    .bundle-product-preview img{width:76px;height:76px;object-fit:cover;border-radius:12px;background:#1c1c1c}
    .bundle-product-preview strong{display:block;margin-bottom:5px}.bundle-product-preview span{color:#aaa;font-size:13px}
    .bundle-slot{padding:16px 0;border-top:1px solid #272727}.bundle-slot:first-of-type{border-top:0}
    .bundle-slot label{display:block;font-weight:800;margin-bottom:8px}.bundle-slot small{display:block;color:#999;margin-top:6px}
    .bundle-slot select{width:100%;background:#0a0a0a;color:#fff;border:1px solid #393939;border-radius:12px;padding:14px;font-size:15px}
    .bundle-actions{display:flex;gap:10px;margin-top:20px}.bundle-actions .btn{flex:1}
    .bundle-chip{display:inline-flex;padding:5px 9px;border-radius:999px;background:#2b1117;color:#ffb5c2;font-size:11px;font-weight:800;letter-spacing:.08em}
    @media(max-width:600px){.bundle-dialog{padding:18px;border-radius:18px}.bundle-actions{flex-direction:column}}
  `;
  document.head.appendChild(style);

  const modal=document.createElement('div');
  modal.id='bundleModal';
  modal.className='bundle-modal hidden';
  modal.innerHTML=`
    <div class="bundle-dialog">
      <div class="bundle-head">
        <div><span class="overline">MONTAR KIT</span><h2 id="bundleTitle">Kit DEZE7</h2><p id="bundleSubtitle" class="muted">Escolha os componentes que sairão do estoque.</p></div>
        <button id="bundleClose" class="bundle-close" type="button">×</button>
      </div>
      <div id="bundlePreview"></div>
      <div id="bundleSlots"></div>
      <div class="bundle-actions">
        <button id="bundleCancel" class="btn btn-secondary" type="button">Cancelar</button>
        <button id="bundleConfirm" class="btn btn-primary" type="button">Adicionar kit ao carrinho</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  $('bundleClose').onclick=closeBundleBuilder;
  $('bundleCancel').onclick=closeBundleBuilder;
  $('bundleConfirm').onclick=confirmBundle;
  modal.onclick=e=>{if(e.target===modal)closeBundleBuilder()};
}
function closeBundleBuilder(){
  bundleEditingProductId=null;
  $('bundleModal')?.classList.add('hidden');
}
function bundleOptionLabel(v){
  const p=productMap()[v.product_id]||{};
  const bits=[p.name,v.color,v.size].filter(Boolean);
  return `${bits.join(' · ')} — estoque ${v.stock}`;
}
function openBundleBuilder(productId){
  const p=productMap()[productId];
  if(!p)return;
  const rules=bundleRulesFor(productId);
  if(!rules.length){toast('Este kit ainda não tem composição configurada.','error');return}

  bundleEditingProductId=productId;
  $('bundleTitle').textContent=p.name;
  $('bundleSubtitle').textContent='Escolha exatamente as peças que serão baixadas do estoque.';
  $('bundlePreview').innerHTML=`<div class="bundle-product-preview"><img src="${esc(imageFor(p))}" alt=""><div><span class="bundle-chip">KIT MONTÁVEL</span><strong>${esc(p.name)}</strong><span>${money(p.price)} · estoque calculado pelos componentes</span></div></div>`;

  $('bundleSlots').innerHTML=rules.map(rule=>{
    const variants=eligibleBundleVariants(rule).filter(v=>num(v.stock)>=num(rule.quantity)).sort((a,b)=>bundleOptionLabel(a).localeCompare(bundleOptionLabel(b),'pt-BR'));
    const opts=variants.map(v=>`<option value="${v.id}">${esc(bundleOptionLabel(v))}</option>`).join('');
    return `<div class="bundle-slot">
      <label>${esc(rule.slot_label)}</label>
      <select data-bundle-slot="${esc(rule.slot_key)}" ${variants.length?'':'disabled'}>
        ${variants.length?`<option value="">Selecione...</option>${opts}`:'<option value="">Sem estoque disponível</option>'}
      </select>
      <small>${rule.allowed_category==='camiseta'?'Cor, logo e tamanho são escolhidos aqui.':'Este item será baixado junto com a camiseta.'}</small>
    </div>`;
  }).join('');

  $('bundleModal').classList.remove('hidden');
}
function confirmBundle(){
  const p=productMap()[bundleEditingProductId];
  if(!p)return;
  const rules=bundleRulesFor(p.id);
  const components=[];
  let maxQty=Infinity;
  let detail=[];

  for(const rule of rules){
    const select=document.querySelector(`[data-bundle-slot="${CSS.escape(rule.slot_key)}"]`);
    const variantId=select?.value;
    if(!variantId){toast(`Selecione: ${rule.slot_label}.`,'warn');return}
    const v=variantMap()[variantId],cp=productMap()[v?.product_id];
    if(!v||!cp||num(v.stock)<num(rule.quantity)){toast(`Sem estoque para ${rule.slot_label}.`,'error');return}
    const possible=Math.floor(num(v.stock)/Math.max(1,num(rule.quantity)));
    maxQty=Math.min(maxQty,possible);
    components.push({slot_key:rule.slot_key,variant_id:v.id});
    detail.push(`${cp.name} (${[v.color,v.size].filter(Boolean).join(' / ')})`);
  }

  const signature=components.map(c=>`${c.slot_key}:${c.variant_id}`).join('|');
  const lineId=`bundle:${p.id}:${signature}`;
  const existing=saleLines.find(x=>x.line_id===lineId);
  if(existing){
    if(existing.quantity>=maxQty){toast('Quantidade máxima disponível para essa combinação.','warn');return}
    existing.quantity++;
  }else{
    saleLines.push({
      line_id:lineId,
      product_id:p.id,
      variant_id:null,
      name:p.name,
      detail:detail.join(' + '),
      quantity:1,
      stock:maxQty,
      unit_price:num(p.price),
      image:imageFor(p),
      bundle:true,
      components
    });
  }

  closeBundleBuilder();
  renderSaleCart();
  toast('Kit montado e adicionado ao carrinho.');
}
function renderSaleCart(){
  const discount=Math.max(0,num($('saleDiscount')?.value));const subtotal=saleLines.reduce((a,x)=>a+x.quantity*x.unit_price,0),total=Math.max(0,subtotal-discount);
  $('saleItemCount').textContent=`${saleLines.reduce((a,x)=>a+x.quantity,0)} itens`;
  $('saleCartEmpty').classList.toggle('hidden',saleLines.length>0);
  $('saleCartList').innerHTML=saleLines.map(x=>{
    const detail=x.bundle?x.detail:`${x.color||''} · ${x.size||''}`;
    return `<div class="cart-line"><img src="${esc(x.image)}" alt=""><div class="cart-line-main"><strong>${esc(x.name)}</strong><span>${esc(detail)} · ${money(x.unit_price)}</span><div class="qty-control"><button data-dec-line="${esc(x.line_id)}">−</button><b>${x.quantity}</b><button data-inc-line="${esc(x.line_id)}">+</button></div></div><div class="cart-line-side"><strong>${money(x.quantity*x.unit_price)}</strong><button class="remove-btn" data-remove-line="${esc(x.line_id)}">×</button></div></div>`;
  }).join('');
  $('saleSubtotal').textContent=money(subtotal);$('saleDiscountValue').textContent=money(discount);$('saleTotal').textContent=money(total);$('finishSale').disabled=!saleLines.length;
  $$('[data-inc-line]').forEach(b=>b.onclick=()=>changeSaleQty(b.dataset.incLine,1));
  $$('[data-dec-line]').forEach(b=>b.onclick=()=>changeSaleQty(b.dataset.decLine,-1));
  $$('[data-remove-line]').forEach(b=>b.onclick=()=>{saleLines=saleLines.filter(x=>x.line_id!==b.dataset.removeLine);renderSaleCart()});
}
function changeSaleQty(lineId,delta){
  const x=saleLines.find(x=>x.line_id===lineId);if(!x)return;
  const next=x.quantity+delta;
  if(next<=0)saleLines=saleLines.filter(y=>y.line_id!==lineId);
  else if(next<=x.stock)x.quantity=next;
  else toast('Quantidade máxima em estoque atingida.','warn');
  renderSaleCart();
}
async function saveSale(){
  if(!saleLines.length)return;
  $('finishSale').disabled=true;$('finishSale').textContent='Registrando...';
  const items=saleLines.map(x=>x.bundle
    ? {product_id:x.product_id,quantity:x.quantity,unit_price:x.unit_price,components:x.components}
    : {product_id:x.product_id,variant_id:x.variant_id,quantity:x.quantity,unit_price:x.unit_price}
  );
  const {data,error}=await sb.rpc('deze7_create_internal_sale',{
    p_customer_id:$('saleCustomer').value||null,
    p_channel:$('saleChannel').value,
    p_payment_method:$('salePayment').value,
    p_payment_status:'paid',
    p_discount:num($('saleDiscount').value),
    p_notes:$('saleNotes').value.trim(),
    p_items:items
  });
  $('finishSale').textContent='Finalizar venda';
  if(error){$('finishSale').disabled=false;toast(error.message,'error');return}
  saleLines=[];$('saleDiscount').value='0';$('saleNotes').value='';await loadAll();toast('Venda registrada e estoque atualizado.');
}
function renderSalesHistory(){
  const q=$('salesSearch').value.trim().toLowerCase(),cm=customerMap();
  const rows=state.sales.filter(s=>!q||`${s.sale_number} ${cm[s.customer_id]?.name||''} ${s.channel}`.toLowerCase().includes(q));
  $('salesTable').innerHTML=rows.map(s=>{const margin=num(s.total)-num(s.cogs);return `<tr><td><b>#${s.sale_number}</b></td><td>${dateTimeBR(s.sale_date)}${auditActor(s.seller_id)}</td><td>${esc(cm[s.customer_id]?.name||'Balcão')}</td><td><span class="tag">${esc(s.channel)}</span></td><td><b>${money(s.total)}</b></td><td class="finance-col">${money(s.cogs)}</td><td class="finance-col"><span class="positive">${money(margin)}</span></td></tr>`}).join('')||`<tr><td colspan="7"><div class="empty-state compact">Nenhuma venda encontrada.</div></td></tr>`;
  applyRoleUI();
}

function renderProducts(){
  const q=$('productSearch').value.trim().toLowerCase();const rows=state.products.filter(p=>!q||`${p.name} ${p.color_name||''} ${p.category}`.toLowerCase().includes(q));
  $('productsGrid').innerHTML=rows.map(p=>{
    const bundle=isBundle(p);
    const stock=bundle?bundleAvailability(p.id):totalStock(p.id);
    const margin=(!bundle&&p.cost!=null)?num(p.price)-num(p.cost):null;
    const pct=margin==null||!num(p.price)?null:(margin/num(p.price))*100;
    return `<article class="product-card"><div class="product-photo"><img src="${esc(imageFor(p))}" alt="${esc(p.name)}"><div class="product-badges"><span>${esc(p.color_name||p.category)}</span>${bundle?'<span>Kit montável</span>':p.category==='camiseta'?`<span>${esc(designLabel(p.design))}</span>`:''}</div></div><div class="product-card-content"><div class="product-title-row"><h3>${esc(p.name)}</h3><span class="status-dot ${p.active?'on':'off'}"></span></div><div class="product-numbers"><div><span>Venda</span><strong>${money(p.price)}</strong></div><div class="finance-only"><span>Custo</span><strong>${bundle?'Dinâmico':p.cost==null?'—':money(p.cost)}</strong></div><div class="finance-only"><span>Margem</span><strong>${bundle?'Dinâmica':pct==null?'—':pct.toFixed(0)+'%'}</strong></div><div><span>${bundle?'Kits possíveis':'Estoque'}</span><strong>${stock}</strong></div></div>${can('product-edit')?`<button class="btn btn-secondary full" data-edit-product="${p.id}">Editar produto</button>`:''}</div></article>`
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
  if(id){
    const r=await sb.from('deze7_products').update(payload).eq('id',id);if(r.error)return toast(r.error.message,'error');
    const p=productMap()[id];
    if(!isBundle(p)){
      const vr=await sb.from('deze7_variants').update({color}).eq('product_id',id);if(vr.error)return toast(vr.error.message,'error')
    }
  }
  else {
    const slug=slugify(payload.name)+'-'+Date.now().toString().slice(-5);
    const r=await sb.from('deze7_products').insert({...payload,slug,sort_order:(state.products.length+1)*10,inventory_mode:payload.category==='kit'?'bundle':'stocked'}).select('id').single();
    if(r.error)return toast(r.error.message,'error');
    if(payload.category!=='kit'){
      const sizes=payload.category==='acessorio'?['Único']:['P','M','G'];
      for(const size of sizes){
        const sku='D7-'+Date.now().toString().slice(-6)+'-'+size.replace(/\W/g,'').slice(0,2).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase();
        const vr=await sb.from('deze7_variants').insert({product_id:r.data.id,sku,size,color:color||'Padrão',stock:0,min_stock:3,active:true});
        if(vr.error)return toast(vr.error.message,'error')
      }
    }
  }
  closeProductEditor();e.target.reset();await loadAll();toast('Produto salvo.');
}

function renderStock(){
  const q=$('stockSearch').value.trim().toLowerCase(),pm=productMap();const active=state.variants.filter(v=>v.active),zero=active.filter(v=>num(v.stock)===0),low=active.filter(v=>num(v.stock)>0&&num(v.stock)<=num(v.min_stock??3));
  $('stockTotal').textContent=active.reduce((a,v)=>a+num(v.stock),0);$('stockZero').textContent=zero.length;$('stockLow').textContent=low.length;$('stockProducts').textContent=state.products.filter(p=>p.active&&!isBundle(p)).length;
  const products=state.products.filter(p=>!isBundle(p)&&(!q||`${p.name} ${p.color_name||''} ${variantsFor(p.id).map(v=>v.sku).join(' ')}`.toLowerCase().includes(q)));
  $('stockCards').innerHTML=products.map(p=>{
    const vs=variantsFor(p.id);if(!vs.length)return '';
    const descriptor=p.category==='camiseta'?`${p.color_name||''} · ${designLabel(p.design)}`:p.category==='acessorio'?'Acessório físico':productSubline(p);
    return `<div class="stock-product"><div class="stock-product-info"><img src="${esc(imageFor(p))}" alt=""><div><strong>${esc(p.name)}</strong><span>${esc(descriptor)}</span><small>${vs.map(v=>esc(v.sku)).join(' · ')}</small></div></div><div class="stock-sizes">${vs.sort((a,b)=>String(a.size).localeCompare(String(b.size))).map(v=>`<div class="stock-size-card ${num(v.stock)===0?'zero':num(v.stock)<=num(v.min_stock??3)?'low':''}"><span>${esc(v.size||'-')}</span><strong>${v.stock}</strong><small>unidades</small>${can('stock')?`<button class="text-btn" data-adjust-stock="${v.id}">Ajustar</button>`:''}</div>`).join('')}</div></div>`
  }).join('')||'<div class="empty-state">Nenhum produto encontrado.</div>';
  $$('[data-adjust-stock]').forEach(b=>b.onclick=()=>adjustStock(b.dataset.adjustStock));
  const vm=variantMap();$('movementTable').innerHTML=state.movements.slice(0,150).map(m=>{const v=vm[m.variant_id],p=v&&pm[v.product_id];return `<tr><td>${dateTimeBR(m.created_at)}</td><td>${esc(p?.name||'-')} · ${esc(v?.size||'')}</td><td><span class="tag">${esc(m.movement_type)}</span></td><td class="${num(m.quantity_delta)>0?'positive':'negative'}"><b>${num(m.quantity_delta)>0?'+':''}${m.quantity_delta}</b></td><td>${esc(m.reason||'-')}${auditActor(m.created_by)}</td></tr>`}).join('')||`<tr><td colspan="5"><div class="empty-state compact">Nenhuma movimentação.</div></td></tr>`;
}
async function adjustStock(id){
  if(!can('stock'))return;const v=variantMap()[id],p=productMap()[v.product_id];const target=prompt(`${p.name} · ${v.size}\nEstoque atual: ${v.stock}\nDigite o NOVO saldo:`);if(target===null)return;const next=Math.max(0,parseInt(target,10)||0),delta=next-num(v.stock);if(!delta)return;const reason=prompt('Motivo do ajuste:','Ajuste pelo painel')||'Ajuste pelo painel';const {error}=await sb.rpc('deze7_adjust_stock',{p_variant_id:id,p_quantity_delta:delta,p_reason:reason,p_movement_type:'adjustment'});if(error)return toast(error.message,'error');await loadAll();toast('Estoque atualizado.');
}

function renderExpenses(){
  if(!can('finance'))return;const q=$('expenseSearch').value.trim().toLowerCase(),{start,end}=monthRange(),month=state.expenses.filter(e=>e.status!=='cancelled'&&inRange(e.expense_date+'T12:00:00',start,end));
  const paid=month.filter(e=>e.status==='paid').reduce((a,e)=>a+num(e.amount),0),pending=state.expenses.filter(e=>e.status==='pending').reduce((a,e)=>a+num(e.amount),0),total=month.reduce((a,e)=>a+num(e.amount),0);
  $('expensePaidMonth').textContent=money(paid);$('expensePending').textContent=money(pending);$('expenseMonthTotal').textContent=money(total);
  const cm=categoryMap(),sm=supplierMap();const rows=state.expenses.filter(e=>!q||`${e.description} ${cm[e.category_id]?.name||''} ${sm[e.supplier_id]?.name||''}`.toLowerCase().includes(q));
  $('expensesList').innerHTML=rows.map(e=>`<div class="finance-row"><div class="finance-date"><b>${dateBR(e.expense_date+'T12:00:00')}</b><span>${e.status==='paid'?'Pago':'Pendente'}</span></div><div class="finance-desc"><strong>${esc(e.description)}</strong><span>${esc(cm[e.category_id]?.name||'Sem categoria')} · ${esc(sm[e.supplier_id]?.name||'Sem fornecedor')}</span>${auditActor(e.created_by)}</div><div class="finance-value">${money(e.amount)}</div></div>`).join('')||'<div class="empty-state compact">Nenhuma despesa encontrada.</div>';
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
