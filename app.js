const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
let products=window.DEZE7_SEED||[];let cart=[];
const el=id=>document.getElementById(id);
function shirtColor(name){return {'Preta':'#171717','Branca':'#eee','Off-white':'#ded9cc','Cinza':'#777'}[name]||'#222'}
function render(){
  el('kits').innerHTML=products.filter(p=>p.type==='kit').map(card).join('');
  el('tees').innerHTML=products.filter(p=>p.type==='camiseta').map(card).join('');
  document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{const c=b.closest('.card');c.querySelectorAll('[data-size]').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add,b.closest('.card')));
}
function card(p){
  const visual=p.image?`<div class="cardimg"><img src="${p.image}" alt="${p.name}"></div>`:`<div class="product-visual"><div class="shirt" style="background:${shirtColor(p.color)}"><span class="shirtlogo">D7</span></div></div>`;
  const sizes=(p.sizes||['P','M','G']).map(s=>`<button class="sizebtn" data-size="${s}">${s}</button>`).join('');
  return `<article class="card">${visual}<div class="cardbody"><div class="kicker">${p.type==='kit'?'KIT DEZE7':'ESSENCIAL'}</div><h3>${p.name}</h3><div class="meta">${p.color||''} · Modelagem regular · P, M e G</div><div class="price">${money(p.price)}</div><div class="row" style="margin-top:16px">${sizes}</div><button class="primary" style="margin-top:16px;width:100%" data-add="${p.id}">Adicionar à sacola</button></div></article>`;
}
function add(id,cardEl){const p=products.find(x=>String(x.id)===id);const size=cardEl.querySelector('[data-size].active')?.dataset.size;if(!size)return alert('Escolha um tamanho.');const key=id+'-'+size;const ex=cart.find(x=>x.key===key);if(ex)ex.qty++;else cart.push({key,product:p,size,qty:1});renderCart();openCart()}
function renderCart(){el('cartCount').textContent=cart.reduce((a,b)=>a+b.qty,0);el('cartItems').innerHTML=cart.length?cart.map(i=>`<div class="cartitem"><strong>${i.product.name}</strong><div class="meta">Tam. ${i.size} · ${i.qty} un.</div><div>${money(i.product.price*i.qty)}</div></div>`).join(''):'<p class="meta">Sua sacola está vazia.</p>';el('cartTotal').textContent=money(cart.reduce((s,i)=>s+i.product.price*i.qty,0))}
function openCart(){el('drawer').classList.add('open')}function closeCart(){el('drawer').classList.remove('open')}
el('bagBtn').onclick=openCart;el('closeCart').onclick=closeCart;
el('checkout').onclick=()=>alert('As vendas online serão conectadas ao sistema de gestão em uma etapa posterior.');
render();renderCart();
