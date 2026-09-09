import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-commercial-ready.css'

const API_URL=import.meta.env.VITE_API_URL||'https://idealo-sv-api.onrender.com'
const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date())
const fmt=v=>v?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—'
const roleName={owner:'Propietario',manager:'Gerente',cashier:'Cajero',waiter:'Mesero',kitchen:'Cocina',bar:'Barra',warehouse:'Bodega'}
const statusName={DRAFT:'Borrador',SIGNING:'Firmando',SIGNED:'Firmado',TRANSMITTING:'Transmitiendo',PROCESSED:'Procesado MH',REJECTED:'Rechazado',TRANSMISSION_UNKNOWN:'Revisión manual'}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

async function apiCall(supabase,path,{method='GET',body}={}){
 const {data:{session}}=await supabase.auth.getSession()
 if(!session?.access_token)throw new Error('La sesión venció. Vuelve a iniciar sesión.')
 const response=await fetch(`${API_URL}${path}`,{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 const payload=await response.json().catch(()=>({}))
 if(!response.ok)throw new Error(payload.message||payload.error||`La API respondió HTTP ${response.status}.`)
 return payload
}

function receiptSeal(doc){const r=doc?.mh_response?.body||doc?.mh_response||{};return doc?.mh_receipt_seal||r.selloRecibido||r.selloRecepcion||r.sello||''}
function fiscalTotal(doc){const r=doc?.dte_payload?.resumen||{};return Number(r.totalPagar??r.montoTotalOperacion??0)}

export default function IdealoBarCommercialReady({company,supabase,access,onOpenCatalog,onOpenInventory,onOpenAdmin}){
 const companyId=company?.id
 const [tab,setTab]=useState('Puesta en marcha')
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [readiness,setReadiness]=useState({checks:[],role_counts:{}}),[audit,setAudit]=useState({}),[settings,setSettings]=useState(null)
 const [dtes,setDtes]=useState([]),[orders,setOrders]=useState([]),[printJobs,setPrintJobs]=useState([]),[tables,setTables]=useState([])
 const [inventory,setInventory]=useState([]),[presentations,setPresentations]=useState([]),[stockAlerts,setStockAlerts]=useState([])
 const [selectedInventory,setSelectedInventory]=useState(''),[closeDate,setCloseDate]=useState(today()),[closeReport,setCloseReport]=useState(null),[counted,setCounted]=useState({})
 const [preflight,setPreflight]=useState(null)
 const permissions=access?.permissions||[]
 const can=p=>permissions.includes('*')||permissions.includes(p)
 const isAdmin=can('admin.manage')

 const load=useCallback(async()=>{
  if(!companyId)return
  setLoading(true);setError('')
  const calls=[
   supabase.rpc('bar_commercial_readiness',{p_company_id:companyId}),
   isAdmin?supabase.rpc('bar_runtime_audit',{p_company_id:companyId}):Promise.resolve({data:{}}),
   supabase.from('bar_settings').select('*').eq('company_id',companyId).maybeSingle(),
   supabase.from('dte_documents').select('id,client_id,bar_order_id,dte_type,environment,status,control_number,generation_code,dte_payload,signed_document,mh_response,mh_receipt_seal,mh_message,created_at,updated_at').eq('company_id',companyId).not('bar_order_id','is',null).order('created_at',{ascending:false}).limit(100),
   supabase.from('bar_orders').select('id,order_code,status,total,customer_name,created_at,closed_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(250),
   supabase.from('bar_print_jobs').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(200),
   supabase.from('bar_tables').select('id,name').eq('company_id',companyId),
   supabase.from('inventory_items').select('id,name,unit,current_stock,reorder_point,target_stock,minimum_stock').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('name'),
   supabase.from('bar_inventory_presentations').select('*').eq('company_id',companyId).eq('active',true).order('created_at',{ascending:false}),
   supabase.rpc('bar_stock_alerts',{p_company_id:companyId}),
  ]
  const r=await Promise.all(calls);const e=r.find(x=>x?.error)?.error
  if(e)setError(e.message);else{
   setReadiness(r[0].data||{checks:[]});setAudit(r[1].data||{});setSettings(r[2].data||null);setDtes(r[3].data||[]);setOrders(r[4].data||[]);setPrintJobs(r[5].data||[]);setTables(r[6].data||[]);setInventory(r[7].data||[]);setPresentations(r[8].data||[]);setStockAlerts(r[9].data||[])
  }
  setLoading(false)
 },[companyId,supabase,isAdmin])
 useEffect(()=>{load()},[load])

 const loadClose=useCallback(async()=>{
  if(!companyId||!isAdmin)return
  const {data,error:e}=await supabase.rpc('bar_daily_close_report',{p_company_id:companyId,p_business_date:closeDate})
  if(e)setError(e.message);else setCloseReport(data||{})
 },[companyId,supabase,closeDate,isAdmin])
 useEffect(()=>{if(tab==='Cierre diario')loadClose()},[tab,loadClose])

 const run=async(fn,msg)=>{setWorking(true);setError('');setNotice('');try{const result=await fn();if(msg)setNotice(typeof msg==='function'?msg(result):msg);await load();return result}catch(e){setError(e.message||String(e));return null}finally{setWorking(false)}}
 const bootstrap=()=>run(async()=>{const {data,error:e}=await supabase.rpc('bar_bootstrap_business',{p_company_id:companyId,p_table_count:12});if(e)throw e;return data},data=>data?.message||'Base inicial preparada.')
 const markReady=()=>run(async()=>{const {data,error:e}=await supabase.rpc('bar_mark_commercial_ready',{p_company_id:companyId});if(e)throw e;return data},'Puesta en marcha finalizada.')
 const saveSettings=()=>run(async()=>{
  if(!settings)throw new Error('Primero prepara la base inicial.')
  const payload={company_id:companyId,business_name:String(settings.business_name||'IDEALO BAR').trim()||'IDEALO BAR',opening_time:settings.opening_time||null,closing_time:settings.closing_time||null,suggested_tip_percent:Number(settings.suggested_tip_percent||0),receipt_paper_width:Number(settings.receipt_paper_width||80),kitchen_printer_name:String(settings.kitchen_printer_name||'').trim()||null,bar_printer_name:String(settings.bar_printer_name||'').trim()||null,auto_print_kitchen:Boolean(settings.auto_print_kitchen),auto_print_bar:Boolean(settings.auto_print_bar),auto_dte_on_paid:Boolean(settings.auto_dte_on_paid),default_dte_environment:settings.default_dte_environment||'test',default_dte_type:settings.default_dte_type||'01',updated_at:new Date().toISOString()}
  const {error:e}=await supabase.from('bar_settings').upsert(payload,{onConflict:'company_id'});if(e)throw e
 },'Configuración guardada.')

 const loadPreflight=()=>run(async()=>{const p=await apiCall(supabase,`/api/dte/production-preflight?companyId=${encodeURIComponent(companyId)}`);setPreflight(p);return p},'Preflight fiscal actualizado.')
 const signDte=doc=>run(async()=>{
  if(doc.environment==='production'){
   const expected=`FIRMAR PRODUCCION ${doc.control_number}`
   const confirmation=window.prompt(`Firma de PRODUCCIÓN protegida. Escribe exactamente:\n${expected}`,'')
   if(confirmation!==expected)throw new Error('Firma de PRODUCCIÓN cancelada: la confirmación no coincide.')
   return apiCall(supabase,'/api/dte/sign-production',{method:'POST',body:{documentId:doc.id,confirmation}})
  }
  return apiCall(supabase,'/api/dte/sign-test',{method:'POST',body:{documentId:doc.id}})
 },'DTE firmado correctamente.')
 const transmitDte=doc=>run(async()=>{
  if(doc.environment==='production'){
   const expected=`TRANSMITIR PRODUCCION ${doc.control_number}`
   const confirmation=window.prompt(`ENVÍO REAL A HACIENDA. Escribe exactamente:\n${expected}`,'')
   if(confirmation!==expected)throw new Error('Transmisión de PRODUCCIÓN cancelada: la confirmación no coincide.')
   return apiCall(supabase,'/api/dte/transmit-production',{method:'POST',body:{documentId:doc.id,confirmation}})
  }
  return apiCall(supabase,'/api/dte/transmit-test',{method:'POST',body:{documentId:doc.id}})
 },'Respuesta de Hacienda registrada.')
 const regenerateDte=doc=>run(async()=>{const {data,error:e}=await supabase.rpc('bar_generate_dte_draft',{p_order_id:doc.bar_order_id,p_client_id:doc.client_id||null,p_dte_type:doc.dte_type,p_environment:doc.environment});if(e)throw e;return data},'Nuevo borrador preparado después del rechazo.')

 const printFiscal=doc=>{
  const dte=doc.dte_payload||{},id=dte.identificacion||{},e=dte.emisor||{},r=dte.receptor||{},summary=dte.resumen||{},items=Array.isArray(dte.cuerpoDocumento)?dte.cuerpoDocumento:[],seal=receiptSeal(doc)
  const w=window.open('','_blank','width=900,height=900');if(!w){setError('El navegador bloqueó la ventana de impresión. Habilita ventanas emergentes para IDEALO BAR.');return}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.control_number)}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#111;margin:0}.head{background:#111;color:#fff;padding:18px;border-left:6px solid #f97316}.head h1{color:#f97316;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.box{border:1px solid #ccc;padding:12px;border-radius:8px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#222;color:#fff}.num{text-align:right}.total{font-size:22px;font-weight:800;text-align:right;margin-top:16px}.seal{word-break:break-all;background:#f3f3f3;padding:10px}small{color:#666}@media print{button{display:none}}</style></head><body><div class="head"><h1>${esc(settings?.business_name||e.nombreComercial||'IDEALO BAR')}</h1><b>${doc.dte_type==='03'?'CRÉDITO FISCAL DTE-03':'FACTURA DTE-01'}</b><div>${esc(doc.control_number)}</div><small>${esc(id.fecEmi||'')} ${esc(id.horEmi||'')} · ${doc.environment==='production'?'PRODUCCIÓN':'TEST'}</small></div><div class="grid"><div class="box"><b>Emisor</b><div>${esc(e.nombre||'')}</div><div>NIT ${esc(e.nit||'')} · NRC ${esc(e.nrc||'')}</div></div><div class="box"><b>Receptor</b><div>${esc(r?.nombre||'Consumidor final')}</div><div>${esc(r?.nit||r?.numDocumento||'')}</div></div></div><table><thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.descripcion)}</td><td class="num">${esc(i.cantidad)}</td><td class="num">${money.format(Number(i.precioUni||0))}</td><td class="num">${money.format(Number(i.ventaGravada||0)+Number(i.ventaExenta||0)+Number(i.ventaNoSuj||0))}</td></tr>`).join('')}</tbody></table><div class="total">TOTAL ${money.format(fiscalTotal(doc))}</div><div class="box"><b>Estado MH: ${esc(statusName[doc.status]||doc.status)}</b><div class="seal">Sello de recepción: ${esc(seal||'Pendiente')}</div><div>Código de generación: ${esc(doc.generation_code)}</div></div><button onclick="window.print()">Imprimir</button></body></html>`);w.document.close();w.focus()
 }

 const tableMap=useMemo(()=>new Map(tables.map(t=>[t.id,t.name])),[tables])
 const printCommand=job=>{
  const p=job.payload||{},width=Number(settings?.receipt_paper_width||80),station=job.station==='kitchen'?'COCINA':'BARRA',w=window.open('','_blank','width=460,height=720')
  if(!w){setError('El navegador bloqueó la ventana de impresión. Habilita ventanas emergentes.');return}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(station)} ${esc(p.order_code)}</title><style>@page{size:${width}mm auto;margin:2mm}body{width:${Math.max(width-5,50)}mm;font-family:ui-monospace,monospace;font-size:13px;margin:0;color:#000}.center{text-align:center}.big{font-size:22px;font-weight:900}.line{border-top:2px dashed #000;margin:8px 0}.item{font-size:20px;font-weight:900}.notes{font-size:15px;border:2px solid #000;padding:5px;margin-top:7px}</style></head><body><div class="center big">${esc(station)}</div><div class="center">${esc(p.order_code||'PEDIDO')}</div><div class="line"></div><div><b>${esc(tableMap.get(p.table_id)||p.order_type||'Pedido')}</b></div>${p.customer_name?`<div>${esc(p.customer_name)}</div>`:''}<div class="line"></div><div class="item">${esc(p.quantity)} × ${esc(p.item_name)}</div>${p.notes?`<div class="notes">${esc(p.notes)}</div>`:''}<div class="line"></div><div class="center">${fmt(p.sent_at)}</div></body></html>`);w.document.close();w.focus();w.onafterprint=()=>{supabase.from('bar_print_jobs').update({status:'PRINTED',printed_at:new Date().toISOString(),attempts:Number(job.attempts||0)+1}).eq('id',job.id).then(()=>load())};setTimeout(()=>w.print(),250)
 }
 const reprint=job=>run(async()=>{const {error:e}=await supabase.from('bar_print_jobs').insert({company_id:companyId,order_id:job.order_id,station:job.station,ticket_type:'REPRINT',payload:job.payload,printer_name:job.printer_name});if(e)throw e},'Reimpresión agregada a la cola.')

 const quickPresentation=(name,units,code)=>run(async()=>{if(!selectedInventory)throw new Error('Selecciona un insumo real.');const {error:e}=await supabase.from('bar_inventory_presentations').upsert({company_id:companyId,inventory_item_id:selectedInventory,name,code,units_per_presentation:units,active:true},{onConflict:'company_id,inventory_item_id,name'});if(e)throw e},`${name} configurada.`)
 const prepareRestock=itemId=>run(async()=>{const {data,error:e}=await supabase.rpc('bar_prepare_restock',{p_company_id:companyId,p_inventory_item_id:itemId});if(e)throw e;return data},'Reposición enviada al flujo central de compras.')
 const closeCash=session=>run(async()=>{const value=Number(counted[session.id]);if(!Number.isFinite(value)||value<0)throw new Error('Ingresa el efectivo contado.');const {data,error:e}=await supabase.rpc('close_cash_register',{p_session:session.id,p_counted:value,p_notes:'Cierre desde Centro Comercial IDEALO BAR'});if(e)throw e;await loadClose();return data},data=>`Caja cerrada. Diferencia: ${money.format(Number(data?.difference||0))}`)

 const orderMap=useMemo(()=>new Map(orders.map(o=>[o.id,o])),[orders])
 const requiredMissing=(readiness.checks||[]).filter(x=>x.required&&!x.ok)
 const tabs=['Puesta en marcha','DTE completo','Impresión','Inventario comercial','Cierre diario','Auditoría']
 if(loading)return <div className="barready-loading">Preparando versión comercial de IDEALO BAR…</div>
 return <section className="barready">
  <header><div><small>IDEALO BAR · VERSIÓN COMERCIAL</small><h2>Puesta en marcha y control final</h2><p>Configuración, fiscalidad, impresión, inventario, cierre y auditoría sin mezclar productos de otros negocios.</p></div><button type="button" onClick={load}>↻ Actualizar</button></header>
  {error&&<div className="barready-alert error">{error}</div>}{notice&&<div className="barready-alert ok">✓ {notice}</div>}
  <nav>{tabs.map(x=><button type="button" key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</nav>

  {tab==='Puesta en marcha'&&<div className="barready-grid two">
   <Panel title="Estado de preparación"><div className="barready-score"><strong>{Number(readiness.score||0)}%</strong><span>{readiness.ready_for_sales?'Listo para operar':'Preparación pendiente'}</span></div>{(readiness.checks||[]).map(c=><article className={`barready-check ${c.ok?'ok':'pending'}`} key={c.id}><span>{c.ok?'✓':'!'}</span><div><b>{c.label}{!c.required?' · recomendado':''}</b><small>{c.detail}</small></div>{!c.ok&&c.id==='menu'&&<button type="button" onClick={onOpenCatalog}>Abrir Carta</button>}{!c.ok&&c.id==='recipes'&&<button type="button" onClick={onOpenInventory}>Abrir Recetas</button>}{!c.ok&&c.id==='staff'&&<button type="button" onClick={onOpenAdmin}>Abrir Personal</button>}</article>)}<div className="barready-actions"><button type="button" disabled={working||!isAdmin} onClick={bootstrap}>Preparar base inicial</button><button type="button" className="primary" disabled={working||!isAdmin||!readiness.ready_for_sales} onClick={markReady}>Marcar listo para vender</button></div>{requiredMissing.length>0&&<p className="barready-note">Faltan {requiredMissing.length} requisito(s) obligatorio(s). No se crean productos ficticios para completar el porcentaje.</p>}</Panel>
   <Panel title="Configuración comercial">{settings?<div className="barready-form"><label>Nombre visible<input value={settings.business_name||''} onChange={e=>setSettings(v=>({...v,business_name:e.target.value}))}/></label><div className="split"><label>Apertura<input type="time" value={String(settings.opening_time||'').slice(0,5)} onChange={e=>setSettings(v=>({...v,opening_time:e.target.value}))}/></label><label>Cierre<input type="time" value={String(settings.closing_time||'').slice(0,5)} onChange={e=>setSettings(v=>({...v,closing_time:e.target.value}))}/></label></div><div className="split"><label>Propina sugerida %<input type="number" min="0" max="100" value={settings.suggested_tip_percent??10} onChange={e=>setSettings(v=>({...v,suggested_tip_percent:e.target.value}))}/></label><label>Papel térmico<select value={settings.receipt_paper_width||80} onChange={e=>setSettings(v=>({...v,receipt_paper_width:Number(e.target.value)}))}><option value="58">58 mm</option><option value="80">80 mm</option></select></label></div><label>Impresora Cocina<input value={settings.kitchen_printer_name||''} onChange={e=>setSettings(v=>({...v,kitchen_printer_name:e.target.value}))} placeholder="Ej. Cocina-80mm"/></label><label>Impresora Barra<input value={settings.bar_printer_name||''} onChange={e=>setSettings(v=>({...v,bar_printer_name:e.target.value}))} placeholder="Ej. Barra-80mm"/></label><div className="toggles"><label><input type="checkbox" checked={Boolean(settings.auto_print_kitchen)} onChange={e=>setSettings(v=>({...v,auto_print_kitchen:e.target.checked}))}/> Cola automática Cocina</label><label><input type="checkbox" checked={Boolean(settings.auto_print_bar)} onChange={e=>setSettings(v=>({...v,auto_print_bar:e.target.checked}))}/> Cola automática Barra</label><label><input type="checkbox" checked={Boolean(settings.auto_dte_on_paid)} onChange={e=>setSettings(v=>({...v,auto_dte_on_paid:e.target.checked}))}/> Crear borrador DTE al pagar</label></div><div className="split"><label>DTE predeterminado<select value={settings.default_dte_type||'01'} onChange={e=>setSettings(v=>({...v,default_dte_type:e.target.value}))}><option value="01">Factura 01</option><option value="03">CCF 03</option></select></label><label>Ambiente<select value={settings.default_dte_environment||'test'} onChange={e=>setSettings(v=>({...v,default_dte_environment:e.target.value}))}><option value="test">TEST</option><option value="production">PRODUCCIÓN</option></select></label></div><button type="button" className="primary" disabled={working||!isAdmin} onClick={saveSettings}>Guardar configuración</button></div>:<div className="barready-empty">Ejecuta “Preparar base inicial”.</div>}</Panel>
  </div>}

  {tab==='DTE completo'&&<div className="barready-grid two">
   <Panel title="Cadena fiscal"><p className="barready-note">Venta pagada → Borrador → Firma → Transmisión MH → Sello/estado. PRODUCCIÓN nunca se transmite sin confirmación textual explícita.</p><button type="button" disabled={working||!isAdmin} onClick={loadPreflight}>Revisar preflight PRODUCCIÓN</button>{preflight&&<pre className="barready-pre">{JSON.stringify(preflight,null,2)}</pre>}</Panel>
   <Panel title="DTE de ventas del bar">{dtes.length?dtes.slice(0,30).map(doc=><article className="barready-dte" key={doc.id}><div><b>{doc.control_number}</b><small>{doc.environment.toUpperCase()} · {doc.dte_type==='03'?'CCF 03':'Factura 01'} · {orderMap.get(doc.bar_order_id)?.order_code||''}</small><span className={`status ${doc.status}`}>{statusName[doc.status]||doc.status}</span>{doc.mh_message&&<em>{doc.mh_message}</em>}{receiptSeal(doc)&&<small>Sello MH: {receiptSeal(doc)}</small>}</div><div className="actions">{doc.status==='DRAFT'&&<button type="button" disabled={working} onClick={()=>signDte(doc)}>Firmar</button>}{doc.status==='SIGNED'&&<button type="button" className="primary" disabled={working} onClick={()=>transmitDte(doc)}>{doc.environment==='production'?'Transmitir PRODUCCIÓN':'Transmitir TEST'}</button>}{doc.status==='PROCESSED'&&<button type="button" onClick={()=>printFiscal(doc)}>Imprimir DTE</button>}{doc.status==='REJECTED'&&<button type="button" disabled={working} onClick={()=>regenerateDte(doc)}>Nuevo borrador</button>}</div></article>):<div className="barready-empty">Aún no hay ventas del bar con DTE.</div>}</Panel>
  </div>}

  {tab==='Impresión'&&<div className="barready-grid two"><Panel title={`Cola térmica · ${settings?.receipt_paper_width||80} mm`}><p className="barready-note">Cada producto enviado genera su comanda en Cocina o Barra. “Imprimir” abre el diálogo del dispositivo; el trabajo se marca impreso después del evento de impresión.</p>{printJobs.length?printJobs.slice(0,50).map(j=><article key={j.id}><div><b>{j.station==='kitchen'?'Cocina':'Barra'} · {j.payload?.order_code||''}</b><small>{j.payload?.quantity} × {j.payload?.item_name} · {j.status} · {fmt(j.created_at)}</small></div><div className="actions"><button type="button" onClick={()=>printCommand(j)}>Imprimir</button><button type="button" disabled={working} onClick={()=>reprint(j)}>Reimprimir</button></div></article>):<div className="barready-empty">No hay comandas en cola.</div>}</Panel><Panel title="Configuración física"><div className="barready-kpis"><Kpi label="Pendientes" value={printJobs.filter(x=>x.status==='PENDING').length}/><Kpi label="Impresas" value={printJobs.filter(x=>x.status==='PRINTED').length}/><Kpi label="Papel" value={`${settings?.receipt_paper_width||80} mm`}/></div><p className="barready-note">La aplicación ya genera formato térmico 58/80 mm. La selección de la impresora física se realiza en el diálogo de impresión del teléfono/tablet/PC o mediante el controlador del dispositivo.</p></Panel></div>}

  {tab==='Inventario comercial'&&<div className="barready-grid two"><Panel title="Presentaciones rápidas"><select value={selectedInventory} onChange={e=>setSelectedInventory(e.target.value)}><option value="">Seleccionar insumo real…</option>{inventory.map(i=><option key={i.id} value={i.id}>{i.name} · stock {i.current_stock} {i.unit}</option>)}</select><div className="barready-actions"><button type="button" disabled={working||!selectedInventory} onClick={()=>quickPresentation('Unidad',1,'UND')}>Unidad ×1</button><button type="button" disabled={working||!selectedInventory} onClick={()=>quickPresentation('Six Pack',6,'PACK6')}>Six Pack ×6</button><button type="button" disabled={working||!selectedInventory} onClick={()=>quickPresentation('Caja 24',24,'CAJA24')}>Caja ×24</button></div>{presentations.filter(p=>!selectedInventory||p.inventory_item_id===selectedInventory).slice(0,30).map(p=><article key={p.id}><div><b>{p.name}</b><small>{inventory.find(i=>i.id===p.inventory_item_id)?.name||'Insumo'} · {p.units_per_presentation} unidades</small></div></article>)}<p className="barready-note">Baldes/Hielerazos continúan siendo productos/recetas de venta, no una ubicación de inventario. Se crean desde Administración para consumir las unidades correctas.</p></Panel><Panel title="Reposición y mínimos">{stockAlerts.length?stockAlerts.slice(0,40).map(a=><article key={a.inventory_item_id}><div><b>{a.item_name||a.name||inventory.find(i=>i.id===a.inventory_item_id)?.name||'Insumo'}</b><small>Disponible {a.available_stock??a.current_stock??0} · sugerido {a.suggested_quantity??a.suggested_qty??0}</small></div><button type="button" disabled={working} onClick={()=>prepareRestock(a.inventory_item_id)}>Preparar compra</button></article>):<div className="barready-empty">No hay alertas de reposición.</div>}</Panel></div>}

  {tab==='Cierre diario'&&<div className="barready-grid two"><Panel title="Resumen del día"><label className="barready-date">Fecha<input type="date" value={closeDate} onChange={e=>setCloseDate(e.target.value)}/><button type="button" disabled={working} onClick={loadClose}>Actualizar cierre</button></label>{closeReport?.dashboard?<><div className="barready-kpis"><Kpi label="Ventas" value={money.format(Number(closeReport.dashboard.revenue||0))}/><Kpi label="Utilidad bruta" value={money.format(Number(closeReport.dashboard.gross_profit||0))}/><Kpi label="Margen" value={`${Number(closeReport.dashboard.gross_margin_percent||0).toFixed(1)}%`}/><Kpi label="Propinas" value={money.format(Number(closeReport.dashboard.tips||0))}/><Kpi label="Descuentos" value={money.format(Number(closeReport.dashboard.manual_discounts||0))}/><Kpi label="Mermas" value={money.format(Number(closeReport.dashboard.waste_cost||0))}/></div><div className="barready-methods"><span>Efectivo <b>{money.format(Number(closeReport.dashboard.cash||0))}</b></span><span>Tarjeta <b>{money.format(Number(closeReport.dashboard.card||0))}</b></span><span>Transferencia <b>{money.format(Number(closeReport.dashboard.transfer||0))}</b></span><span>Cortesías <b>{money.format(Number(closeReport.dashboard.courtesy_cost||0))}</b></span><span>Anulados <b>{closeReport.dashboard.voided_items||0}</b></span><span>Pedidos cancelados <b>{closeReport.dashboard.cancelled_orders||0}</b></span></div><div className={`barready-close-state ${closeReport.close_ready?'ok':'pending'}`}>{closeReport.close_ready?'✓ Día listo para cierre administrativo':`Pendientes: ${closeReport.blocking?.open_cash_sessions||0} caja(s), ${closeReport.blocking?.open_tables||0} mesa(s), ${closeReport.blocking?.pending_cash_postings||0} cobro(s) sin contabilizar`}</div></>:<div className="barready-empty">Selecciona la fecha y actualiza.</div>}</Panel><Panel title="Sesiones de Caja">{(closeReport?.cash_sessions||[]).length?closeReport.cash_sessions.map(s=><article key={s.id}><div><b>{s.status} · {fmt(s.opened_at)}</b><small>Inicial {money.format(Number(s.opening_balance||0))}{s.status==='CLOSED'?` · esperado ${money.format(Number(s.closing_expected||0))} · contado ${money.format(Number(s.closing_counted||0))} · diferencia ${money.format(Number(s.difference||0))}`:''}</small></div>{String(s.status).toUpperCase()==='OPEN'&&<div className="barready-close-input"><input type="number" min="0" step="0.01" placeholder="Efectivo contado" value={counted[s.id]||''} onChange={e=>setCounted(v=>({...v,[s.id]:e.target.value}))}/><button type="button" className="danger" disabled={working} onClick={()=>closeCash(s)}>Cerrar Caja</button></div>}</article>):<div className="barready-empty">No hay sesiones de caja para esa fecha.</div>}</Panel></div>}

  {tab==='Auditoría'&&<div className="barready-grid two"><Panel title="Seguridad operativa"><div className="barready-kpis"><Kpi label="Matriz de roles" value={audit.permission_matrix_ok?'OK':'REVISAR'}/><Kpi label="Guardas servidor" value={`${audit.enforcement_triggers_found||0}/${audit.enforcement_triggers_expected||11}`}/><Kpi label="Runtime" value={audit.runtime_ready?'OK':'REVISAR'}/></div><div className="barready-role-list">{Object.entries(audit.active_role_counts||{}).map(([role,n])=><span key={role}>{roleName[role]||role}<b>{n}</b></span>)}</div><p className="barready-note">Las restricciones se validan en Supabase; no dependen únicamente de ocultar botones.</p></Panel><Panel title="Pendientes operativos">{Object.entries(audit.pending||{}).map(([k,v])=><article key={k}><div><b>{k.replaceAll('_',' ')}</b></div><strong>{v}</strong></article>)}<button type="button" disabled={working||!isAdmin} onClick={load}>Repetir auditoría</button></Panel></div>}
 </section>
}

function Panel({title,children}){return <section className="barready-panel"><h3>{title}</h3>{children}</section>}
function Kpi({label,value}){return <div className="barready-kpi"><span>{label}</span><b>{value}</b></div>}
