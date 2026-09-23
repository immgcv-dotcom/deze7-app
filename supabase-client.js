let sb = null;

export async function getSupabase(){
  if(sb) return sb;
  const cfg = window.DEZE7_CONFIG || {};
  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = mod.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return sb;
}

export async function loadProducts(){
  const client = await getSupabase();
  if(!client) return window.DEZE7_SEED || [];
  const {data,error}=await client
    .from('deze7_products')
    .select('id,slug,name,description,category,price,cost,image_url,featured,active,sort_order,deze7_variants(id,sku,size,color,stock,active)')
    .eq('active',true)
    .order('sort_order');
  if(error){
    console.error(error);
    return window.DEZE7_SEED || [];
  }
  return (data||[]).map(p=>{
    const variants=(p.deze7_variants||[]).filter(v=>v.active);
    return {
      ...p,
      type:p.category,
      color:variants[0]?.color || '',
      variants,
      sizes:variants.map(v=>v.size).filter(Boolean),
      image:p.image_url||undefined
    };
  });
}

export async function createOrder({customer,items,notes=''}){
  const client = await getSupabase();
  if(!client) return {offline:true,id:'PREVIEW-'+Date.now()};
  const {data,error}=await client.rpc('deze7_create_order',{
    p_customer_name:customer.name,
    p_customer_phone:customer.phone,
    p_customer_email:customer.email || '',
    p_notes:notes || '',
    p_items:items.map(i=>({
      product_id:i.product_id,
      variant_id:i.variant_id,
      quantity:i.quantity
    }))
  });
  if(error) throw error;
  return {id:data,status:'novo'};
}
