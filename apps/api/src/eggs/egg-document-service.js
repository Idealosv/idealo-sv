import PDFDocument from 'pdfkit'

const text=v=>String(v??'').trim()
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const date=v=>v?new Date(v).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'

function httpError(message,statusCode=400,code='EGG_DOCUMENT_ERROR'){const e=new Error(message);e.statusCode=statusCode;e.code=code;return e}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}

async function actor({request,supabase,companyId}){
 const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED')
 const {data:{user},error}=await supabase.auth.getUser(token);if(error||!user)throw httpError('Sesión inválida.',401,'AUTH_INVALID')
 const {data:membership,error:memberError}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle()
 if(memberError)throw memberError
 if(!membership)throw httpError('No tenés acceso a esta empresa.',403,'COMPANY_ACCESS_DENIED')
 return{user,role:String(membership.role||'viewer')}
}

function pdfBuffer(build,{title='IDEALO Eggs'}={}){
 return new Promise((resolve,reject)=>{
  const chunks=[]
  const doc=new PDFDocument({size:'LETTER',margins:{top:36,bottom:36,left:42,right:42},bufferPages:true,info:{Title:title,Author:'IDEALO SV'}})
  doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)))
  build(doc)
  const range=doc.bufferedPageRange()
  for(let i=0;i<range.count;i++){
   doc.switchToPage(i)
   doc.moveTo(42,742).lineTo(570,742).strokeColor('#e5e7eb').stroke()
   doc.fillColor('#7b8189').font('Helvetica').fontSize(7).text('IDEALO SV · IDEALO Eggs',42,750,{width:300})
   doc.text('Página '+(i+1)+' de '+range.count,470,750,{width:100,align:'right'})
  }
  doc.end()
 })
}

function header(doc,{company,title,subtitle}){
 doc.rect(42,36,528,78).fill('#15171a')
 doc.rect(42,36,6,78).fill('#f97316')
 doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(20).text(text(company?.name)||'IDEALO Eggs',60,53,{width:300})
 doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(title,350,52,{width:200,align:'right'})
 doc.fillColor('#b7bdc5').font('Helvetica').fontSize(8).text(subtitle||'Documento operativo',350,72,{width:200,align:'right'})
 doc.fillColor('#8e959e').fontSize(7).text('Venta y distribución mayorista de huevos · IDEALO SV',60,84,{width:360})
}

function section(doc,title,y){
 doc.roundedRect(42,y,528,22,4).fill('#f3f4f6')
 doc.fillColor('#34383d').font('Helvetica-Bold').fontSize(8).text(title.toUpperCase(),52,y+7,{width:500})
 return y+30
}

function kv(doc,label,value,x,y,w=250){
 doc.fillColor('#777e86').font('Helvetica-Bold').fontSize(6.5).text(label.toUpperCase(),x,y,{width:w})
 doc.fillColor('#202328').font('Helvetica-Bold').fontSize(8).text(text(value)||'—',x,y+10,{width:w,height:20,ellipsis:true})
}

function tableHeader(doc,cols,y){
 doc.rect(42,y,528,20).fill('#25282d')
 doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6.3)
 for(const col of cols)doc.text(col.label,col.x,y+7,{width:col.w,align:col.align||'left',lineBreak:false})
 return y+24
}
function row(doc,cols,values,y,h=18,shade=false){
 if(shade)doc.rect(42,y-3,528,h+3).fill('#fafafa')
 doc.fillColor('#25282d').font('Helvetica').fontSize(7)
 cols.forEach((col,i)=>doc.text(text(values[i])||'—',col.x,y,{width:col.w,align:col.align||'left',height:h-2,ellipsis:true}))
 doc.moveTo(42,y+h).lineTo(570,y+h).strokeColor('#e5e7eb').stroke()
 return y+h+3
}

async function companyRecord(supabase,companyId){
 const {data,error}=await supabase.from('companies').select('id,name,demo_mode').eq('id',companyId).maybeSingle()
 if(error)throw error;if(!data)throw httpError('Empresa no encontrada.',404)
 return data
}

