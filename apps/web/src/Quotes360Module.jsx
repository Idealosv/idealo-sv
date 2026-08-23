import { useEffect, useMemo, useState } from 'react'
import {
  QUOTE_STATUSES, STATUS_LABELS, ALLOWED_TRANSITIONS, number, round2, normalizeText,
  calculateItem, calculateQuote, tierPrice, validateQuote, quoteCode, quoteStats, canTransition, cloneItem
} from './quoteEngine.js'

const money = value => new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(number(value))
const today = () => new Date().toISOString().slice(0,10)
const futureDate = days => { const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10) }
const emptyItem = () => ({ product_id:'', variant_id:'', sku:'', category:'', description:'', quantity:1, unit:'unidad', unit_price:0, minimum_price:0, width:'', height:'', dimension_unit:'m', price_per_m2:0, discount_percent:0, discount_fixed:0, surcharge_percent:0, surcharge_fixed:0, taxable:true, tax_rate:13, unit_cost:0, labor_unit_cost:0, installation_unit_cost:0, design_included:false, installation_included:false, requires_production:true, estimated_minutes:'', lead_time_days:'', specifications:'', internal_notes:'', image_url:'', group_name:'' })
const emptyQuote = initialClientId => ({ id:'', client_id:initialClientId||'', number:null, code:'', revision:1, status:'DRAFT', prefix:'COT', title:'', reference:'', project_name:'', branch_name:'', sales_channel:'DIRECTO', source:'', priority:'NORMAL', contact_name:'', contact_phone:'', contact_email:'', delivery_address:'', valid_until:futureDate(15), payment_terms:'Contado', payment_method:'TRANSFERENCIA', credit_days:0, deposit_percent:0, discount_percent:0, discount_fixed:0, surcharge_percent:0, surcharge_fixed:0, minimum_margin:25, close_probability:'', expected_close_date:'', requested_delivery_date:'', promised_delivery_date:'', installation_required:false, installation_address:'', internal_notes:'', customer_notes:'', terms_and_conditions:'Precios expresados en dólares de los Estados Unidos. Vigencia según fecha indicada. Producción inicia después de aprobación y anticipo cuando aplique.', warranty_text:'', exclusions:'', tags_text:'', follow_up_at:'', rejection_reason:'', public_token:'' })

function Field({label,children,className=''}) { return <label className={`field ${className}`}><span>{label}</span>{children}</label> }
function Kpi({label,value,sub}) { return <div className="q360-kpi"><small>{label}</small><strong>{value}</strong>{sub&&<span>{sub}</span>}</div> }
function StatusBadge({status}) { return <span className={`q360-status st-${String(status||'').toLowerCase()}`}>{STATUS_LABELS[status]||status}</span> }

