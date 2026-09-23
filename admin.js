import {getSupabase} from './supabase-client.js';
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const $=id=>document.getElementById(id);let sb=null;let rows=[];let orders=[];
const slugify=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

async function init(){
  sb=await getSupabase();
  if(!sb){$('setup').classList.remove('hidden');$('loginbox').classList.add('hidden');return}
  const {data:{session}}=await sb.auth.getSession();
  if(session) await authorize(session.user.id); else $('loginform').onsubmit=login;
}
async function login(e){
  e.preventDefault();
  const {data,error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});
  if(error)return alert(error.message);
  await authorize(data.user.id);
}
async function authorize(userId){
  const {data,error}=await sb.from('deze7_admins').select('user_id').eq('user_id',userId).maybeSingle();
  if(error||!data){await sb.auth.signOut();alert('Esta conta não está autorizada como administradora da DEZE7.');return}
  await showApp();
}
async function showApp(){
  $('loginbox').classList.add('hidden');$('app').classList.remove('hidden');
  $('logout').onclick=()=>sb.auth.signOut().then(()=>location.reload());
  $('productform').onsubmit=save;
  await load();
}
async function load(){
  const {data,error}=await sb.from('deze7_products').select('*,deze7_variants(id,sku,size,color,stock,active)').order('sort_order');
  if(error)return alert(error.message);
  rows=data||[];
  const ord=await sb.from('deze7_orders').select('id,order_number,customer_name,customer_phone,total,status,created_at').order('created_at',{ascending:false}).limit(100);
  if(ord.error)return alert(ord.error.message);
  orders=ord.data||[];
  render();renderOrders();
  $('statProducts').textContent=rows.length;
  $('statStock').textContent=rows.reduce((s,p)=>s+(p.deze7_variants||[]).reduce((a,v)=>a+Number(v.stock||0),0),0);
  $('statOrders').textContent=orders.length;
  $('statRevenue').textContent=money(orders.filter(o=>!['cancelado'].includes(o.status)).reduce((s,o)=>s+Number(o.total||0),0));
}
function stockOf(p,size){return Number((p.deze7_variants||[]).find(v=>v.size===size)?.stock||0)}
function render(){
  $('products').innerHTML=rows.map(p=>{const ps=stockOf(p,'P'),ms=stockOf(p,'M'),gs=stockOf(p,'G');return `<tr><td>${p.name}</td><td>${p.category}</td><td>${money(p.price)}</td><td>${ps}</td><td>${ms}</td><td>${gs}</td><td>${ps+ms+gs}</td><td>${p.active?'Ativo':'Oculto'}</td><td><button class="ghost" data-edit="${p.id}">Editar</button></td></tr>`}).join('');
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(b.dataset.edit));
}
function renderOrders(){
  const statuses=['novo','confirmado','pago','separacao','enviado','concluido','cancelado'];
  $('orders').innerHTML=orders.map(o=>`<tr><td>#${o.order_number||String(o.id).slice(0,8)}</td><td>${o.customer_name}<div class="meta">${o.customer_phone}</div></td><td>${new Date(o.created_at).toLocaleString('pt-BR')}</td><td>${money(o.total)}</td><td><select data-order-status="${o.id}">${statuses.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="5">Nenhum pedido.</td></tr>';
  document.querySelectorAll('[data-order-status]').forEach(s=>s.onchange=async()=>{
    const {error}=await sb.from('deze7_orders').update({status:s.value}).eq('id',s.dataset.orderStatus);
    if(error){alert(error.message);await load()}
  });
}
function edit(id){
  const p=rows.find(x=>String(x.id)===id);if(!p)return;
  $('pid').value=p.id;$('name').value=p.name;$('type').value=p.category;$('color').value=(p.deze7_variants||[])[0]?.color||'';$('price').value=p.price;$('cost').value=p.cost??'';$('stockP').value=stockOf(p,'P');$('stockM').value=stockOf(p,'M');$('stockG').value=stockOf(p,'G');$('active').value=String(p.active);scrollTo({top:0,behavior:'smooth'});
}
async function save(e){
  e.preventDefault();
  let id=$('pid').value;
  const color=$('color').value.trim();
  const payload={name:$('name').value.trim(),category:$('type').value,price:Number($('price').value),cost:$('cost').value===''?null:Number($('cost').value),active:$('active').value==='true'};
  if(!payload.name)return;
  if(id){
    const {error}=await sb.from('deze7_products').update(payload).eq('id',id);if(error)return alert(error.message);
  }else{
    const slug=slugify(payload.name)+'-'+Date.now().toString().slice(-5);
    const {data,error}=await sb.from('deze7_products').insert({...payload,slug,description:'',sort_order:rows.length*10+10}).select('id').single();if(error)return alert(error.message);id=data.id;
  }
  const stocks={P:Number($('stockP').value||0),M:Number($('stockM').value||0),G:Number($('stockG').value||0)};
  const current=rows.find(p=>p.id===id)?.deze7_variants||[];
  for(const size of ['P','M','G']){
    const found=current.find(v=>v.size===size);
    if(found){const {error}=await sb.from('deze7_variants').update({color,stock:stocks[size],active:true}).eq('id',found.id);if(error)return alert(error.message)}
    else {const sku='D7-'+Date.now().toString().slice(-7)+'-'+size+'-'+Math.random().toString(36).slice(2,5).toUpperCase();const {error}=await sb.from('deze7_variants').insert({product_id:id,sku,size,color,stock:stocks[size],active:true});if(error)return alert(error.message)}
  }
  e.target.reset();$('pid').value='';await load();
}
init();