async function orderDocument({supabase,companyId,orderId,type}){
 const company=await companyRecord(supabase,companyId)
 const {data:order,error}=await supabase.from('egg_orders')
  .select('*,egg_customers(*),egg_order_items(*,egg_grades(name,code))')
  .eq('id',orderId).eq('company_id',companyId).maybeSingle()
 if(error)throw error;if(!order)throw httpError('Pedido no encontrado.',404)
 const isDelivery=type==='delivery'
 const title=isDelivery?'NOTA DE ENTREGA':'COMPROBANTE DE PEDIDO'
 const subtitle=isDelivery?'Documento logístico · no sustituye DTE':'Resumen comercial de venta'
 const buffer=await pdfBuffer(doc=>{
  header(doc,{company,title,subtitle})
  let y=128
  y=section(doc,'Datos del pedido',y)
  kv(doc,'Pedido',order.order_number,52,y,170);kv(doc,'Fecha',date(order.order_date),240,y,130);kv(doc,'Condición',order.payment_type==='CREDIT'?'Crédito':'Contado',390,y,160)
  y+=42
  y=section(doc,'Cliente',y)
  kv(doc,'Cliente',order.egg_customers?.name,52,y,250);kv(doc,'Contacto',order.egg_customers?.contact_name,320,y,230)
  y+=36
  kv(doc,'Dirección',order.egg_customers?.address,52,y,320);kv(doc,'Teléfono',order.egg_customers?.phone,390,y,160)
  y+=44
  y=section(doc,'Detalle',y)
  const cols=[{label:'Producto',x:52,w:190},{label:'Presentación',x:245,w:85},{label:'Cant.',x:335,w:45,align:'right'},{label:'Huevos',x:385,w:50,align:'right'},{label:'Precio',x:440,w:55,align:'right'},{label:'Total',x:500,w:60,align:'right'}]
  y=tableHeader(doc,cols,y)
  ;(order.egg_order_items||[]).forEach((i,index)=>{
   y=row(doc,cols,['Huevos '+(i.egg_grades?.name||''),String(i.presentation||'')+' x'+i.eggs_per_unit,i.quantity_units,i.total_eggs,money(i.unit_price),money(i.line_total)],y,18,index%2===1)
  })
  y+=10
  doc.roundedRect(370,y,200,70,5).fill('#17191d')
  doc.fillColor('#bbbfc5').font('Helvetica').fontSize(7).text('TOTAL PEDIDO',385,y+13,{width:80})
  doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(17).text(money(order.total),465,y+10,{width:90,align:'right'})
  doc.fillColor('#bbbfc5').fontSize(7).text('PAGADO',385,y+36,{width:70})
  doc.fillColor('#fff').font('Helvetica-Bold').text(money(order.paid_amount),465,y+36,{width:90,align:'right'})
  doc.fillColor('#bbbfc5').font('Helvetica').text('SALDO',385,y+51,{width:70})
  doc.fillColor('#fff').font('Helvetica-Bold').text(money(Math.max(0,Number(order.total)-Number(order.paid_amount))),465,y+51,{width:90,align:'right'})
  if(isDelivery){
   y+=88
   doc.roundedRect(42,y,528,72,5).strokeColor('#d6d9dd').stroke()
   doc.fillColor('#6f757c').font('Helvetica-Bold').fontSize(7).text('RECIBIDO POR',54,y+12,{width:120})
   doc.moveTo(54,y+48).lineTo(270,y+48).strokeColor('#8c9299').stroke()
   doc.text('FIRMA / SELLO',315,y+12,{width:120})
   doc.moveTo(315,y+48).lineTo(548,y+48).stroke()
  }
  if(order.notes)doc.fillColor('#666c73').font('Helvetica').fontSize(7).text('Notas: '+order.notes,42,700,{width:528})
 },{title:title+' '+order.order_number})
 return{filename:order.order_number+'-'+(isDelivery?'nota-entrega':'pedido')+'.pdf',buffer}
}

