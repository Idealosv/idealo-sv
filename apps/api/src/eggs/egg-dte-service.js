import { createInvoiceDraft } from '../dte/invoice-service.js'
import { requireAuthenticatedUser } from '../dte/access-control.js'
import { requireSaasFeature } from '../saas/entitlement-service.js'

function httpError(message,statusCode=400,code='EGG_DTE_ERROR'){const e=new Error(message);e.statusCode=statusCode;e.code=code;return e}
const digits=value=>String(value||'').replace(/\D/g,'')
const text=value=>String(value||'').trim()

function under1000(n){
 const units=['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE']
 const teens={10:'DIEZ',11:'ONCE',12:'DOCE',13:'TRECE',14:'CATORCE',15:'QUINCE',16:'DIECISEIS',17:'DIECISIETE',18:'DIECIOCHO',19:'DIECINUEVE'}
 const tens={20:'VEINTE',30:'TREINTA',40:'CUARENTA',50:'CINCUENTA',60:'SESENTA',70:'SETENTA',80:'OCHENTA',90:'NOVENTA'}
 const hundreds={1:'CIENTO',2:'DOSCIENTOS',3:'TRESCIENTOS',4:'CUATROCIENTOS',5:'QUINIENTOS',6:'SEISCIENTOS',7:'SETECIENTOS',8:'OCHOCIENTOS',9:'NOVECIENTOS'}
 if(n===0)return ''
 if(n===100)return'CIEN'
 let out=''
 if(n>=100){out=hundreds[Math.floor(n/100)];n%=100}
 if(n){
  if(out)out+=' '
  if(n<10)out+=units[n]
  else if(n<20)out+=teens[n]
  else if(n<30)out+=n===20?'VEINTE':`VEINTI${units[n-20]}`
  else{const t=Math.floor(n/10)*10;out+=tens[t];if(n%10)out+=` Y ${units[n%10]}`}
 }
 return out
}
function integerWords(value){
 let n=Math.max(0,Math.floor(Number(value||0)))
 if(n===0)return'CERO'
 const parts=[]
 const millions=Math.floor(n/1000000);n%=1000000
 if(millions)parts.push(millions===1?'UN MILLON':`${under1000(millions)} MILLONES`)
 const thousands=Math.floor(n/1000);n%=1000
 if(thousands)parts.push(thousands===1?'MIL':`${under1000(thousands)} MIL`)
 if(n)parts.push(under1000(n))
 return parts.join(' ')
}
function totalInWords(value){
 const total=Math.max(0,Number(value||0))
 const whole=Math.floor(total)
 const cents=Math.round((total-whole)*100)
 return `${integerWords(whole)} ${String(cents).padStart(2,'0')}/100 DOLARES`
}

async function ensureErpClient({supabase,user,customer,dteType}){
 const type=String(dteType)
 if(type==='01'&&!text(customer.nit))return null
 if(type==='03'){
  const required=[
   ['nit','NIT'],['nrc','NRC'],['business_activity','actividad económica'],['activity_code','código de actividad'],
   ['department_code','departamento'],['municipality_code','municipio'],['district_code','distrito'],
   ['address','dirección'],['phone','teléfono'],['email','correo']
  ]
  const missing=required.filter(([key])=>!text(customer[key])).map(([,label])=>label)
  if(missing.length)throw httpError(`Para Crédito Fiscal completá en el cliente: ${missing.join(', ')}.`,409,'EGG_CCF_CUSTOMER_INCOMPLETE')
 }
 const nit=digits(customer.nit)
 if(nit&&![9,14].includes(nit.length))throw httpError('El NIT del cliente debe tener 9 o 14 dígitos.',409,'EGG_CUSTOMER_NIT_INVALID')
 const payload={
  company_id:customer.company_id,
  name:customer.name,
  trade_name:customer.name,
  email:text(customer.email)||null,
  phone:text(customer.phone)||null,
  contact_name:text(customer.contact_name)||null,
  address:text(customer.address)||null,
  delivery_address:text(customer.address)||null,
  tax_id:nit||null,
  nit:nit||null,
  nrc:digits(customer.nrc)||null,
  business_activity:text(customer.business_activity)||null,
  giro:text(customer.business_activity)||null,
  activity_code:text(customer.activity_code)||null,
  department:text(customer.department)||null,
  department_code:text(customer.department_code)||null,
  municipality:text(customer.municipality)||null,
  municipality_code:text(customer.municipality_code)||null,
  district_code:text(customer.district_code)||null,
  client_type:'company',
  payment_terms:Number(customer.credit_days||0)>0?'credit':'cash',
  credit_limit:Number(customer.credit_limit||0),
  credit_days:Number(customer.credit_days||0),
  preferred_dte_type:type,
  taxpayer_type:type==='03'?'1':'2',
  document_type:'36',
  document_number:nit||null,
  status:'active',
  source:'IDEALO_EGGS',
  notes:'Cliente sincronizado desde IDEALO Eggs para Facturación Electrónica DTE.',
  created_by:user.id,
 }
 let clientId=customer.erp_client_id||null
 if(clientId){
  const {data,error}=await supabase.from('clients').update(payload).eq('id',clientId).eq('company_id',customer.company_id).select('id').maybeSingle()
  if(error)throw error
  if(!data)clientId=null
 }
 if(!clientId){
  const {data,error}=await supabase.from('clients').insert(payload).select('id').single()
  if(error)throw error
  clientId=data.id
  const {error:linkError}=await supabase.from('egg_customers').update({erp_client_id:clientId,updated_at:new Date().toISOString()}).eq('id',customer.id).eq('company_id',customer.company_id)
  if(linkError)throw linkError
 }
 return clientId
}

