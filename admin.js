import {getSupabase} from './supabase-client.js';

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const num=v=>Number(v||0);
const isoDate=d=>new Date(d).toLocaleDateString('pt-BR');
const isoDateTime=d=>new Date(d).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const slugify=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const todayISO=()=>new Date().toISOString().slice(0,10);
const monthISO=()=>new Date().toISOString().slice(0,7);

let sb, currentStaff=null;
let state={products:[],variants:[],sales:[],expenses:[],customers:[],suppliers:[],categories:[],movements:[]};
let saleLines=[];
const productMap=()=>Object.fromEntries(state.products.map(p=>[p.id,p]));
const variantMap=()=>Object.fromEntries(state.variants.map(v=>[v.id,v]));
const customerMap=()=>Object.fromEntries(state.customers.map(x=>[x.id,x]));
const supplierMap=()=>Object.fromEntries(state.suppliers.map(x=>[x.id,x]));
const categoryMap=()=>Object.fromEntries(state.categories.map(x=>[x.id,x]));

async function init(){
  sb=await getSupabase();
  if(!sb){alert('Configuração do banco não encontrada.');return}
  $('today').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  $('expenseDate').value=todayISO();$('reportMonth').value=monthISO();
  $('loginform').onsubmit=login;
  const {data:{session}}=await sb.auth.getSession();
  if(session) await authorize(session.user.id);
}
async function login(e){e.preventDefault();const {data,error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)return alert(error.message);await authorize(data.user.id)}
async function authorize(uid){
  const {data,error}=await sb.from('deze7_staff').select('user_id,name,role,active').eq('user_id',uid).eq('active',true).maybeSingle();
  if(error||!data){await sb.auth.signOut();alert('Seu usuário não está autorizado no sistema interno da DEZE7.');return}
  currentStaff=data;$('staffName').textContent=data.name||'Equipe DEZE7';$('staffRole').textContent=roleLabel(data.role);
  $('loginbox').classList.add('hidden');$('mgmt').classList.remove('hidden');
  bindUI();await loadAll();showView('dashboard');
}
function roleLabel(r){return {admin:'Administrador',manager:'Gestor',seller:'Vendedor',finance:'Financeiro',stock:'Estoque'}[r]||r}
function bindUI(){
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
  $('logout').onclick=()=>sb.auth.signOut().then(()=>location.reload());
  $('menuBtn').onclick=()=>document.querySelector('.mgmt-sidebar').classList.toggle('open');
  $('saleVariant').onchange=syncSalePrice;$('addSaleItem').onclick=addSaleLine;$('saleForm').onsubmit=saveSale;
  $('productForm').onsubmit=saveProduct;$('clearProduct').onclick=clearProduct;
  $('expenseForm').onsubmit=saveExpense;$('customerForm').onsubmit=saveCustomer;$('supplierForm').onsubmit=saveSupplier;
  $('reportMonth').onchange=renderReports;
  $('salesSearch').oninput=renderSales;$('expenseSearch').oninput=renderExpenses;$('customerSearch').oninput=renderCustomers;
}
async function loadAll(){
  const [pr,vr,sr,er,cr,supr,catr,mr]=await Promise.all([
    sb.from('deze7_products').select('*').order('sort_order'),
    sb.from('deze7_variants').select('*').order('sku'),
    sb.from('deze7_sales').select('*').order('sale_date',{ascending:false}).limit(500),
    sb.from('deze7_expenses').select('*').order('expense_date',{ascending:false}).limit(500),
    sb.from('deze7_customers').select('*').order('name'),
    sb.from('deze7_suppliers').select('*').order('name'),
    sb.from('deze7_expense_categories').select('*').eq('active',true).order('sort_order'),
    sb.from('deze7_stock_movements').select('*').order('created_at',{ascending:false}).limit(200)
  ]);
  const bad=[pr,vr,sr,er,cr,supr,catr,mr].find(x=>x.error);if(bad)return alert(bad.error.message);
  state={products:pr.data||[],variants:vr.data||[],sales:sr.data||[],expenses:er.data||[],customers:cr.data||[],suppliers:supr.data||[],categories:catr.data||[],movements:mr.data||[]};
  renderAll();
}
function showView(view){
  document.querySelectorAll('.mgmt-view').forEach(x=>x.classList.add('hidden'));$('view-'+view).classList.remove('hidden');
  document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  const titles={dashboard:'Visão geral',sales:'Vendas',products:'Produtos',stock:'Estoque',expenses:'Despesas',customers:'Clientes',suppliers:'Fornecedores',reports:'Relatórios'};
  $('viewTitle').textContent=titles[view];$('viewEyebrow').textContent=view==='dashboard'?'GESTÃO':'DEZE7 / '+titles[view].toUpperCase();document.querySelector('.mgmt-sidebar').classList.remove('open');
}
function renderAll(){renderDashboard();renderLookups();renderSales();renderProducts();renderStock();renderExpenses();renderCustomers();renderSuppliers();renderReports()}
function monthRange(month=monthISO()){const [y,m]=month.split('-').map(Number);const start=new Date(y,m-1,1);const end=new Date(y,m,1);return {start,end}}
function inRange(d,start,end){const x=new Date(d);return x>=start&&x<end}
function renderDashboard(){
  const {start,end}=monthRange();const monthSales=state.sales.filter(s=>s.status!=='cancelled'&&s.payment_status!=='cancelled'&&inRange(s.sale_date,start,end));const monthExpenses=state.expenses.filter(e=>e.status!=='cancelled'&&inRange(e.expense_date+'T12:00:00',start,end));
  const revenue=monthSales.reduce((a,s)=>a+num(s.total),0),cogs=monthSales.reduce((a,s)=>a+num(s.cogs),0),expenses=monthExpenses.reduce((a,e)=>a+num(e.amount),0);
  const stock=state.variants.filter(v=>v.active).reduce((a,v)=>a+num(v.stock),0);const low=state.variants.filter(v=>v.active&&num(v.stock)<=3).length;const today=todayISO();const todaySales=state.sales.filter(s=>s.status!=='cancelled'&&String(s.sale_date).slice(0,10)===today).length;
  $('kpiRevenue').textContent=money(revenue);$('kpiProfit').textContent=money(revenue-cogs-expenses);$('kpiExpenses').textContent=money(expenses);$('kpiStock').textContent=stock;$('kpiToday').textContent=todaySales;$('kpiLow').textContent=low;
  $('dashSales').innerHTML=state.sales.slice(0,6).map(s=>`<tr><td>#${s.sale_number}</td><td>${isoDateTime(s.sale_date)}</td><td>${money(s.total)}</td></tr>`).join('')||empty(3);
  const pm=productMap();$('dashLowStock').innerHTML=state.variants.filter(v=>v.active&&num(v.stock)<=3).sort((a,b)=>num(a.stock)-num(b.stock)).slice(0,8).map(v=>`<tr><td>${pm[v.product_id]?.name||'-'}</td><td>${v.size||'-'}</td><td><span class="stock-badge ${num(v.stock)===0?'zero':'low'}">${v.stock}</span></td></tr>`).join('')||'<tr><td colspan="3">Nenhum item com estoque baixo.</td></tr>';
}
function renderLookups(){
  $('saleCustomer').innerHTML='<option value="">Venda sem cliente</option>'+state.customers.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  const pm=productMap();$('saleVariant').innerHTML='<option value="">Selecione</option>'+state.variants.filter(v=>v.active&&num(v.stock)>0&&pm[v.product_id]?.active).map(v=>`<option value="${v.id}">${esc(pm[v.product_id]?.name||'')} · ${esc(v.color||'')} · ${esc(v.size||'')} · estoque ${v.stock}</option>`).join('');
  $('expenseCategory').innerHTML=state.categories.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('expenseSupplier').innerHTML='<option value="">Sem fornecedor</option>'+state.suppliers.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');syncSalePrice();
}
function syncSalePrice(){const v=variantMap()[$('saleVariant').value];const p=v&&productMap()[v.product_id];$('saleUnitPrice').value=p?Number(p.price).toFixed(2):''}
function addSaleLine(){const v=variantMap()[$('saleVariant').value];if(!v)return alert('Selecione um produto e tamanho.');const p=productMap()[v.product_id];const qty=Math.max(1,num($('saleQty').value));if(qty>num(v.stock))return alert('Quantidade maior que o estoque disponível.');const price=num($('saleUnitPrice').value);const existing=saleLines.find(x=>x.variant_id===v.id&&x.unit_price===price);if(existing){if(existing.quantity+qty>num(v.stock))return alert('Quantidade total maior que o estoque.');existing.quantity+=qty}else saleLines.push({product_id:p.id,variant_id:v.id,product_name:p.name,variant_label:[v.color,v.size].filter(Boolean).join(' · '),quantity:qty,unit_price:price});renderSaleLines()}
function renderSaleLines(){const discount=num($('saleDiscount').value);$('saleItems').innerHTML=saleLines.map((x,i)=>`<tr><td>${esc(x.product_name)}<div class="meta">${esc(x.variant_label)}</div></td><td>${x.quantity}</td><td>${money(x.unit_price)}</td><td>${money(x.unit_price*x.quantity)}</td><td><button type="button" class="ghost" data-remove-sale="${i}">Remover</button></td></tr>`).join('')||empty(5);document.querySelectorAll('[data-remove-sale]').forEach(b=>b.onclick=()=>{saleLines.splice(Number(b.dataset.removeSale),1);renderSaleLines()});const subtotal=saleLines.reduce((a,x)=>a+x.quantity*x.unit_price,0);$('saleTotal').textContent=money(Math.max(0,subtotal-discount))}
async function saveSale(e){e.preventDefault();if(!saleLines.length)return alert('Adicione pelo menos um item.');const {error}=await sb.rpc('deze7_create_internal_sale',{p_customer_id:$('saleCustomer').value||null,p_channel:$('saleChannel').value,p_payment_method:$('salePayment').value,p_payment_status:'paid',p_discount:num($('saleDiscount').value),p_notes:$('saleNotes').value.trim(),p_items:saleLines.map(x=>({product_id:x.product_id,variant_id:x.variant_id,quantity:x.quantity,unit_price:x.unit_price}))});if(error)return alert(error.message);saleLines=[];$('saleForm').reset();$('saleDiscount').value='0';renderSaleLines();await loadAll();alert('Venda registrada e estoque atualizado.')}
function renderSales(){const q=$('salesSearch').value.trim().toLowerCase(),cm=customerMap();const rows=state.sales.filter(s=>{const txt=`${s.sale_number} ${cm[s.customer_id]?.name||''}`.toLowerCase();return !q||txt.includes(q)});$('salesTable').innerHTML=rows.map(s=>{const margin=num(s.total)-num(s.cogs);return `<tr><td>#${s.sale_number}</td><td>${isoDateTime(s.sale_date)}</td><td>${esc(cm[s.customer_id]?.name||'Balcão')}</td><td>${esc(s.channel)}</td><td>${money(s.total)}</td><td>${money(s.cogs)}</td><td>${money(margin)}</td></tr>`}).join('')||empty(7)}
function renderProducts(){$('productsTable').innerHTML=state.products.map(p=>{const margin=num(p.price)-num(p.cost);const perc=num(p.price)>0?margin/num(p.price)*100:0;return `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.cost==null?'<span class="warn">Preencher</span>':money(p.cost)}</td><td>${p.cost==null?'-':money(margin)+' · '+perc.toFixed(0)+'%'}</td><td>${p.active?'Ativo':'Inativo'}</td><td><button class="ghost" data-edit-product="${p.id}">Editar</button></td></tr>`}).join('')||empty(7);document.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct))}
function editProduct(id){const p=state.products.find(x=>x.id===id);if(!p)return;$('productId').value=p.id;$('productName').value=p.name;$('productCategory').value=p.category;$('productActive').value=String(p.active);$('productPrice').value=p.price;$('productCost').value=p.cost??'';$('productDescription').value=p.description||'';$('productColor').value=state.variants.find(v=>v.product_id===p.id)?.color||'';window.scrollTo({top:0,behavior:'smooth'})}
function clearProduct(){$('productForm').reset();$('productId').value='';$('productActive').value='true'}
async function saveProduct(e){e.preventDefault();const id=$('productId').value;const payload={name:$('productName').value.trim(),category:$('productCategory').value,active:$('productActive').value==='true',price:num($('productPrice').value),cost:$('productCost').value===''?null:num($('productCost').value),description:$('productDescription').value.trim()};if(id){let r=await sb.from('deze7_products').update(payload).eq('id',id);if(r.error)return alert(r.error.message);await sb.from('deze7_variants').update({color:$('productColor').value.trim()}).eq('product_id',id)}else{const slug=slugify(payload.name)+'-'+Date.now().toString().slice(-5);let r=await sb.from('deze7_products').insert({...payload,slug,sort_order:(state.products.length+1)*10}).select('id').single();if(r.error)return alert(r.error.message);for(const size of ['P','M','G']){const sku='D7-'+Date.now().toString().slice(-6)+'-'+size+'-'+Math.random().toString(36).slice(2,5).toUpperCase();const v=await sb.from('deze7_variants').insert({product_id:r.data.id,sku,size,color:$('productColor').value.trim(),stock:0,active:true});if(v.error)return alert(v.error.message)}}clearProduct();await loadAll();alert('Produto salvo no cadastro interno.')}
function renderStock(){const pm=productMap();$('stockTable').innerHTML=state.variants.map(v=>`<tr><td>${esc(pm[v.product_id]?.name||'-')}</td><td>${esc(v.color||'-')}</td><td>${esc(v.size||'-')}</td><td>${esc(v.sku)}</td><td><strong>${v.stock}</strong></td><td><div class="stock-adjust"><input type="number" value="1" data-stock-qty="${v.id}"><select data-stock-type="${v.id}"><option value="purchase">Entrada</option><option value="adjustment">Ajuste</option><option value="return">Devolução</option></select><input placeholder="Motivo" data-stock-reason="${v.id}"><button class="ghost" data-stock-add="${v.id}">Aplicar</button></div></td></tr>`).join('')||empty(6);document.querySelectorAll('[data-stock-add]').forEach(b=>b.onclick=()=>adjustStock(b.dataset.stockAdd));const vm=variantMap();$('movementTable').innerHTML=state.movements.map(m=>{const v=vm[m.variant_id],p=v&&pm[v.product_id];return `<tr><td>${isoDateTime(m.created_at)}</td><td>${esc(p?.name||'-')} · ${esc(v?.size||'')}</td><td>${esc(m.movement_type)}</td><td class="${num(m.quantity_delta)>0?'ok':'danger'}">${num(m.quantity_delta)>0?'+':''}${m.quantity_delta}</td><td>${esc(m.reason||'-')}</td></tr>`}).join('')||empty(5)}
async function adjustStock(id){let qty=num(document.querySelector(`[data-stock-qty="${id}"]`).value);const type=document.querySelector(`[data-stock-type="${id}"]`).value;const reason=document.querySelector(`[data-stock-reason="${id}"]`).value.trim();if(!qty)return alert('Informe a quantidade.');if(type==='adjustment'){const v=variantMap()[id];const target=prompt(`Estoque atual: ${v.stock}. Digite o novo saldo:`);if(target===null)return;qty=num(target)-num(v.stock);if(!qty)return}const {error}=await sb.rpc('deze7_adjust_stock',{p_variant_id:id,p_quantity_delta:qty,p_reason:reason||'Ajuste pelo painel',p_movement_type:type});if(error)return alert(error.message);await loadAll()}
async function saveExpense(e){e.preventDefault();const payload={expense_date:$('expenseDate').value,category_id:$('expenseCategory').value||null,supplier_id:$('expenseSupplier').value||null,description:$('expenseDescription').value.trim(),amount:num($('expenseAmount').value),payment_method:$('expensePayment').value,status:$('expenseStatus').value,created_by:currentStaff.user_id};const {error}=await sb.from('deze7_expenses').insert(payload);if(error)return alert(error.message);e.target.reset();$('expenseDate').value=todayISO();await loadAll();alert('Despesa registrada.')}
function renderExpenses(){const q=$('expenseSearch').value.trim().toLowerCase(),cm=categoryMap(),sm=supplierMap();$('expensesTable').innerHTML=state.expenses.filter(e=>!q||e.description.toLowerCase().includes(q)).map(e=>`<tr><td>${isoDate(e.expense_date+'T12:00:00')}</td><td>${esc(cm[e.category_id]?.name||'-')}</td><td>${esc(e.description)}</td><td>${esc(sm[e.supplier_id]?.name||'-')}</td><td>${money(e.amount)}</td><td>${e.status==='paid'?'Pago':'Pendente'}</td></tr>`).join('')||empty(6)}
async function saveCustomer(e){e.preventDefault();const {error}=await sb.from('deze7_customers').insert({name:$('customerName').value.trim(),phone:$('customerPhone').value.trim(),email:$('customerEmail').value.trim()||null,city:$('customerCity').value.trim()});if(error)return alert(error.message);e.target.reset();await loadAll()}
function renderCustomers(){const q=$('customerSearch').value.trim().toLowerCase();$('customersTable').innerHTML=state.customers.filter(c=>!q||`${c.name} ${c.phone||''} ${c.email||''}`.toLowerCase().includes(q)).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone||'-')}</td><td>${esc(c.email||'-')}</td><td>${esc(c.city||'-')}</td></tr>`).join('')||empty(4)}
async function saveSupplier(e){e.preventDefault();const {error}=await sb.from('deze7_suppliers').insert({name:$('supplierName').value.trim(),contact_name:$('supplierContact').value.trim(),phone:$('supplierPhone').value.trim(),email:$('supplierEmail').value.trim()||null});if(error)return alert(error.message);e.target.reset();await loadAll()}
function renderSuppliers(){$('suppliersTable').innerHTML=state.suppliers.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.contact_name||'-')}</td><td>${esc(s.phone||'-')}</td><td>${esc(s.email||'-')}</td></tr>`).join('')||empty(4)}
function renderReports(){const m=$('reportMonth').value||monthISO(),{start,end}=monthRange(m);const sales=state.sales.filter(s=>s.status!=='cancelled'&&s.payment_status!=='cancelled'&&inRange(s.sale_date,start,end)),expenses=state.expenses.filter(e=>e.status!=='cancelled'&&inRange(e.expense_date+'T12:00:00',start,end));const revenue=sales.reduce((a,s)=>a+num(s.total),0),cogs=sales.reduce((a,s)=>a+num(s.cogs),0),exp=expenses.reduce((a,e)=>a+num(e.amount),0),profit=revenue-cogs-exp;$('repRevenue').textContent=money(revenue);$('repCogs').textContent=money(cogs);$('repExpenses').textContent=money(exp);$('repProfit').textContent=money(profit);$('repMargin').textContent=(revenue?profit/revenue*100:0).toFixed(1)+'%';const channels={};sales.forEach(s=>channels[s.channel]=(channels[s.channel]||0)+num(s.total));$('channelReport').innerHTML=reportRows(channels,revenue);const cm=categoryMap(),cats={};expenses.forEach(e=>{const k=cm[e.category_id]?.name||'Sem categoria';cats[k]=(cats[k]||0)+num(e.amount)});$('expenseReport').innerHTML=reportRows(cats,exp)}
function reportRows(obj,total){const rows=Object.entries(obj).sort((a,b)=>b[1]-a[1]);return rows.length?rows.map(([k,v])=>`<div class="report-row"><span>${esc(k)}</span><strong>${money(v)}</strong><small>${total?(v/total*100).toFixed(0):0}%</small></div>`).join(''):'<p class="meta">Sem movimentação no período.</p>'}
function empty(n){return `<tr><td colspan="${n}" class="meta">Nenhum registro.</td></tr>`}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

$('saleDiscount').addEventListener('input',renderSaleLines);
init();