async function routeManifest({supabase,companyId,routeId}){
 const company=await companyRecord(supabase,companyId)
 const {data:route,error}=await supabase.from('egg_routes')
  .select('*,egg_route_stops(*,egg_orders(order_number,total,paid_amount,egg_customers(name,address,phone),egg_order_items(*,egg_grades(name,code)))),egg_route_load_items(*,egg_grades(name,code))')
  .eq('id',routeId).eq('company_id',companyId).maybeSingle()
 if(error)throw error;if(!route)throw httpError('Ruta no encontrada.',404)
 const buffer=await pdfBuffer(doc=>{
  header(doc,{company,title:'MANIFIESTO DE CARGA',subtitle:route.route_code+' · '+date(route.route_date)})
  let y=128
  y=section(doc,'Ruta',y)
  kv(doc,'Nombre',route.name||route.route_code,52,y,180);kv(doc,'Motorista',route.driver_name,245,y,150);kv(doc,'Vehículo',route.vehicle,410,y,140)
  y+=44
  y=section(doc,'Carga consolidada',y)
  const loadCols=[{label:'Clasificación',x:52,w:180},{label:'Requerido',x:300,w:80,align:'right'},{label:'Cargado',x:395,w:80,align:'right'},{label:'Retorno',x:485,w:75,align:'right'}]
  y=tableHeader(doc,loadCols,y)
  ;(route.egg_route_load_items||[]).forEach((i,index)=>{y=row(doc,loadCols,[i.egg_grades?.name,i.expected_eggs,i.loaded_eggs,Number(i.returned_good_eggs||0)+Number(i.damaged_eggs||0)],y,18,index%2===1)})
  y+=12
  y=section(doc,'Paradas y pedidos',y)
  const stopCols=[{label:'#',x:52,w:25},{label:'Cliente',x:82,w:145},{label:'Pedido',x:232,w:100},{label:'Dirección',x:337,w:135},{label:'Saldo',x:480,w:80,align:'right'}]
  y=tableHeader(doc,stopCols,y)
  ;[...(route.egg_route_stops||[])].sort((a,b)=>a.stop_order-b.stop_order).forEach((s,index)=>{
   if(y>700){doc.addPage();y=80;y=tableHeader(doc,stopCols,y)}
   const o=s.egg_orders||{}
   y=row(doc,stopCols,[s.stop_order,o.egg_customers?.name,o.order_number,o.egg_customers?.address,money(Math.max(0,Number(o.total||0)-Number(o.paid_amount||0)))],y,22,index%2===1)
  })
 },{title:'Manifiesto '+route.route_code})
 return{filename:route.route_code+'-manifiesto-carga.pdf',buffer}
}