export async function createEggOrderDteDraft({request,supabase}){
 const user=await requireAuthenticatedUser({request,supabase})
 const orderId=String(request.params?.orderId||'').trim()
 if(!orderId)throw httpError('Pedido obligatorio.')
 const {data:order,error}=await supabase.from('egg_orders')
  .select('*,egg_customers(*),egg_order_items(*,egg_grades(code,name))')
  .eq('id',orderId).maybeSingle()
 if(error)throw error
 if(!order)throw httpError('Pedido no encontrado.',404,'EGG_ORDER_NOT_FOUND')
 await requireSaasFeature({request,supabase,companyId:order.company_id,moduleCode:'DTE',featureLabel:'Facturación Electrónica DTE'})
 if(order.status==='CANCELLED')throw httpError('No se puede facturar un pedido cancelado.',409,'EGG_ORDER_CANCELLED')

 const {data:links,error:linkError}=await supabase.from('egg_order_dte_links')
  .select('id,dte_document_id,dte_documents(status,control_number,environment,dte_type)')
  .eq('order_id',orderId)
 if(linkError)throw linkError
 const active=(links||[]).find(row=>!['REJECTED','INVALIDATED'].includes(String(row.dte_documents?.status||'')))
 if(active)throw httpError(`Este pedido ya tiene un DTE asociado: ${active.dte_documents?.control_number||active.dte_document_id}.`,409,'EGG_ORDER_ALREADY_INVOICED')

 const customer=order.egg_customers
 const requestedType=String(request.body?.dteType||customer?.preferred_dte_type||'01')
 const dteType=['01','03'].includes(requestedType)?requestedType:'01'
 const environment=String(request.body?.environment||'test').toLowerCase()
 if(!['test','production'].includes(environment))throw httpError('Ambiente DTE inválido.')
 const clientId=customer?await ensureErpClient({supabase,user,customer,dteType}):null
 if(dteType==='03'&&!clientId)throw httpError('Crédito Fiscal requiere cliente fiscal sincronizado.',409)

 const items=(order.egg_order_items||[]).map(item=>({
  descripcion:`Huevos ${item.egg_grades?.name||''} · ${item.presentation} de ${item.eggs_per_unit}`.trim(),
  cantidad:Number(item.quantity_units),
  precioUni:Number(item.unit_price),
  montoDescu:0,
  tipoItem:1,
  uniMedida:59,
  codigo:`EGG-${item.egg_grades?.code||'HUEVO'}`,
  tipoVenta:'gravada',
 }))
 if(!items.length)throw httpError('El pedido no tiene líneas para facturar.',409)

 const body={
  companyId:order.company_id,
  clientId,
  dteType,
  items,
  condicionOperacion:order.payment_type==='CREDIT'?2:1,
  totalLetras:totalInWords(order.total),
  observaciones:`IDEALO Eggs · Pedido ${order.order_number}`,
  environment,
  confirmation:request.body?.confirmation||null,
 }
 const document=await createInvoiceDraft({request:{headers:request.headers,body},supabase})
 const {error:insertError}=await supabase.from('egg_order_dte_links').insert({
  company_id:order.company_id,
  order_id:order.id,
  dte_document_id:document.id,
  dte_type:dteType,
  environment,
  created_by:user.id,
 })
 if(insertError)throw insertError
 return{ok:true,order_id:order.id,order_number:order.order_number,dte:document}
}

export const __test__={integerWords,totalInWords}
