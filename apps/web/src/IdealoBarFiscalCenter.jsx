import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-fiscal-center.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const fmt=value=>value?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):''
const statusLabel={DRAFT:'Borrador',SIGNING:'Firmando',SIGNED:'Firmado',TRANSMITTING:'Transmitiendo',PROCESSED:'Procesado MH',REJECTED:'Rechazado',CONTINGENCY:'Contingencia',INVALIDATED:'Invalidado MH'}
const actionLabel={
 NO_FISCAL_IMPACT:'Sin impacto fiscal',SALE_DTE_WILL_BE_NET:'DTE saldrá neto',SALE_DTE_ADJUSTED:'Borrador ajustado',
 CREDIT_NOTE_05:'Nota de Crédito 05',INVALIDATE_INVOICE_01:'Invalidar Factura 01',REPLACEMENT_THEN_INVALIDATE:'Reemplazo + invalidación',
 WAIT_DTE_FINAL_STATUS:'Esperar resultado MH',REGENERATE_SALE_DTE:'Regenerar DTE',REVIEW_REQUIRED:'Revisión fiscal',PREPARATION_ERROR:'Error al preparar acción fiscal'
}
const actionStatusLabel={RESOLVED:'Resuelto',DRAFT_READY:'Borrador listo',READY_FOR_INVALIDATION:'Listo para invalidación',REPLACEMENT_PROCESSED:'Reemplazo procesado',PENDING:'Pendiente',ADJUSTMENT_REJECTED:'Ajuste rechazado'}

