function httpError(message,statusCode=400,code='EGG_AI_ERROR'){const e=new Error(message);e.statusCode=statusCode;e.code=code;return e}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}
const n=v=>Number.isFinite(Number(v))?Number(v):0
const money=v=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(n(v))
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()

async function actor({request,supabase,companyId}){
 const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED')
 const {data:{user},error}=await supabase.auth.getUser(token);if(error||!user)throw httpError('Sesión inválida.',401,'AUTH_INVALID')
 const {data:member,error:memberError}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle()
 if(memberError)throw memberError;if(!member)throw httpError('No tenés acceso a esta empresa.',403,'COMPANY_ACCESS_DENIED')
 return{user,role:String(member.role||'viewer')}
}

async function loadContext(supabase,companyId){
 const from30=new Date(Date.now()-30*86400000).toISOString().slice(0,10)
 const [dash,inventory,balances,sales,losses,suppliers,routes]=await Promise.all([
  supabase.from('egg_executive_dashboard').select('*').eq('company_id',companyId).maybeSingle(),
  supabase.from('egg_inventory_stock').select('*').eq('company_id',companyId).order('stock_eggs',{ascending:true}),
  supabase.from('egg_customer_balance_report').select('*').eq('company_id',companyId).order('balance',{ascending:false}),
  supabase.from('egg_sales_profitability_report').select('*').eq('company_id',companyId).gte('order_date',from30).limit(1000),
  supabase.from('egg_loss_summary_report').select('*').eq('company_id',companyId).order('estimated_cost',{ascending:false}),
  supabase.from('egg_supplier_purchase_report').select('*').eq('company_id',companyId).order('avg_cost_per_egg',{ascending:true}),
  supabase.from('egg_route_performance_report').select('*').eq('company_id',companyId).order('route_date',{ascending:false}).limit(100)
 ])
 for(const result of [dash,inventory,balances,sales,losses,suppliers,routes])if(result.error)throw result.error
 return{dashboard:dash.data||{},inventory:inventory.data||[],balances:balances.data||[],sales:sales.data||[],losses:losses.data||[],suppliers:suppliers.data||[],routes:routes.data||[],from30}
}

function byGradeSales(ctx){
 const map=new Map()
 for(const row of ctx.sales){
  const key=row.grade_id||row.grade_name
  const current=map.get(key)||{name:row.grade_name||'Clasificación',eggs:0,sales:0,profit:0}
  current.eggs+=n(row.total_eggs);current.sales+=n(row.line_total);current.profit+=n(row.profit_amount);map.set(key,current)
 }
 return [...map.values()].sort((a,b)=>b.sales-a.sales)
}
function purchaseProjection(ctx){
 const sales=byGradeSales(ctx)
 const stockMap=new Map(ctx.inventory.map(x=>[x.name,{stock:n(x.stock_eggs),code:x.code}]))
 return sales.map(row=>{
  const stock=stockMap.get(row.name)?.stock||0
  const daily=row.eggs/30
  const target=Math.ceil(daily*7)
  const recommend=Math.max(0,target-stock)
  return{...row,stock,daily,recommend}
 }).sort((a,b)=>b.recommend-a.recommend)
}

function priorities(ctx){
 const d=ctx.dashboard||{}
 const list=[]
 if(n(d.overdue_balance)>0)list.push('Cobrar '+money(d.overdue_balance)+' de cartera vencida.')
 if(n(d.loss_cost)>0)list.push('Revisar pérdidas por '+money(d.loss_cost)+' y sus causas.')
 const projection=purchaseProjection(ctx).filter(x=>x.recommend>0).slice(0,3)
 if(projection.length)list.push('Planificar compra: '+projection.map(x=>x.name+' '+Math.ceil(x.recommend)+' huevos').join(', ')+'.')
 const pending=ctx.routes.reduce((s,r)=>s+Math.max(0,n(r.stops)-n(r.delivered)-n(r.failed)),0)
 if(pending>0)list.push('Cerrar '+pending+' entregas pendientes en rutas.')
 if(!list.length)list.push('No aparecen alertas operativas importantes con los datos actuales.')
 return list
}