export default function Quotes360Module({ company, supabase, initialClientId='' }) {
  const [clients,setClients]=useState([]), [products,setProducts]=useState([]), [quotes,setQuotes]=useState([])
  const [variants,setVariants]=useState([]), [tiers,setTiers]=useState([]), [items,setItems]=useState([emptyItem()])
  const [form,setForm]=useState(()=>emptyQuote(initialClientId)), [view,setView]=useState('EDITOR')
  const [query,setQuery]=useState(''), [statusFilter,setStatusFilter]=useState('ALL'), [clientFilter,setClientFilter]=useState('ALL')
  const [message,setMessage]=useState({type:'',text:''}), [busy,setBusy]=useState(false), [selected,setSelected]=useState(null)
  const [history,setHistory]=useState([]), [communications,setCommunications]=useState([]), [followups,setFollowups]=useState([]), [approvals,setApprovals]=useState([]), [versions,setVersions]=useState([])
  const [followForm,setFollowForm]=useState({due_at:'',type:'FOLLOW_UP',note:''}), [commForm,setCommForm]=useState({channel:'WHATSAPP',recipient:'',subject:'',message:''})

  const load = async () => {
    const [c,p,q,v,t] = await Promise.all([
      supabase.from('clients').select('*').eq('company_id',company.id).order('name'),
      supabase.from('finished_products').select('*').eq('company_id',company.id).eq('active',true).order('name'),
      supabase.from('quotes').select('*, clients(name,phone,whatsapp,email,nit,nrc,dui,giro,address)').eq('company_id',company.id).is('soft_deleted_at',null).order('created_at',{ascending:false}).limit(500),
      supabase.from('product_variants').select('*').eq('company_id',company.id).eq('active',true),
      supabase.from('product_price_tiers').select('*').eq('company_id',company.id).eq('active',true),
    ])
    if (q.error) setMessage({type:'error',text:q.error.message.includes('soft_deleted_at')?'Falta aplicar la migración Cotizaciones 360 en Supabase.':q.error.message})
    setClients(c.data||[]); setProducts(p.data||[]); setQuotes(q.data||[]); setVariants(v.data||[]); setTiers(t.data||[])
  }
  useEffect(()=>{load()},[company.id])
  useEffect(()=>{ if(initialClientId) setForm(current=>({...current,client_id:initialClientId})) },[initialClientId])

  const totals = useMemo(()=>calculateQuote(items,form),[items,form.discount_percent,form.discount_fixed,form.surcharge_percent,form.surcharge_fixed])
  const validation = useMemo(()=>validateQuote({...form,items},totals),[form,items,totals])
  const stats = useMemo(()=>quoteStats(quotes),[quotes])
  const client = useMemo(()=>clients.find(c=>c.id===form.client_id),[clients,form.client_id])

  const filtered = useMemo(()=>{
    const q=query.toLowerCase().trim()
    return quotes.filter(r=>statusFilter==='ALL'||r.status===statusFilter)
      .filter(r=>clientFilter==='ALL'||r.client_id===clientFilter)
      .filter(r=>!q||[r.code,r.title,r.project_name,r.reference,r.clients?.name,r.status,...(r.tags||[])].filter(Boolean).join(' ').toLowerCase().includes(q))
  },[quotes,query,statusFilter,clientFilter])

  const update=(name,value)=>setForm(f=>({...f,[name]:value}))
  const updateItem=(idx,name,value)=>setItems(rows=>rows.map((r,i)=>i===idx?{...r,[name]:value}:r))
  const reset=()=>{setForm(emptyQuote(initialClientId));setItems([emptyItem()]);setSelected(null);setHistory([]);setCommunications([]);setFollowups([]);setApprovals([]);setVersions([]);setMessage({type:'',text:''});setView('EDITOR')}

  const chooseClient=id=>{
    const c=clients.find(x=>x.id===id)
    setForm(f=>({...f,client_id:id,contact_name:c?.contact_name||c?.name||'',contact_phone:c?.whatsapp||c?.phone||'',contact_email:c?.email||'',delivery_address:c?.address||''}))
  }

  const chooseProduct=(idx,id)=>{
    const p=products.find(x=>x.id===id)
    if(!p){ updateItem(idx,'product_id',''); return }
    const pTiers=tiers.filter(t=>t.product_id===id)
    const current=items[idx]
    const price=tierPrice(pTiers,current?.quantity||1,p.sale_price)
    const next={...current,product_id:id,variant_id:'',sku:p.sku||'',category:p.category||'',description:p.short_description||p.name,unit:p.unit||'unidad',unit_price:price,minimum_price:number(p.minimum_price),width:p.width??'',height:p.height??'',dimension_unit:p.dimension_unit||'m',price_per_m2:number(p.price_per_m2),taxable:p.taxable!==false,tax_rate:number(p.tax_rate,13),unit_cost:number(p.cost_estimate),labor_unit_cost:number(p.labor_cost),installation_unit_cost:number(p.installation_cost),design_included:!!p.design_included,installation_included:!!p.installation_included,requires_production:p.requires_production!==false,estimated_minutes:p.estimated_minutes??'',lead_time_days:p.lead_time_days??'',image_url:p.image_url||'',specifications:p.technical_description||''}
    setItems(rows=>rows.map((r,i)=>i===idx?next:r))
  }

  const chooseVariant=(idx,id)=>{
    const v=variants.find(x=>x.id===id), current=items[idx]
    if(!v){ updateItem(idx,'variant_id',''); return }
    setItems(rows=>rows.map((r,i)=>i===idx?{...current,variant_id:id,sku:v.sku||current.sku,unit_price:v.sale_price==null?current.unit_price:number(v.sale_price),unit_cost:v.cost_estimate==null?current.unit_cost:number(v.cost_estimate),specifications:[current.specifications,Object.entries(v.attributes||{}).map(([k,val])=>`${k}: ${val}`).join(' · ')].filter(Boolean).join(' · ')}:r))
  }

  const quantityChanged=(idx,value)=>{
    const item=items[idx], pTiers=tiers.filter(t=>t.product_id===item.product_id)
    const product=products.find(p=>p.id===item.product_id)
    const nextPrice=item.product_id?tierPrice(pTiers,value,product?.sale_price??item.unit_price):item.unit_price
    setItems(rows=>rows.map((r,i)=>i===idx?{...r,quantity:value,unit_price:nextPrice}:r))
  }

  const quotePayload=()=>({
    company_id:company.id, client_id:form.client_id, prefix:normalizeText(form.prefix)||'COT', code:form.code||null, revision:number(form.revision,1), status:form.status,
    title:normalizeText(form.title)||null, reference:normalizeText(form.reference)||null, project_name:normalizeText(form.project_name)||null, branch_name:normalizeText(form.branch_name)||null,
    sales_channel:form.sales_channel||null, source:normalizeText(form.source)||null, priority:form.priority, contact_name:normalizeText(form.contact_name)||null, contact_phone:normalizeText(form.contact_phone)||null, contact_email:normalizeText(form.contact_email)||null,
    delivery_address:normalizeText(form.delivery_address)||null, valid_until:form.valid_until||null, payment_terms:normalizeText(form.payment_terms)||null, payment_method:form.payment_method||null, credit_days:Math.max(0,number(form.credit_days)),
    deposit_percent:Math.min(100,Math.max(0,number(form.deposit_percent))), deposit_amount:round2(totals.total*number(form.deposit_percent)/100), balance_amount:round2(totals.total-totals.total*number(form.deposit_percent)/100),
    discount_percent:number(form.discount_percent),discount_fixed:number(form.discount_fixed),surcharge_percent:number(form.surcharge_percent),surcharge_fixed:number(form.surcharge_fixed),subtotal:totals.subtotal,discount:round2(totals.lineDiscount+totals.globalDiscount),tax_total:totals.tax,total:totals.total,cost_total:totals.cost,profit_total:totals.profit,margin_percent:totals.margin,markup_percent:totals.markup,minimum_margin:number(form.minimum_margin),
    close_probability:form.close_probability===''?null:Math.max(0,Math.min(1,number(form.close_probability)/100)), expected_close_date:form.expected_close_date||null,requested_delivery_date:form.requested_delivery_date||null,promised_delivery_date:form.promised_delivery_date||null,
    installation_required:!!form.installation_required,installation_address:normalizeText(form.installation_address)||null,internal_notes:normalizeText(form.internal_notes)||null,customer_notes:normalizeText(form.customer_notes)||null,notes:normalizeText(form.customer_notes)||null,terms_and_conditions:normalizeText(form.terms_and_conditions)||null,warranty_text:normalizeText(form.warranty_text)||null,exclusions:normalizeText(form.exclusions)||null,tags:form.tags_text.split(',').map(x=>x.trim()).filter(Boolean),follow_up_at:form.follow_up_at||null,rejected_reason:normalizeText(form.rejection_reason)||null
  })

  const itemPayload=(item,idx,quoteId)=>{
    const calc=calculateItem(item)
    return {quote_id:quoteId,product_id:item.product_id||null,variant_id:item.variant_id||null,sku:item.sku||null,category:item.category||null,description:normalizeText(item.description),quantity:number(item.quantity),unit:item.unit||'unidad',unit_price:calc.unitPrice,discount:calc.discount,discount_percent:number(item.discount_percent),discount_fixed:number(item.discount_fixed),surcharge_percent:number(item.surcharge_percent),surcharge_fixed:number(item.surcharge_fixed),line_total:calc.total,sort_order:idx,width:item.width===''?null:number(item.width),height:item.height===''?null:number(item.height),dimension_unit:item.dimension_unit||'m',area_m2:calc.area,price_per_m2:number(item.price_per_m2),minimum_price:number(item.minimum_price),taxable:item.taxable!==false,tax_rate:number(item.tax_rate,13),tax_amount:calc.tax,unit_cost:number(item.unit_cost),labor_unit_cost:number(item.labor_unit_cost),installation_unit_cost:number(item.installation_unit_cost),cost_total:calc.totalCost,profit_total:calc.profit,margin_percent:calc.margin,markup_percent:calc.markup,design_included:!!item.design_included,installation_included:!!item.installation_included,requires_production:item.requires_production!==false,estimated_minutes:item.estimated_minutes===''?null:number(item.estimated_minutes),lead_time_days:item.lead_time_days===''?null:number(item.lead_time_days),image_url:item.image_url||null,specifications:normalizeText(item.specifications)||null,internal_notes:normalizeText(item.internal_notes)||null,group_name:normalizeText(item.group_name)||null}
  }

  const snapshot=quoteId=>({quote:{...form,id:quoteId,totals},items:items.map((item,idx)=>({...item,calculated:calculateItem(item),sort_order:idx})),client:client?{id:client.id,name:client.name,nit:client.nit,nrc:client.nrc,email:client.email}:null,generated_at:new Date().toISOString()})

  const save=async({newRevision=false}={})=>{
    if(!validation.valid){setMessage({type:'error',text:validation.errors.join(' ')});return null}
    setBusy(true);setMessage({type:'',text:''})
    let quoteId=form.id, saved
    const payload=quotePayload()
    if(form.id){
      if(['APPROVED','CONVERTED','PARTIALLY_CONVERTED'].includes(form.status)&&!newRevision){setBusy(false);setMessage({type:'error',text:'Este documento está aprobado/convertido. Creá una nueva revisión para modificarlo.'});return null}
      const revision=newRevision?number(form.revision,1)+1:number(form.revision,1)
      const {data,error}=await supabase.from('quotes').update({...payload,revision,status:newRevision?'NEGOTIATION':payload.status}).eq('id',form.id).eq('company_id',company.id).select().single()
      if(error){setBusy(false);setMessage({type:'error',text:error.message});return null} saved=data
      await supabase.from('quote_items').delete().eq('quote_id',quoteId)
    } else {
      const {data,error}=await supabase.from('quotes').insert(payload).select().single()
      if(error){setBusy(false);setMessage({type:'error',text:error.message});return null} saved=data;quoteId=data.id
      const code=quoteCode(data.number,data.prefix||'COT',data.created_at)
      const {data:coded}=await supabase.from('quotes').update({code}).eq('id',quoteId).select().single(); saved=coded||{...saved,code}
    }
    const rows=items.map((item,idx)=>itemPayload(item,idx,quoteId))
    const {error:itemError}=await supabase.from('quote_items').insert(rows)
    if(itemError){setBusy(false);setMessage({type:'error',text:itemError.message});return null}
    const rev=number(saved.revision,1)
    await supabase.from('quote_versions').upsert({company_id:company.id,quote_id:quoteId,revision:rev,snapshot:snapshot(quoteId),reason:newRevision?'Nueva revisión comercial':'Guardado del documento'},{onConflict:'quote_id,revision'})
    await load(); await editQuote({...saved,clients:client}); setBusy(false);setMessage({type:'success',text:newRevision?`Revisión ${rev} creada.`:'Cotización guardada correctamente.'});return quoteId
  }

  const loadRelated=async id=>{
    const [h,c,f,a,v]=await Promise.all([
      supabase.from('quote_status_history').select('*').eq('quote_id',id).order('changed_at',{ascending:false}),
      supabase.from('quote_communications').select('*').eq('quote_id',id).order('created_at',{ascending:false}),
      supabase.from('quote_followups').select('*').eq('quote_id',id).order('due_at'),
      supabase.from('quote_approvals').select('*').eq('quote_id',id).order('created_at',{ascending:false}),
      supabase.from('quote_versions').select('id,revision,reason,created_at,created_by').eq('quote_id',id).order('revision',{ascending:false})
    ]);setHistory(h.data||[]);setCommunications(c.data||[]);setFollowups(f.data||[]);setApprovals(a.data||[]);setVersions(v.data||[])
  }

  const editQuote=async row=>{
    const {data:its,error}=await supabase.from('quote_items').select('*').eq('quote_id',row.id).order('sort_order')
    if(error){setMessage({type:'error',text:error.message});return}
    setSelected(row);setForm({...emptyQuote(row.client_id),...row,tags_text:(row.tags||[]).join(', '),close_probability:row.close_probability==null?'':round2(number(row.close_probability)*100),follow_up_at:row.follow_up_at?String(row.follow_up_at).slice(0,16):'',rejection_reason:row.rejected_reason||''});setItems((its||[]).map(i=>({...emptyItem(),...i,discount_fixed:i.discount_fixed??i.discount??0})));await loadRelated(row.id);setView('EDITOR')
  }

  const duplicate=async row=>{await editQuote(row);setTimeout(()=>{setForm(f=>({...f,id:'',number:null,code:'',revision:1,status:'DRAFT',title:`${f.title||row.code||'Cotización'} (copia)`,sent_at:null,approved_at:null,rejected_at:null,converted_at:null}));setSelected(null);setMessage({type:'success',text:'Copia preparada. Guardala para crear una nueva cotización.'})},0)}

  const changeStatus=async(row,to,comment='')=>{
    if(!canTransition(row.status,to)){setMessage({type:'error',text:`No se permite pasar de ${STATUS_LABELS[row.status]} a ${STATUS_LABELS[to]}.`});return}
    const stamp={}; if(to==='SENT')stamp.sent_at=new Date().toISOString();if(to==='VIEWED')stamp.viewed_at=new Date().toISOString();if(to==='APPROVED')stamp.approved_at=new Date().toISOString();if(to==='REJECTED')stamp.rejected_at=new Date().toISOString();if(to==='CONVERTED')stamp.converted_at=new Date().toISOString();if(to==='ARCHIVED')stamp.archived_at=new Date().toISOString()
    const {error}=await supabase.from('quotes').update({status:to,...stamp}).eq('id',row.id).eq('company_id',company.id)
    if(error)return setMessage({type:'error',text:error.message})
    const {data:{user}}=await supabase.auth.getUser()
    await supabase.from('quote_status_history').insert({company_id:company.id,quote_id:row.id,from_status:row.status,to_status:to,comment:comment||null,changed_by:user?.id||null})
    if(to==='APPROVED') await supabase.from('quote_approvals').insert({company_id:company.id,quote_id:row.id,approval_type:'INTERNAL',status:'APPROVED',approver_name:user?.email||'Usuario IDEALO',decision_at:new Date().toISOString(),comments:comment||'Aprobación registrada desde Cotizaciones 360'})
    await load(); if(form.id===row.id){setForm(f=>({...f,status:to,...stamp}));await loadRelated(row.id)} setMessage({type:'success',text:`Estado actualizado a ${STATUS_LABELS[to]}.`})
  }

  const convertToWorkOrder=async row=>{
    if(!['APPROVED','PARTIALLY_CONVERTED'].includes(row.status))return setMessage({type:'error',text:'La cotización debe estar aprobada antes de crear una orden.'})
    const {data:its}=await supabase.from('quote_items').select('*').eq('quote_id',row.id).order('sort_order')
    const pending=(its||[]).filter(i=>number(i.converted_quantity)<number(i.quantity))
    if(!pending.length)return setMessage({type:'error',text:'Todas las partidas ya fueron convertidas.'})
    const {data:w,error}=await supabase.from('work_orders').insert({company_id:company.id,quote_id:row.id,client_id:row.client_id,title:row.project_name||row.title||`Trabajo ${row.code}`,total:row.total,status:'PENDING',due_at:row.promised_delivery_date?`${row.promised_delivery_date}T17:00:00`:null,production_notes:row.internal_notes}).select().single()
    if(error)return setMessage({type:'error',text:error.message})
    const wItems=pending.map(i=>({work_order_id:w.id,product_id:i.product_id,description:i.description,quantity:number(i.quantity)-number(i.converted_quantity),unit:i.unit,unit_price:i.unit_price,line_total:round2((number(i.quantity)-number(i.converted_quantity))*number(i.unit_price)),specifications:i.specifications,sort_order:i.sort_order}))
    const ins=await supabase.from('work_order_items').insert(wItems);if(ins.error)return setMessage({type:'error',text:ins.error.message})
    for(const i of pending) await supabase.from('quote_items').update({converted_quantity:i.quantity}).eq('id',i.id)
    await changeStatus(row,'CONVERTED',`Convertida a orden OT-${String(w.number).padStart(5,'0')}`);setMessage({type:'success',text:`Orden OT-${String(w.number).padStart(5,'0')} creada correctamente.`})
  }

  const addFollowup=async()=>{
    if(!form.id)return setMessage({type:'error',text:'Guardá primero la cotización.'}); if(!followForm.due_at)return setMessage({type:'error',text:'Indicá fecha y hora de seguimiento.'})
    const {data:{user}}=await supabase.auth.getUser();const {error}=await supabase.from('quote_followups').insert({company_id:company.id,quote_id:form.id,due_at:followForm.due_at,type:followForm.type,note:followForm.note||null,owner_user_id:user?.id||null});if(error)setMessage({type:'error',text:error.message});else{setFollowForm({due_at:'',type:'FOLLOW_UP',note:''});await loadRelated(form.id);setMessage({type:'success',text:'Seguimiento programado.'})}
  }
  const completeFollowup=async f=>{await supabase.from('quote_followups').update({status:'DONE',completed_at:new Date().toISOString(),result:'Completado desde Cotizaciones 360'}).eq('id',f.id);await loadRelated(form.id)}

  const recordCommunication=async()=>{
    if(!form.id)return setMessage({type:'error',text:'Guardá primero la cotización.'});if(!commForm.message.trim())return setMessage({type:'error',text:'Escribí el mensaje.'})
    const {data:{user}}=await supabase.auth.getUser();const {error}=await supabase.from('quote_communications').insert({company_id:company.id,quote_id:form.id,channel:commForm.channel,direction:'OUTBOUND',recipient:commForm.recipient||form.contact_phone||form.contact_email||null,subject:commForm.subject||null,message:commForm.message,status:'RECORDED',sent_at:new Date().toISOString(),created_by:user?.id||null});if(error)setMessage({type:'error',text:error.message});else{setCommForm({channel:'WHATSAPP',recipient:'',subject:'',message:''});await loadRelated(form.id);setMessage({type:'success',text:'Comunicación registrada.'})}
  }

  const softDelete=async row=>{if(!window.confirm(`¿Archivar/eliminar ${row.code}? Se conservará la trazabilidad.`))return;const {error}=await supabase.from('quotes').update({soft_deleted_at:new Date().toISOString(),status:'ARCHIVED'}).eq('id',row.id).eq('company_id',company.id);if(error)setMessage({type:'error',text:error.message});else{await load();if(form.id===row.id)reset();setMessage({type:'success',text:'Cotización archivada con trazabilidad.'})}}

  const copyPublicLink=async()=>{
    if(!form.id)return setMessage({type:'error',text:'Guardá primero la cotización.'});let token=form.public_token; if(!token){const {data}=await supabase.from('quotes').select('public_token').eq('id',form.id).single();token=data?.public_token}
    const link=`${window.location.origin}/?quote=${token}`;await navigator.clipboard?.writeText(link);setMessage({type:'success',text:'Enlace seguro copiado al portapapeles.'})
  }
  const exportCsv=()=>{const lines=[['Código','Cliente','Estado','Fecha','Vigencia','Total','Margen %'],...filtered.map(q=>[q.code,q.clients?.name||'',STATUS_LABELS[q.status]||q.status,String(q.created_at||'').slice(0,10),q.valid_until||'',q.total,q.margin_percent])];const csv=lines.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`cotizaciones-${today()}.csv`;a.click();URL.revokeObjectURL(url)}
  const printQuote=()=>window.print()

  const statusOptions = form.id ? [form.status,...(ALLOWED_TRANSITIONS[form.status]||[])].filter((v,i,a)=>a.indexOf(v)===i) : ['DRAFT','PREPARED']

  return <section className="q360">
    <header className="q360-hero"><div><p className="form-kicker">CENTRO COMERCIAL 360</p><h2>Cotizaciones</h2><p>Cliente → propuesta → negociación → aprobación → orden → producción → entrega → DTE → cobro.</p></div><div className="q360-hero-actions"><button className="secondary" onClick={reset}>+ Nueva</button><button className="secondary" onClick={exportCsv}>Exportar CSV</button></div></header>
    {message.text&&<p className={`feedback ${message.type}`}>{message.text}</p>}
    <div className="q360-kpis"><Kpi label="Cotizaciones" value={stats.count}/><Kpi label="Valor cotizado" value={money(stats.value)}/><Kpi label="Aprobado" value={money(stats.approvedValue)} sub={`${stats.approvalRate}% conversión`}/><Kpi label="Pipeline abierto" value={money(stats.openValue)}/><Kpi label="Forecast ponderado" value={money(stats.forecast)}/><Kpi label="Ticket promedio" value={money(stats.averageTicket)}/></div>
    <nav className="q360-tabs">{[['EDITOR','Editor'],['HISTORY','Historial'],['FOLLOW','Seguimiento'],['ANALYTICS','Analítica']].map(([id,label])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}>{label}</button>)}</nav>

    {view==='EDITOR'&&<div className="q360-editor">
      <section className="panel q360-card">
        <div className="panel-heading"><div><p className="form-kicker">DOCUMENTO</p><h3>{form.id?`${form.code||'Cotización'} · Revisión ${form.revision}`:'Nueva cotización'}</h3></div>{form.id&&<StatusBadge status={form.status}/>}</div>
        <div className="form-grid four">
          <Field label="Cliente *" className="form-span-2"><select value={form.client_id} onChange={e=>chooseClient(e.target.value)}><option value="">Seleccionar cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.nit?` · ${c.nit}`:''}</option>)}</select></Field>
          <Field label="Estado"><select value={form.status} onChange={e=>update('status',e.target.value)}>{statusOptions.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></Field>
          <Field label="Prioridad"><select value={form.priority} onChange={e=>update('priority',e.target.value)}><option>NORMAL</option><option>ALTA</option><option>URGENTE</option><option>BAJA</option></select></Field>
          <Field label="Título / proyecto" className="form-span-2"><input value={form.title||''} onChange={e=>update('title',e.target.value)} placeholder="Ej. Uniformes corporativos 2026"/></Field>
          <Field label="Referencia"><input value={form.reference||''} onChange={e=>update('reference',e.target.value)}/></Field>
          <Field label="Canal"><select value={form.sales_channel||'DIRECTO'} onChange={e=>update('sales_channel',e.target.value)}><option>DIRECTO</option><option>WHATSAPP</option><option>FACEBOOK</option><option>INSTAGRAM</option><option>WEB</option><option>REFERIDO</option><option>VISITA</option></select></Field>
          <Field label="Vigencia"><input type="date" value={form.valid_until||''} onChange={e=>update('valid_until',e.target.value)}/></Field>
          <Field label="Cierre esperado"><input type="date" value={form.expected_close_date||''} onChange={e=>update('expected_close_date',e.target.value)}/></Field>
          <Field label="Probabilidad %"><input type="number" min="0" max="100" value={form.close_probability??''} onChange={e=>update('close_probability',e.target.value)}/></Field>
          <Field label="Margen objetivo %"><input type="number" min="0" value={form.minimum_margin??0} onChange={e=>update('minimum_margin',e.target.value)}/></Field>
          <Field label="Contacto"><input value={form.contact_name||''} onChange={e=>update('contact_name',e.target.value)}/></Field>
          <Field label="WhatsApp / teléfono"><input value={form.contact_phone||''} onChange={e=>update('contact_phone',e.target.value)}/></Field>
          <Field label="Correo"><input type="email" value={form.contact_email||''} onChange={e=>update('contact_email',e.target.value)}/></Field>
          <Field label="Etiquetas"><input value={form.tags_text||''} onChange={e=>update('tags_text',e.target.value)} placeholder="corporativo, urgente, recurrente"/></Field>
        </div>
      </section>

      <section className="panel q360-card q360-items"><div className="panel-heading"><div><p className="form-kicker">PARTIDAS</p><h3>Productos y trabajos</h3></div><button onClick={()=>setItems(r=>[...r,emptyItem()])}>+ Agregar partida</button></div>
        {items.map((item,idx)=>{const calc=calculateItem(item);const itemVariants=variants.filter(v=>v.product_id===item.product_id);return <article className="q360-item" key={idx}>
          <div className="q360-item-head"><strong>Partida {idx+1}</strong><span>{money(calc.total)} · Margen {calc.margin}%</span><div><button className="secondary" onClick={()=>setItems(r=>[...r.slice(0,idx+1),cloneItem(item),...r.slice(idx+1)])}>Duplicar</button>{items.length>1&&<button className="danger ghost" onClick={()=>setItems(r=>r.filter((_,i)=>i!==idx))}>Quitar</button>}</div></div>
          <div className="form-grid four">
            <Field label="Producto"><select value={item.product_id||''} onChange={e=>chooseProduct(idx,e.target.value)}><option value="">Manual / personalizado</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku?`${p.sku} · `:''}{p.name}</option>)}</select></Field>
            <Field label="Variante"><select value={item.variant_id||''} onChange={e=>chooseVariant(idx,e.target.value)} disabled={!itemVariants.length}><option value="">Estándar</option>{itemVariants.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            <Field label="Descripción *" className="form-span-2"><input value={item.description} onChange={e=>updateItem(idx,'description',e.target.value)}/></Field>
            <Field label="Cantidad"><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={e=>quantityChanged(idx,e.target.value)}/></Field>
            <Field label="Unidad"><input value={item.unit} onChange={e=>updateItem(idx,'unit',e.target.value)}/></Field>
            <Field label="Precio unitario"><input type="number" step="0.01" value={item.unit_price} onChange={e=>updateItem(idx,'unit_price',e.target.value)}/></Field>
            <Field label="Precio mínimo"><input type="number" step="0.01" value={item.minimum_price} onChange={e=>updateItem(idx,'minimum_price',e.target.value)}/></Field>
            <Field label="Ancho"><input type="number" step="0.001" value={item.width} onChange={e=>updateItem(idx,'width',e.target.value)}/></Field>
            <Field label="Alto"><input type="number" step="0.001" value={item.height} onChange={e=>updateItem(idx,'height',e.target.value)}/></Field>
            <Field label="Unidad medida"><select value={item.dimension_unit} onChange={e=>updateItem(idx,'dimension_unit',e.target.value)}><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></select></Field>
            <Field label="Precio por m²"><input type="number" step="0.01" value={item.price_per_m2} onChange={e=>updateItem(idx,'price_per_m2',e.target.value)}/></Field>
            <Field label="Descuento %"><input type="number" min="0" max="100" value={item.discount_percent} onChange={e=>updateItem(idx,'discount_percent',e.target.value)}/></Field>
            <Field label="Descuento $"><input type="number" min="0" step="0.01" value={item.discount_fixed} onChange={e=>updateItem(idx,'discount_fixed',e.target.value)}/></Field>
            <Field label="Recargo %"><input type="number" min="0" value={item.surcharge_percent} onChange={e=>updateItem(idx,'surcharge_percent',e.target.value)}/></Field>
            <Field label="IVA %"><input type="number" min="0" value={item.tax_rate} onChange={e=>updateItem(idx,'tax_rate',e.target.value)} disabled={!item.taxable}/></Field>
            <Field label="Costo base"><input type="number" step="0.01" value={item.unit_cost} onChange={e=>updateItem(idx,'unit_cost',e.target.value)}/></Field>
            <Field label="Mano de obra"><input type="number" step="0.01" value={item.labor_unit_cost} onChange={e=>updateItem(idx,'labor_unit_cost',e.target.value)}/></Field>
            <Field label="Instalación"><input type="number" step="0.01" value={item.installation_unit_cost} onChange={e=>updateItem(idx,'installation_unit_cost',e.target.value)}/></Field>
            <Field label="Grupo"><input value={item.group_name||''} onChange={e=>updateItem(idx,'group_name',e.target.value)} placeholder="Opción A, Fachada..."/></Field>
            <Field label="Especificaciones" className="form-span-2"><textarea rows="2" value={item.specifications||''} onChange={e=>updateItem(idx,'specifications',e.target.value)}/></Field>
            <Field label="Notas internas" className="form-span-2"><textarea rows="2" value={item.internal_notes||''} onChange={e=>updateItem(idx,'internal_notes',e.target.value)}/></Field>
          </div>
          <div className="q360-item-metrics"><span>Área <b>{calc.area} m²</b></span><span>Bruto <b>{money(calc.gross)}</b></span><span>Descuento <b>{money(calc.discount)}</b></span><span>IVA <b>{money(calc.tax)}</b></span><span>Costo <b>{money(calc.totalCost)}</b></span><span>Utilidad <b>{money(calc.profit)}</b></span><span>Margen <b className={calc.margin<number(form.minimum_margin)?'danger-text':'good-text'}>{calc.margin}%</b></span></div>
        </article>})}
      </section>

      <div className="q360-bottom-grid">
        <section className="panel q360-card"><div className="panel-heading"><h3>Condiciones comerciales</h3></div><div className="form-grid two">
          <Field label="Descuento global %"><input type="number" value={form.discount_percent} onChange={e=>update('discount_percent',e.target.value)}/></Field><Field label="Descuento global $"><input type="number" value={form.discount_fixed} onChange={e=>update('discount_fixed',e.target.value)}/></Field>
          <Field label="Recargo global %"><input type="number" value={form.surcharge_percent} onChange={e=>update('surcharge_percent',e.target.value)}/></Field><Field label="Recargo global $"><input type="number" value={form.surcharge_fixed} onChange={e=>update('surcharge_fixed',e.target.value)}/></Field>
          <Field label="Forma de pago"><select value={form.payment_method||''} onChange={e=>update('payment_method',e.target.value)}><option>TRANSFERENCIA</option><option>EFECTIVO</option><option>TARJETA</option><option>CHEQUE</option><option>DEPÓSITO</option><option>MIXTO</option></select></Field><Field label="Condición"><input value={form.payment_terms||''} onChange={e=>update('payment_terms',e.target.value)}/></Field>
          <Field label="Anticipo %"><input type="number" min="0" max="100" value={form.deposit_percent} onChange={e=>update('deposit_percent',e.target.value)}/></Field><Field label="Días de crédito"><input type="number" min="0" value={form.credit_days} onChange={e=>update('credit_days',e.target.value)}/></Field>
          <Field label="Entrega solicitada"><input type="date" value={form.requested_delivery_date||''} onChange={e=>update('requested_delivery_date',e.target.value)}/></Field><Field label="Entrega prometida"><input type="date" value={form.promised_delivery_date||''} onChange={e=>update('promised_delivery_date',e.target.value)}/></Field>
          <Field label="Notas para cliente" className="form-span-2"><textarea rows="3" value={form.customer_notes||''} onChange={e=>update('customer_notes',e.target.value)}/></Field><Field label="Notas internas" className="form-span-2"><textarea rows="3" value={form.internal_notes||''} onChange={e=>update('internal_notes',e.target.value)}/></Field>
          <Field label="Términos y condiciones" className="form-span-2"><textarea rows="4" value={form.terms_and_conditions||''} onChange={e=>update('terms_and_conditions',e.target.value)}/></Field>
        </div></section>
        <aside className="panel q360-summary"><p className="form-kicker">RESUMEN FINANCIERO</p><div><span>Bruto</span><b>{money(totals.gross)}</b></div><div><span>Descuentos</span><b>-{money(totals.lineDiscount+totals.globalDiscount)}</b></div><div><span>Recargos</span><b>{money(totals.lineSurcharge+totals.globalSurcharge)}</b></div><div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div><div><span>IVA</span><b>{money(totals.tax)}</b></div><div className="grand"><span>Total</span><b>{money(totals.total)}</b></div><div><span>Costo estimado</span><b>{money(totals.cost)}</b></div><div><span>Utilidad</span><b>{money(totals.profit)}</b></div><div><span>Margen</span><b className={totals.margin<number(form.minimum_margin)?'danger-text':'good-text'}>{totals.margin}%</b></div><div><span>Anticipo</span><b>{money(totals.total*number(form.deposit_percent)/100)}</b></div><div><span>Saldo</span><b>{money(totals.total-totals.total*number(form.deposit_percent)/100)}</b></div>{validation.warnings.length>0&&<div className="q360-warnings">{validation.warnings.map((w,i)=><small key={i}>⚠ {w}</small>)}</div>}</aside>
      </div>
      <div className="q360-actions"><button disabled={busy} onClick={()=>save()}>{busy?'Guardando…':form.id?'Guardar cambios':'Crear cotización'}</button>{form.id&&<><button className="secondary" onClick={()=>save({newRevision:true})}>Nueva revisión</button><button className="secondary" onClick={printQuote}>Imprimir / PDF</button><button className="secondary" onClick={copyPublicLink}>Copiar enlace</button>{form.status==='APPROVED'&&<button onClick={()=>convertToWorkOrder(form)}>Crear orden</button>}</>}</div>
    </div>}

    {view==='HISTORY'&&<section className="panel q360-card"><div className="q360-filters"><input placeholder="Buscar por código, cliente, proyecto..." value={query} onChange={e=>setQuery(e.target.value)}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">Todos los estados</option>{QUOTE_STATUSES.map(s=><option value={s} key={s}>{STATUS_LABELS[s]}</option>)}</select><select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}><option value="ALL">Todos los clientes</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="q360-table-wrap"><table className="q360-table"><thead><tr><th>Código</th><th>Cliente</th><th>Estado</th><th>Vigencia</th><th>Total</th><th>Margen</th><th>Acciones</th></tr></thead><tbody>{filtered.map(q=><tr key={q.id}><td><button className="link-button" onClick={()=>editQuote(q)}>{q.code||`COT-${q.number}`}</button><small>{q.title||q.project_name||'Sin título'}</small></td><td>{q.clients?.name||'Cliente'}</td><td><StatusBadge status={q.status}/></td><td>{q.valid_until||'—'}</td><td>{money(q.total)}</td><td>{number(q.margin_percent)}%</td><td><div className="table-actions"><button onClick={()=>editQuote(q)}>Abrir</button><button className="secondary" onClick={()=>duplicate(q)}>Duplicar</button>{q.status==='DRAFT'&&<button onClick={()=>changeStatus(q,'SENT')}>Enviar</button>}{['SENT','VIEWED','NEGOTIATION','PENDING'].includes(q.status)&&<button onClick={()=>changeStatus(q,'APPROVED')}>Aprobar</button>}{q.status==='APPROVED'&&<button onClick={()=>convertToWorkOrder(q)}>Orden</button>}<button className="danger ghost" onClick={()=>softDelete(q)}>Archivar</button></div></td></tr>)}</tbody></table></div>{!filtered.length&&<div className="empty-state"><strong>No hay resultados</strong></div>}</section>}

    {view==='FOLLOW'&&<div className="q360-follow-grid"><section className="panel q360-card"><div className="panel-heading"><div><p className="form-kicker">SEGUIMIENTOS</p><h3>{form.id?form.code:'Abrí una cotización primero'}</h3></div></div>{form.id&&<><div className="form-grid two"><Field label="Fecha y hora"><input type="datetime-local" value={followForm.due_at} onChange={e=>setFollowForm({...followForm,due_at:e.target.value})}/></Field><Field label="Tipo"><select value={followForm.type} onChange={e=>setFollowForm({...followForm,type:e.target.value})}><option>FOLLOW_UP</option><option>CALL</option><option>MEETING</option><option>WHATSAPP</option><option>EMAIL</option><option>PAYMENT</option></select></Field><Field label="Nota" className="form-span-2"><textarea value={followForm.note} onChange={e=>setFollowForm({...followForm,note:e.target.value})}/></Field></div><button onClick={addFollowup}>Programar seguimiento</button><div className="q360-timeline">{followups.map(f=><div key={f.id}><span>{new Date(f.due_at).toLocaleString('es-SV')}</span><strong>{f.type} · {f.status}</strong><p>{f.note||'Sin nota'}</p>{f.status==='PENDING'&&<button className="secondary" onClick={()=>completeFollowup(f)}>Completar</button>}</div>)}</div></>}</section><section className="panel q360-card"><div className="panel-heading"><h3>Comunicaciones</h3></div>{form.id&&<><div className="form-grid two"><Field label="Canal"><select value={commForm.channel} onChange={e=>setCommForm({...commForm,channel:e.target.value})}><option>WHATSAPP</option><option>EMAIL</option><option>CALL</option><option>MEETING</option><option>INTERNAL</option></select></Field><Field label="Destinatario"><input value={commForm.recipient} onChange={e=>setCommForm({...commForm,recipient:e.target.value})}/></Field><Field label="Asunto" className="form-span-2"><input value={commForm.subject} onChange={e=>setCommForm({...commForm,subject:e.target.value})}/></Field><Field label="Mensaje" className="form-span-2"><textarea rows="4" value={commForm.message} onChange={e=>setCommForm({...commForm,message:e.target.value})}/></Field></div><button onClick={recordCommunication}>Registrar comunicación</button><div className="q360-timeline">{communications.map(c=><div key={c.id}><span>{new Date(c.created_at).toLocaleString('es-SV')}</span><strong>{c.channel} · {c.recipient||'Interno'}</strong><p>{c.message}</p></div>)}</div></>}</section></div>}

    {view==='ANALYTICS'&&<div className="q360-analytics"><section className="panel q360-card"><div className="panel-heading"><div><p className="form-kicker">PIPELINE</p><h3>Rendimiento comercial</h3></div></div><div className="q360-kpis"><Kpi label="Conversión" value={`${stats.approvalRate}%`}/><Kpi label="Rechazo" value={`${stats.rejectionRate}%`}/><Kpi label="Forecast" value={money(stats.forecast)}/><Kpi label="Ticket promedio" value={money(stats.averageTicket)}/></div><div className="q360-stage-list">{QUOTE_STATUSES.map(s=>{const group=quotes.filter(q=>q.status===s);if(!group.length)return null;return <div key={s}><span>{STATUS_LABELS[s]}</span><b>{group.length}</b><strong>{money(group.reduce((a,q)=>a+number(q.total),0))}</strong></div>})}</div></section><section className="panel q360-card"><div className="panel-heading"><h3>Auditoría de cotización activa</h3></div>{form.id?<><div className="q360-audit"><p><b>Versiones:</b> {versions.length}</p><p><b>Cambios de estado:</b> {history.length}</p><p><b>Comunicaciones:</b> {communications.length}</p><p><b>Seguimientos:</b> {followups.length}</p><p><b>Aprobaciones:</b> {approvals.length}</p></div><div className="q360-timeline">{history.map(h=><div key={h.id}><span>{new Date(h.changed_at).toLocaleString('es-SV')}</span><strong>{STATUS_LABELS[h.from_status]||h.from_status||'Inicio'} → {STATUS_LABELS[h.to_status]||h.to_status}</strong><p>{h.comment||'Cambio registrado'}</p></div>)}</div></>:<div className="empty-state"><strong>Abrí una cotización para ver su auditoría.</strong></div>}</section></div>}
  </section>
}