export default function IdealoBarFiscalCenter({company,supabase,access}){
 const companyId=company?.id
 const permissions=Array.isArray(access?.permissions)?access.permissions:[]
 const can=p=>permissions.includes('*')||permissions.includes(p)
 const canManage=can('admin.manage')||can('payment.take')
 const [tab,setTab]=useState('sales')
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [orders,setOrders]=useState([]),[dtes,setDtes]=useState([]),[clients,setClients]=useState([]),[refunds,setRefunds]=useState([]),[actions,setActions]=useState([]),[readiness,setReadiness]=useState(null),[integrity,setIntegrity]=useState(null)
 const [form,setForm]=useState({orderId:'',type:'01',clientId:'',environment:'test'})

 const load=useCallback(async()=>{
  if(!companyId)return
  setLoading(true);setError('')
  const calls=[
   supabase.from('bar_orders').select('id,order_code,status,total,subtotal,discount_total,tip_total,closed_at,customer_name').eq('company_id',companyId).eq('status','paid').order('closed_at',{ascending:false}).limit(400),
   supabase.from('dte_documents').select('id,bar_order_id,client_id,dte_type,environment,status,control_number,generation_code,mh_receipt_seal,mh_message,mh_response,dte_payload,reissued_from_id,created_at,updated_at').eq('company_id',companyId).not('bar_order_id','is',null).order('created_at',{ascending:false}).limit(500),
   supabase.from('clients').select('id,name,nit,tax_id,nrc,activity_code,business_activity,department_code,municipality_code,address,email,phone,preferred_dte_type,status').eq('company_id',companyId).eq('status','active').order('name').limit(500),
   supabase.from('bar_refunds').select('id,order_id,refund_code,amount,merchandise_refund,tip_refund,reason,fiscal_status,dte_document_id,created_at').eq('company_id',companyId).eq('status','COMPLETED').order('created_at',{ascending:false}).limit(400),
   supabase.from('bar_refund_fiscal_actions').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(400),
   supabase.rpc('bar_commercial_readiness',{p_company_id:companyId}),
   can('admin.view')||can('admin.manage')?supabase.rpc('bar_refund_fiscal_integrity',{p_company_id:companyId}):Promise.resolve({data:null,error:null}),
  ]
  const r=await Promise.all(calls);const failed=r.find(x=>x?.error)?.error
  if(failed)setError(failed.message||String(failed))
  else{setOrders(r[0].data||[]);setDtes(r[1].data||[]);setClients(r[2].data||[]);setRefunds(r[3].data||[]);setActions(r[4].data||[]);setReadiness(r[5].data||null);setIntegrity(r[6].data||null)}
  setLoading(false)
 },[companyId,supabase,permissions.join('|')])
 useEffect(()=>{load()},[load])

 const run=async(task,success)=>{setWorking(true);setError('');setNotice('');try{const result=await task();setNotice(typeof success==='function'?success(result):success);await load();return result}catch(e){setError(e.message||String(e));return null}finally{setWorking(false)}}
 const dteById=useMemo(()=>new Map(dtes.map(d=>[d.id,d])),[dtes])
 const actionByRefund=useMemo(()=>new Map(actions.map(a=>[a.refund_id,a])),[actions])
 const orderById=useMemo(()=>new Map(orders.map(o=>[o.id,o])),[orders])
 const productionReady=Boolean(readiness?.ready_for_fiscal_production)
 const fiscalClients=clients.map(c=>({...c,fiscalComplete:Boolean((c.nit||c.tax_id)&&c.nrc&&c.activity_code&&c.department_code&&c.municipality_code&&c.address)}))
 const selectedClient=fiscalClients.find(c=>c.id===form.clientId)
 const originalSaleDte=orderId=>dtes.find(d=>d.bar_order_id===orderId&&['01','03'].includes(d.dte_type)&&!d.reissued_from_id)
 const fiscalAmount=d=>Number(d?.dte_payload?.resumen?.totalPagar??d?.dte_payload?.resumen?.montoTotalOperacion??0)
 const pendingActions=actions.filter(a=>a.status!=='RESOLVED')

 const generate=()=>run(async()=>{
  if(!canManage)throw new Error('Tu rol no puede preparar DTE de ventas.')
  if(!form.orderId)throw new Error('Seleccioná una venta pagada.')
  if(form.type==='03'){
   if(!form.clientId)throw new Error('El CCF requiere seleccionar un receptor fiscal.')
   if(!selectedClient?.fiscalComplete)throw new Error('El receptor del CCF está incompleto: revisá NIT, NRC, actividad y dirección.')
  }
  if(form.environment==='production'&&!productionReady)throw new Error('PRODUCCIÓN está bloqueada hasta completar el preflight fiscal del negocio.')
  const {data,error:e}=await supabase.rpc('bar_generate_dte_draft',{p_order_id:form.orderId,p_client_id:form.type==='03'?form.clientId:null,p_dte_type:form.type,p_environment:form.environment})
  if(e)throw e
  return data
 },id=>`DTE preparado/enlazado: ${id}.`)

 const prepareRefund=refund=>run(async()=>{
  if(!can('admin.manage'))throw new Error('Solo Gerente o Propietario puede preparar ajustes fiscales de devoluciones.')
  const {data,error:e}=await supabase.rpc('bar_prepare_refund_fiscal_action',{p_refund_id:refund.id})
  if(e)throw e
  return data
 },data=>`${actionLabel[data?.action_type]||data?.action_type||'Acción fiscal'} preparada.`)

 if(loading)return <div className="barfiscal-load">Auditando DTE y devoluciones…</div>
 return <section className="barfiscal">
  <header className="barfiscal-head"><div><small>IDEALO BAR · CONTROL FISCAL</small><h2>DTE y ajustes fiscales</h2><p>Factura 01, CCF 03, Nota de Crédito 05 y seguimiento de invalidaciones sin alterar documentos aceptados por Hacienda.</p></div><button onClick={load} disabled={working}>↻ Actualizar</button></header>
  {error&&<div className="barfiscal-alert error"><b>!</b><span>{error}</span><button onClick={()=>setError('')}>×</button></div>}
  {notice&&<div className="barfiscal-alert ok"><b>✓</b><span>{notice}</span><button onClick={()=>setNotice('')}>×</button></div>}
  <div className="barfiscal-kpis"><Kpi label="DTE del bar" value={dtes.length}/><Kpi label="Procesados MH" value={dtes.filter(d=>d.status==='PROCESSED').length}/><Kpi label="Ajustes pendientes" value={pendingActions.length}/><Kpi label="Producción fiscal" value={productionReady?'HABILITADA':'BLOQUEADA'} tone={productionReady?'ok':'warn'}/></div>
  <nav className="barfiscal-tabs"><button className={tab==='sales'?'active':''} onClick={()=>setTab('sales')}>DTE de ventas</button><button className={tab==='refunds'?'active':''} onClick={()=>setTab('refunds')}>Devoluciones fiscales {pendingActions.length?`(${pendingActions.length})`:''}</button><button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}>Auditoría fiscal</button></nav>

  {tab==='sales'&&<div className="barfiscal-grid two">
   <Card title="Preparar DTE de venta" subtitle="El monto fiscal excluye propinas y descuenta devoluciones registradas antes del DTE.">
    <label>Venta pagada<select value={form.orderId} onChange={e=>setForm(v=>({...v,orderId:e.target.value}))}><option value="">Seleccionar…</option>{orders.map(o=>{const d=originalSaleDte(o.id);return <option key={o.id} value={o.id}>{o.order_code} · {money.format(Number(o.total||0))}{d?` · ${statusLabel[d.status]||d.status}`:''}</option>})}</select></label>
    <div className="barfiscal-row"><label>Documento<select value={form.type} onChange={e=>setForm(v=>({...v,type:e.target.value,clientId:e.target.value==='01'?'':v.clientId}))}><option value="01">Factura electrónica 01</option><option value="03">CCF electrónico 03</option></select></label><label>Ambiente<select value={form.environment} onChange={e=>setForm(v=>({...v,environment:e.target.value}))}><option value="test">Pruebas MH</option><option value="production" disabled={!productionReady}>Producción {!productionReady?'(bloqueada)':''}</option></select></label></div>
    {form.type==='03'&&<label>Receptor fiscal<select value={form.clientId} onChange={e=>setForm(v=>({...v,clientId:e.target.value}))}><option value="">Seleccionar cliente…</option>{fiscalClients.map(c=><option key={c.id} value={c.id}>{c.fiscalComplete?'✓':'⚠'} {c.name} · {c.nit||c.tax_id||c.nrc||'sin NIT'}</option>)}</select>{selectedClient&&!selectedClient.fiscalComplete&&<small className="barfiscal-badtext">Faltan datos fiscales obligatorios del receptor.</small>}</label>}
    <button className="barfiscal-primary" onClick={generate} disabled={working||!canManage}>Generar / recuperar borrador DTE</button>
    <p className="barfiscal-note">Un DTE aceptado por Hacienda no se edita. Si una devolución ocurre después, IDEALO BAR abre el flujo de Nota de Crédito o invalidación/reemplazo según el documento original.</p>
   </Card>
   <Card title="Documentos del bar" subtitle="Estado real guardado por el motor DTE.">{dtes.length?dtes.slice(0,100).map(d=><article key={d.id} className="barfiscal-doc"><div><b>{d.dte_type==='01'?'Factura 01':d.dte_type==='03'?'CCF 03':d.dte_type==='05'?'Nota de Crédito 05':`DTE ${d.dte_type}`} · {d.control_number}</b><small>{orderById.get(d.bar_order_id)?.order_code||'Venta'} · {d.environment.toUpperCase()} · {fmt(d.created_at)}</small><div className="barfiscal-docmeta"><span className={`pill ${String(d.status).toLowerCase()}`}>{statusLabel[d.status]||d.status}</span><span>{money.format(fiscalAmount(d))}</span>{d.mh_receipt_seal&&<span className="pill ok">Sello MH</span>}</div>{d.mh_message&&<em>{d.mh_message}</em>}</div></article>):<Empty>Las ventas todavía no tienen DTE del bar.</Empty>}</Card>
  </div>}

  {tab==='refunds'&&<div className="barfiscal-grid">
   <Card title="Devoluciones y su documento fiscal" subtitle="Cada reembolso conserva la venta original, el movimiento de caja y su acción DTE por separado.">
    {refunds.length?refunds.map(r=>{const a=actionByRefund.get(r.id);const original=dteById.get(a?.original_dte_id||r.dte_document_id);const adjustment=dteById.get(a?.adjustment_dte_id);return <article key={r.id} className="barfiscal-refund"><div className="barfiscal-refund-main"><div><b>{r.refund_code} · {orderById.get(r.order_id)?.order_code||'Venta'}</b><small>{fmt(r.created_at)} · {r.reason}</small></div><strong>-{money.format(Number(r.amount||0))}</strong></div><div className="barfiscal-refund-flow"><Step title="DTE original" value={original?`${original.dte_type} · ${statusLabel[original.status]||original.status}`:'Sin DTE'} ok={!original||original.status==='PROCESSED'||original.status==='INVALIDATED'}/><Step title="Acción" value={a?`${actionLabel[a.action_type]||a.action_type} · ${actionStatusLabel[a.status]||a.status}`:r.fiscal_status} ok={a?.status==='RESOLVED'}/><Step title="Ajuste" value={adjustment?`${adjustment.dte_type} · ${statusLabel[adjustment.status]||adjustment.status}`:'—'} ok={adjustment?.status==='PROCESSED'}/></div>{a?.details?.message&&<p>{a.details.message}</p>}{a?.details?.confirmation&&<code>{a.details.confirmation}</code>}{(!a||['PENDING','ADJUSTMENT_REJECTED'].includes(a.status))&&can('admin.manage')&&<button onClick={()=>prepareRefund(r)} disabled={working}>Preparar / reintentar acción fiscal</button>}</article>}):<Empty>No hay devoluciones registradas.</Empty>}
   </Card>
  </div>}

  {tab==='audit'&&<div className="barfiscal-grid two">
   <Card title="Integridad fiscal de devoluciones" subtitle="Los valores deben permanecer en cero.">{integrity?<div className="barfiscal-integrity">{Object.entries(integrity).map(([key,value])=><div key={key} className={Number(value)>0?'bad':'good'}><span>{human(key)}</span><b>{value}</b></div>)}</div>:<Empty>Disponible para Gerencia.</Empty>}</Card>
   <Card title="Preflight de producción" subtitle="IDEALO BAR no habilita PRODUCCIÓN fingiendo datos fiscales."><div className={`barfiscal-ready ${productionReady?'ok':'pending'}`}><b>{productionReady?'PRODUCCIÓN FISCAL HABILITADA':'PRODUCCIÓN FISCAL BLOQUEADA'}</b><span>{productionReady?'El preflight fiscal reporta condiciones completas.':'Completa los requisitos reales indicados en Puesta en marcha antes de emitir a producción.'}</span></div><div className="barfiscal-checks">{(readiness?.checks||[]).filter(x=>['fiscal','fiscal_activity','establishment','dte_production'].includes(x.id)).map(row=><div key={row.id}><span>{row.label}<small>{row.detail}</small></span><b className={row.ok?'good':'bad'}>{row.ok?'OK':'PENDIENTE'}</b></div>)}</div><p className="barfiscal-note">Firmar, transmitir e invalidar frente a MH sigue usando el motor DTE central y su respuesta real. Esta pantalla nunca cambia un documento a PROCESSED o INVALIDATED por simulación.</p></Card>
  </div>}
 </section>
}

function Card({title,subtitle,children}){return <div className="barfiscal-card"><header><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</header>{children}</div>}
function Kpi({label,value,tone=''}){return <div className={`barfiscal-kpi ${tone}`}><span>{label}</span><b>{value}</b></div>}
function Step({title,value,ok}){return <div className={ok?'ok':''}><small>{title}</small><b>{value}</b></div>}
function Empty({children}){return <div className="barfiscal-empty">{children}</div>}
function human(key){return ({refunds_action_required_without_action:'Devoluciones sin acción fiscal',credit_notes_pending:'Notas de Crédito pendientes',invoice_invalidations_pending:'Invalidaciones de Factura pendientes',rejected_adjustments:'Ajustes fiscales rechazados',processed_credit_note_unresolved:'Notas de Crédito procesadas sin cerrar flujo'})[key]||key.replaceAll('_',' ')}