async function customerStatement({supabase,companyId,customerId}){
 const company=await companyRecord(supabase,companyId)
 const {data:customer,error}=await supabase.from('egg_customers').select('*').eq('id',customerId).eq('company_id',companyId).maybeSingle()
 if(error)throw error;if(!customer)throw httpError('Cliente no encontrado.',404)
 const {data:orders,error:ordersError}=await supabase.from('egg_orders').select('id,order_number,order_date,due_date,total,paid_amount,status').eq('company_id',companyId).eq('customer_id',customerId).neq('status','CANCELLED').order('order_date',{ascending:true})
 if(ordersError)throw ordersError
 const total=(orders||[]).reduce((s,o)=>s+Number(o.total||0),0),paid=(orders||[]).reduce((s,o)=>s+Number(o.paid_amount||0),0),balance=Math.max(0,total-paid)
 const buffer=await pdfBuffer(doc=>{
  header(doc,{company,title:'ESTADO DE CUENTA',subtitle:'Cliente mayorista'})
  let y=128
  y=section(doc,'Cliente',y)
  kv(doc,'Cliente',customer.name,52,y,240);kv(doc,'Teléfono',customer.phone,310,y,120);kv(doc,'Crédito',money(customer.credit_limit)+' · '+customer.credit_days+' días',440,y,120)
  y+=44
  y=section(doc,'Resumen',y)
  kv(doc,'Ventas',money(total),52,y,150);kv(doc,'Abonos',money(paid),220,y,150);kv(doc,'Saldo pendiente',money(balance),390,y,170)
  y+=46
  const cols=[{label:'Fecha',x:52,w:70},{label:'Pedido',x:130,w:120},{label:'Vence',x:260,w:75},{label:'Total',x:350,w:65,align:'right'},{label:'Pagado',x:425,w:65,align:'right'},{label:'Saldo',x:500,w:60,align:'right'}]
  y=tableHeader(doc,cols,y)
  ;(orders||[]).forEach((o,index)=>{
   if(y>700){doc.addPage();y=80;y=tableHeader(doc,cols,y)}
   y=row(doc,cols,[date(o.order_date),o.order_number,date(o.due_date),money(o.total),money(o.paid_amount),money(Math.max(0,Number(o.total)-Number(o.paid_amount)))],y,18,index%2===1)
  })
 },{title:'Estado de cuenta '+customer.name})
 return{filename:'estado-cuenta-'+customer.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.pdf',buffer}
}

async function driverSettlement({supabase,companyId,routeId}){
 const company=await companyRecord(supabase,companyId)
 const {data:route,error}=await supabase.from('egg_routes')
  .select('*,egg_route_stops(*,egg_orders(order_number,total,paid_amount,egg_customers(name)))')
  .eq('id',routeId).eq('company_id',companyId).maybeSingle()
 if(error)throw error;if(!route)throw httpError('Ruta no encontrada.',404)
 const stops=route.egg_route_stops||[]
 const collected=stops.reduce((s,x)=>s+Number(x.collected_amount||0),0)
 const delivered=stops.filter(x=>x.status==='DELIVERED').length
 const failed=stops.filter(x=>x.status==='FAILED').length
 const buffer=await pdfBuffer(doc=>{
  header(doc,{company,title:'LIQUIDACIÓN DE MOTORISTA',subtitle:route.route_code+' · '+date(route.route_date)})
  let y=128
  y=section(doc,'Resumen de reparto',y)
  kv(doc,'Motorista',route.driver_name,52,y,170);kv(doc,'Vehículo',route.vehicle,240,y,120);kv(doc,'Entregas',delivered,380,y,70);kv(doc,'Fallidas',failed,460,y,70)
  y+=42
  kv(doc,'Cobrado en ruta',money(collected),52,y,180);kv(doc,'Estado',route.status,250,y,150);kv(doc,'Paradas',stops.length,430,y,100)
  y+=48
  y=section(doc,'Detalle de cobros',y)
  const cols=[{label:'#',x:52,w:25},{label:'Cliente',x:82,w:170},{label:'Pedido',x:260,w:120},{label:'Estado',x:390,w:80},{label:'Cobrado',x:485,w:75,align:'right'}]
  y=tableHeader(doc,cols,y)
  ;[...stops].sort((a,b)=>a.stop_order-b.stop_order).forEach((s,index)=>{y=row(doc,cols,[s.stop_order,s.egg_orders?.egg_customers?.name,s.egg_orders?.order_number,s.status,money(s.collected_amount)],y,20,index%2===1)})
  y+=20
  doc.roundedRect(42,y,528,70,5).strokeColor('#d6d9dd').stroke()
  doc.fillColor('#6f757c').font('Helvetica-Bold').fontSize(7).text('MOTORISTA',54,y+12,{width:120})
  doc.moveTo(54,y+48).lineTo(260,y+48).strokeColor('#8c9299').stroke()
  doc.text('CAJA / RESPONSABLE',330,y+12,{width:150})
  doc.moveTo(330,y+48).lineTo(548,y+48).stroke()
 },{title:'Liquidación '+route.route_code})
 return{filename:route.route_code+'-liquidacion-motorista.pdf',buffer}
}

export async function generateEggPdfDocument({request,supabase}){
 const type=String(request.params?.type||'').trim().toLowerCase()
 const companyId=String(request.query?.company_id||'').trim()
 if(!companyId)throw httpError('company_id es obligatorio.')
 await actor({request,supabase,companyId})
 if(type==='order'||type==='delivery'){
  const orderId=String(request.query?.order_id||'').trim();if(!orderId)throw httpError('order_id es obligatorio.')
  return orderDocument({supabase,companyId,orderId,type})
 }
 if(type==='manifest'||type==='settlement'){
  const routeId=String(request.query?.route_id||'').trim();if(!routeId)throw httpError('route_id es obligatorio.')
  return type==='manifest'?routeManifest({supabase,companyId,routeId}):driverSettlement({supabase,companyId,routeId})
 }
 if(type==='statement'){
  const customerId=String(request.query?.customer_id||'').trim();if(!customerId)throw httpError('customer_id es obligatorio.')
  return customerStatement({supabase,companyId,customerId})
 }
 throw httpError('Tipo de documento no válido.',404,'EGG_DOCUMENT_TYPE_NOT_FOUND')
}
