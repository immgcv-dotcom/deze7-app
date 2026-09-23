import {loadProducts,createOrder} from './supabase-client.js';
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
let products=[];let cart=[];
const el=id=>document.getElementById(id);
function shirtColor(name){return {'Preta':'#171717','Branca':'#eee','Off-white':'#ded9cc','Cinza':'#777'}[name]||'#222'}
function availableVariant(p,size){return (p.variants||[]).find(v=>v.size===size&&v.active&&Number(v.stock)>0)}
function render(){
  const kits=products.filter(p=>p.type==='kit');
  const tees=products.filter(p=>p.type==='camiseta');
  el('kits').innerHTML=kits.map(card).join('');
  el('tees').innerHTML=tees.map(card).join('');
  document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{
    if(b.disabled)return;
    const parent=b.closest('.card');
    parent.querySelectorAll('[data-size]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  });
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add,b.closest('.card')));
}
function card(p){
  const visual=p.image?`<div class="cardimg"><img src="${p.image}" alt="${p.name}"></div>`:`<div class="product-visual"><div class="shirt" style="background:${shirtColor(p.color)}"><span class="shirtlogo">D7</span></div></div>`;
  const sizes=(p.sizes||['P','M','G']);
  const live=!!(p.variants||[]).length;
  const sizeBtns=sizes.map(s=>{
    const v=(p.variants||[]).find(x=>x.size===s&&x.active);
    const disabled=live && (!v || Number(v.stock)<=0);
    const label=disabled?`${s} · esgotado`:s;
    return `<button class="sizebtn" data-size="${s}" ${disabled?'disabled':''}>${label}</button>`;
  }).join('');
  const hasStock=!live || (p.variants||[]).some(v=>v.active&&Number(v.stock)>0);
  return `<article class="card">${visual}<div class="cardbody"><div class="kicker">${p.type==='kit'?'KIT DEZE7':'ESSENCIAL'}</div><h3>${p.name}</h3><div class="meta">${p.color||''} · Modelagem regular · P, M e G</div><div class="price">${money(p.price)}</div><div class="row" style="margin-top:16px">${sizeBtns}</div><button class="primary" style="margin-top:16px;width:100%" data-add="${p.id}" ${hasStock?'':'disabled'}>${hasStock?'Adicionar à sacola':'Sem estoque'}</button></div></article>`;
}
function add(id,cardEl){
  const p=products.find(x=>String(x.id)===id);if(!p)return;
  const size=cardEl.querySelector('[data-size].active')?.dataset.size;
  if(!size){alert('Escolha um tamanho disponível.');return}
  const variant=availableVariant(p,size);
  if((p.variants||[]).length && !variant){alert('Esse tamanho está sem estoque.');return}
  const variantId=variant?.id||null;
  const key=id+'-'+size;
  const ex=cart.find(x=>x.key===key);
  const max=variant?Number(variant.stock):999;
  if(ex){if(ex.qty>=max)return alert('Quantidade máxima em estoque atingida.');ex.qty++}
  else cart.push({key,product:p,size,variantId,qty:1,max});
  renderCart();openCart();
}
function renderCart(){
  el('cartCount').textContent=cart.reduce((a,b)=>a+b.qty,0);
  el('cartItems').innerHTML=cart.length?cart.map(i=>`<div class="cartitem"><strong>${i.product.name}</strong><div class="meta">Tam. ${i.size} · ${i.qty} un.</div><div>${money(i.product.price*i.qty)}</div></div>`).join(''):'<p class="meta">Sua sacola está vazia.</p>';
  el('cartTotal').textContent=money(cart.reduce((s,i)=>s+i.product.price*i.qty,0));
}
function openCart(){el('drawer').classList.add('open')} function closeCart(){el('drawer').classList.remove('open')}
el('bagBtn').onclick=openCart;el('closeCart').onclick=closeCart;
el('checkout').onclick=async()=>{
  if(!cart.length)return;
  const name=prompt('Seu nome para o pedido:');
  const phone=prompt('WhatsApp com DDD:');
  if(!name||!phone)return;
  const email=prompt('E-mail (opcional):')||'';
  const payload={customer:{name,phone,email},items:cart.map(i=>({product_id:i.product.id,variant_id:i.variantId,quantity:i.qty}))};
  try{
    const r=await createOrder(payload);
    alert(r.offline?'Modo prévia: pedido não enviado.':'Pedido registrado com sucesso. Código: '+String(r.id).slice(0,8));
    if(!r.offline){cart=[];renderCart();closeCart();products=await loadProducts();render()}
  }catch(e){alert('Não foi possível registrar o pedido: '+e.message)}
};
(async()=>{products=await loadProducts();render();renderCart()})();