function answer(question,ctx){
 const q=norm(question)
 const d=ctx.dashboard||{}
 const gradeSales=byGradeSales(ctx)
 const projection=purchaseProjection(ctx)
 const topBalance=ctx.balances.filter(x=>n(x.balance)>0).slice(0,8)
 const topLoss=ctx.losses.slice(0,6)

 if(q.includes('gan')||q.includes('utilidad')||q.includes('margen')||q.includes('rentab')){
  return [
   'Utilidad bruta acumulada: '+money(d.profit_total)+'.',
   'Ventas: '+money(d.sales_total)+' · costo vendido: '+money(d.cost_total)+' · margen: '+n(d.margin_percent).toFixed(2)+'%.',
   gradeSales.length?'Por clasificación: '+gradeSales.slice(0,5).map(x=>x.name+' '+money(x.profit)+' de utilidad').join(' · ')+'.':'Aún no hay ventas suficientes para desglosar por clasificación.'
  ].join('\n')
 }
 if(q.includes('debe')||q.includes('cobrar')||q.includes('moros')||q.includes('cartera')){
  return [
   'Cartera pendiente: '+money(d.receivable_balance)+' · vencida: '+money(d.overdue_balance)+'.',
   ...topBalance.map((x,i)=>(i+1)+'. '+x.name+' · saldo '+money(x.balance)+(x.oldest_overdue_date?' · vencido desde '+x.oldest_overdue_date:''))
  ].join('\n')
 }
 if(q.includes('vende')||q.includes('mejor tamaño')||q.includes('clasificacion')){
  if(!gradeSales.length)return 'Todavía no hay ventas suficientes para comparar clasificaciones.'
  return ['Clasificaciones con mayor venta en los últimos 30 días:',...gradeSales.slice(0,6).map((x,i)=>(i+1)+'. '+x.name+' · '+x.eggs+' huevos · '+money(x.sales)+' · utilidad '+money(x.profit))].join('\n')
 }
 if(q.includes('comprar')||q.includes('mañana')||q.includes('manana')||q.includes('reponer')){
  const needed=projection.filter(x=>x.recommend>0)
  if(!needed.length)return 'Con el ritmo de venta de los últimos 30 días, el inventario actual cubre aproximadamente una semana de demanda en las clasificaciones con movimiento.'
  return ['Proyección para cubrir 7 días, basada en ventas de los últimos 30 días:',...needed.slice(0,6).map((x,i)=>(i+1)+'. '+x.name+': comprar aprox. '+Math.ceil(x.recommend)+' huevos · stock '+Math.round(x.stock)+' · consumo diario '+x.daily.toFixed(1))].join('\n')
 }
 if(q.includes('proveedor')||q.includes('caro')||q.includes('costo compra')){
  if(!ctx.suppliers.length)return 'No hay compras suficientes para comparar proveedores.'
  return ['Costo promedio histórico por proveedor:',...ctx.suppliers.slice(0,8).map((x,i)=>(i+1)+'. '+x.supplier_name+' · '+money(x.avg_cost_per_egg)+'/huevo · '+x.eggs_received+' huevos recibidos.')].join('\n')
 }
 if(q.includes('perd')||q.includes('merma')||q.includes('quebrad')||q.includes('rechazo')){
  if(!topLoss.length)return 'No hay pérdidas registradas actualmente.'
  return ['Pérdidas registradas:',...topLoss.map((x,i)=>(i+1)+'. '+x.loss_type+' · '+x.grade_name+' · '+x.eggs_lost+' huevos · '+money(x.estimated_cost)),'Costo total estimado de pérdidas: '+money(d.loss_cost)+'.'].join('\n')
 }
 if(q.includes('ruta')||q.includes('motorista')||q.includes('repart')){
  const pending=ctx.routes.reduce((s,r)=>s+Math.max(0,n(r.stops)-n(r.delivered)-n(r.failed)),0)
  const collected=ctx.routes.reduce((s,r)=>s+n(r.collected_amount),0)
  return 'Rutas registradas: '+ctx.routes.length+' · entregas pendientes: '+pending+' · cobrado en rutas: '+money(collected)+'.'
 }
 return [
  'Resumen ejecutivo IDEALO Eggs:',
  'Inventario: '+Math.round(n(d.stock_eggs))+' huevos · valor estimado '+money(d.stock_value)+'.',
  'Ventas: '+money(d.sales_total)+' · utilidad '+money(d.profit_total)+' · margen '+n(d.margin_percent).toFixed(2)+'%.',
  'Por cobrar: '+money(d.receivable_balance)+' · vencido '+money(d.overdue_balance)+'.',
  'Mejor cliente: '+(d.best_customer||'sin datos')+(d.best_customer_sales?' · '+money(d.best_customer_sales):'')+'.',
  'Clasificación con mayor venta: '+(d.best_grade||'sin datos')+(d.best_grade_sales?' · '+money(d.best_grade_sales):'')+'.',
  'Prioridades:',
  ...priorities(ctx).map((x,i)=>(i+1)+'. '+x)
 ].join('\n')
}

export async function askEggAssistant({request,supabase}){
 const companyId=String(request.body?.company_id||'').trim()
 const question=String(request.body?.question||'').trim()
 if(!companyId)throw httpError('company_id es obligatorio.')
 if(!question)throw httpError('Escribí una pregunta.')
 if(question.length>3000)throw httpError('La pregunta es demasiado larga.',413,'QUESTION_TOO_LONG')
 const a=await actor({request,supabase,companyId})
 const context=await loadContext(supabase,companyId)
 return{
  answer:answer(question,context),
  provider:'internal',
  model:'IDEALO Eggs Intelligence v1',
  mode:'read_only',
  actor_role:a.role,
  generated_at:new Date().toISOString(),
  metrics:context.dashboard
 }
}
