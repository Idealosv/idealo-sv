import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-money-control.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const fmt=value=>value?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):''
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date())
const DENOMS=[100,50,20,10,5,2,1,.5,.25,.1,.05,.01]

export default function IdealoBarMoneyControl({company,supabase,access}){
 const companyId=company?.id
 const permissions=access?.permissions||[]
 const can=p=>permissions.includes('*')||permissions.includes(p)
 const isAdmin=can('admin.view')||can('admin.manage')
 const [screen,setScreen]=useState('refunds')
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [orders,setOrders]=useState([]),[items,setItems]=useState([]),[refunds,setRefunds]=useState([]),[refundItems,setRefundItems]=useState([])
 const [tipSummary,setTipSummary]=useState({pending_total:0,paid_out_total:0,people:[]}),[payouts,setPayouts]=useState([])
 const [accounts,setAccounts]=useState([]),[sessions,setSessions]=useState([]),[daySnapshot,setDaySnapshot]=useState(null),[integrity,setIntegrity]=useState(null)
 const [refundForm,setRefundForm]=useState({orderId:'',method:'cash',reason:'',tip:'0',restock:false,accountId:''}),[refundQty,setRefundQty]=useState({})
 const [tipForm,setTipForm]=useState({userId:'',method:'cash',accountId:'',note:''})
 const [closeSessionId,setCloseSessionId]=useState(''),[closePreview,setClosePreview]=useState(null),[counts,setCounts]=useState({}),[closeNotes,setCloseNotes]=useState(''),[dayNotes,setDayNotes]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  setLoading(true);setError('')
  const adminDay=isAdmin?supabase.rpc('bar_day_close_snapshot',{p_company_id:companyId,p_business_date:today()}):Promise.resolve({data:null,error:null})
  const adminIntegrity=isAdmin?supabase.rpc('bar_money_integrity',{p_company_id:companyId}):Promise.resolve({data:null,error:null})
  const calls=[
   supabase.from('bar_orders').select('*').eq('company_id',companyId).eq('status','paid').order('closed_at',{ascending:false}).limit(300),
   supabase.from('bar_order_items').select('id,order_id,item_name,quantity,line_total,status').eq('company_id',companyId).order('created_at',{ascending:false}).limit(2000),
   supabase.from('bar_refunds').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(300),
   supabase.from('bar_refund_items').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1500),
   supabase.rpc('bar_tip_payout_summary',{p_company_id:companyId}),
   supabase.from('bar_tip_payouts').select('*').eq('company_id',companyId).order('paid_at',{ascending:false}).limit(300),
   supabase.from('cash_accounts').select('id,name,account_type,active').eq('company_id',companyId).eq('active',true).order('name'),
   supabase.from('cash_register_sessions').select('*').eq('company_id',companyId).order('opened_at',{ascending:false}).limit(100),
   adminDay,adminIntegrity,
  ]
  const r=await Promise.all(calls);const failed=r.find(x=>x?.error)?.error
  if(failed)setError(failed.message||String(failed))
  else{
   setOrders(r[0].data||[]);setItems(r[1].data||[]);setRefunds(r[2].data||[]);setRefundItems(r[3].data||[]);setTipSummary(r[4].data||{pending_total:0,paid_out_total:0,people:[]});setPayouts(r[5].data||[]);setAccounts(r[6].data||[]);setSessions(r[7].data||[]);setDaySnapshot(r[8].data||null);setIntegrity(r[9].data||null)
  }
  setLoading(false)
 },[companyId,supabase,isAdmin])
 useEffect(()=>{load()},[load])

 const run=async(fn,msg)=>{setWorking(true);setError('');setNotice('');try{const result=await fn();setNotice(typeof msg==='function'?msg(result):msg);await load();return result}catch(e){setError(e.message||String(e));return null}finally{setWorking(false)}}
 const refundById=useMemo(()=>new Map(refunds.map(r=>[r.id,r])),[refunds])
 const selectedOrder=orders.find(o=>o.id===refundForm.orderId)||null
 const selectedItems=items.filter(i=>i.order_id===refundForm.orderId&&i.status!=='cancelled')
 const refundableQty=item=>Math.max(0,Number(item.quantity||0)-refundItems.filter(ri=>ri.order_item_id===item.id&&refundById.get(ri.refund_id)?.status==='COMPLETED').reduce((a,b)=>a+Number(b.quantity||0),0))
 const orderRefunded=selectedOrder?refunds.filter(r=>r.order_id===selectedOrder.id&&r.status==='COMPLETED').reduce((a,b)=>a+Number(b.amount||0),0):0
 const orderRemaining=selectedOrder?Math.max(0,Number(selectedOrder.total||0)-orderRefunded):0
 const cashAccounts=accounts.filter(a=>String(a.account_type).toUpperCase()!=='BANK')
 const bankAccounts=accounts.filter(a=>String(a.account_type).toUpperCase()==='BANK')
 const accountChoices=refundForm.method==='cash'?cashAccounts:refundForm.method==='card'||refundForm.method==='transfer'?bankAccounts:accounts
 const tipAccountChoices=tipForm.method==='cash'?cashAccounts:bankAccounts
 const openSessions=sessions.filter(s=>String(s.status).toUpperCase()==='OPEN')
 const counted=DENOMS.reduce((sum,d)=>sum+d*Number(counts[d]||0),0)
 const expected=Number(closePreview?.expected||0),diff=Number((counted-expected).toFixed(2))

 useEffect(()=>{
  if(!closeSessionId){setClosePreview(null);return}
  let alive=true
  supabase.rpc('bar_cash_close_preview',{p_session:closeSessionId}).then(({data,error:e})=>{if(!alive)return;if(e)setError(e.message);else setClosePreview(data||null)})
  return()=>{alive=false}
 },[closeSessionId,supabase])

 const submitRefund=()=>run(async()=>{
  if(!can('admin.manage'))throw new Error('Solo Gerente o Propietario puede autorizar devoluciones.')
  if(!refundForm.orderId)throw new Error('Seleccioná una venta pagada.')
  if(refundForm.reason.trim().length<4)throw new Error('Escribí el motivo de la devolución.')
  const allocations=selectedItems.map(i=>({order_item_id:i.id,quantity:Number(refundQty[i.id]||0),restock:refundForm.restock})).filter(x=>x.quantity>0)
  if(!allocations.length&&Number(refundForm.tip||0)<=0)throw new Error('Seleccioná productos o una propina para devolver.')
  const {data,error:e}=await supabase.rpc('bar_refund_order',{p_order_id:refundForm.orderId,p_method:refundForm.method,p_reason:refundForm.reason.trim(),p_items:allocations,p_tip_refund:Number(refundForm.tip||0),p_cash_account_id:refundForm.accountId||null,p_restock:refundForm.restock})
  if(e)throw e
  setRefundQty({});setRefundForm(v=>({...v,reason:'',tip:'0',restock:false}))
  return data
 },result=>`Devolución registrada por ${money.format(Number(result?.amount||0))}.${result?.fiscal_status==='ACTION_REQUIRED'?' El DTE procesado requiere acción fiscal.':''}`)

 const payoutTips=()=>run(async()=>{
  if(!tipForm.userId)throw new Error('Seleccioná al colaborador.')
  const {data,error:e}=await supabase.rpc('bar_pay_tip_balance',{p_company_id:companyId,p_recipient_user_id:tipForm.userId,p_method:tipForm.method,p_cash_account_id:tipForm.accountId||null,p_note:tipForm.note||null})
  if(e)throw e
  setTipForm(v=>({...v,note:''}));return data
 },result=>`Propinas liquidadas: ${money.format(Number(result?.amount||0))}.`)

 const closeCash=()=>run(async()=>{
  if(!closeSessionId)throw new Error('Seleccioná el turno de caja.')
  const payload=DENOMS.map(denomination=>({denomination,quantity:Number(counts[denomination]||0)}))
  const {data,error:e}=await supabase.rpc('bar_close_cash_with_count',{p_session:closeSessionId,p_counts:payload,p_notes:closeNotes||null})
  if(e)throw e
  setCounts({});setCloseNotes('');setCloseSessionId('');setClosePreview(null);return data
 },result=>`Caja cerrada. Contado ${money.format(Number(result?.counted||0))} · diferencia ${money.format(Number(result?.difference||0))}.`)

 const finalizeDay=()=>run(async()=>{
  const {data,error:e}=await supabase.rpc('bar_finalize_day_close',{p_company_id:companyId,p_business_date:today(),p_notes:dayNotes||null})
  if(e)throw e
  setDayNotes('');return data
 },'Cierre consolidado del día guardado.')

 if(loading)return <div className="barmoney-load">Preparando control de dinero…</div>
 const people=Array.isArray(tipSummary?.people)?tipSummary.people:[]
 return <section className="barmoney">
  <header className="barmoney-head"><div><small>CONTROL FINANCIERO OPERATIVO</small><h3>Dinero y cierre</h3><p>Devoluciones, propinas, arqueo y cierre diario sin alterar ventas históricas.</p></div><button type="button" onClick={load}>↻ Actualizar</button></header>
  {error&&<div className="barmoney-alert error"><b>!</b><span>{error}</span><button onClick={()=>setError('')}>×</button></div>}
  {notice&&<div className="barmoney-alert ok"><b>✓</b><span>{notice}</span><button onClick={()=>setNotice('')}>×</button></div>}
  <nav className="barmoney-tabs"><button className={screen==='refunds'?'active':''} onClick={()=>setScreen('refunds')}>↩ Devoluciones</button><button className={screen==='tips'?'active':''} onClick={()=>setScreen('tips')}>★ Propinas</button><button className={screen==='cash'?'active':''} onClick={()=>setScreen('cash')}>▣ Arqueo y cierre</button>{isAdmin&&<button className={screen==='day'?'active':''} onClick={()=>setScreen('day')}>✓ Cierre del día</button>}</nav>

  {screen==='refunds'&&<div className="barmoney-grid two">
   <Card title="Nueva devolución" subtitle="Solo Gerente o Propietario puede autorizarla.">
    <label>Venta pagada<select value={refundForm.orderId} onChange={e=>{setRefundForm(v=>({...v,orderId:e.target.value}));setRefundQty({})}}><option value="">Seleccionar…</option>{orders.map(o=><option key={o.id} value={o.id}>{o.order_code} · {money.format(Number(o.total||0))} · {fmt(o.closed_at)}</option>)}</select></label>
    {selectedOrder&&<><div className="barmoney-kpis"><Kpi label="Venta" value={money.format(Number(selectedOrder.total||0))}/><Kpi label="Ya devuelto" value={money.format(orderRefunded)}/><Kpi label="Disponible" value={money.format(orderRemaining)}/></div><div className="barmoney-lines">{selectedItems.map(i=>{const left=refundableQty(i);return <label key={i.id} className="barmoney-line"><span><b>{i.item_name}</b><small>Vendido {i.quantity} · disponible {left} · {money.format(Number(i.line_total||0))}</small></span><input type="number" min="0" max={left} step="1" value={refundQty[i.id]||''} onChange={e=>setRefundQty(v=>({...v,[i.id]:e.target.value}))} disabled={left<=0}/></label>})}</div></>}
    <div className="barmoney-form-row"><label>Método<select value={refundForm.method} onChange={e=>setRefundForm(v=>({...v,method:e.target.value,accountId:''}))}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></label><label>Cuenta<select value={refundForm.accountId} onChange={e=>setRefundForm(v=>({...v,accountId:e.target.value}))}><option value="">Automática si es única…</option>{accountChoices.map(a=><option key={a.id} value={a.id}>{a.name} · {a.account_type}</option>)}</select></label></div>
    <div className="barmoney-form-row"><label>Propina a devolver<input type="number" min="0" step="0.01" value={refundForm.tip} onChange={e=>setRefundForm(v=>({...v,tip:e.target.value}))}/></label><label className="barmoney-check"><input type="checkbox" checked={refundForm.restock} onChange={e=>setRefundForm(v=>({...v,restock:e.target.checked}))}/><span>Regresar físicamente los insumos al inventario</span></label></div>
    <label>Motivo<textarea rows="3" value={refundForm.reason} onChange={e=>setRefundForm(v=>({...v,reason:e.target.value}))} placeholder="Ej. producto devuelto sin consumir, cobro duplicado…"/></label>
    <p className="barmoney-note">Si la venta tiene un DTE ya procesado, IDEALO BAR registra la devolución pero la deja marcada para la acción fiscal correspondiente; no modifica automáticamente un DTE autorizado.</p>
    <button className="barmoney-primary" disabled={working||!can('admin.manage')} onClick={submitRefund}>Registrar devolución</button>
   </Card>
   <Card title="Historial de devoluciones" subtitle="Dinero, inventario y estado fiscal quedan enlazados.">{refunds.length?refunds.slice(0,60).map(r=><article key={r.id}><div><b>{orders.find(o=>o.id===r.order_id)?.order_code||r.refund_code}</b><small>{fmt(r.created_at)} · {r.method} · {r.reason}</small><em className={`barmoney-fiscal ${r.fiscal_status==='ACTION_REQUIRED'?'warn':''}`}>{r.fiscal_status==='ACTION_REQUIRED'?'Acción fiscal requerida':r.fiscal_status==='REVIEW_REQUIRED'?'Revisión fiscal':'Fiscal OK'}</em></div><strong>-{money.format(Number(r.amount||0))}</strong></article>):<Empty>Sin devoluciones registradas.</Empty>}</Card>
  </div>}

  {screen==='tips'&&<div className="barmoney-grid two">
   <Card title="Propinas pendientes" subtitle="Se liquidan por colaborador y dejan salida de caja/banco."><div className="barmoney-kpis"><Kpi label="Pendientes" value={money.format(Number(tipSummary?.pending_total||0))}/><Kpi label="Pagadas" value={money.format(Number(tipSummary?.paid_out_total||0))}/></div>{people.map(p=><button type="button" className={`barmoney-person ${tipForm.userId===p.user_id?'selected':''}`} key={p.user_id||'none'} disabled={!p.user_id||Number(p.pending)<=0} onClick={()=>setTipForm(v=>({...v,userId:p.user_id}))}><span><b>{p.name}</b><small>Ganadas {money.format(Number(p.earned||0))} · pagadas {money.format(Number(p.paid||0))}</small></span><strong>{money.format(Number(p.pending||0))}</strong></button>)}{!people.length&&<Empty>Aún no hay propinas acumuladas.</Empty>}</Card>
   <Card title="Liquidar saldo" subtitle="No borra propinas: cambia su estado a pagado y registra el egreso."><label>Colaborador<select value={tipForm.userId} onChange={e=>setTipForm(v=>({...v,userId:e.target.value}))}><option value="">Seleccionar…</option>{people.filter(p=>p.user_id&&Number(p.pending)>0).map(p=><option key={p.user_id} value={p.user_id}>{p.name} · {money.format(Number(p.pending||0))}</option>)}</select></label><div className="barmoney-form-row"><label>Método<select value={tipForm.method} onChange={e=>setTipForm(v=>({...v,method:e.target.value,accountId:''}))}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label><label>Cuenta<select value={tipForm.accountId} onChange={e=>setTipForm(v=>({...v,accountId:e.target.value}))}><option value="">Automática si es única…</option>{tipAccountChoices.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div><label>Nota<input value={tipForm.note} onChange={e=>setTipForm(v=>({...v,note:e.target.value}))} placeholder="Ej. liquidación fin de turno"/></label><button className="barmoney-primary" disabled={working||!tipForm.userId} onClick={payoutTips}>Liquidar todas las propinas pendientes</button><h4>Últimas liquidaciones</h4>{payouts.slice(0,20).map(p=><article key={p.id}><div><b>{people.find(x=>x.user_id===p.recipient_user_id)?.name||'Colaborador'}</b><small>{fmt(p.paid_at)} · {p.method} · {p.payout_code}</small></div><strong>-{money.format(Number(p.amount||0))}</strong></article>)}</Card>
  </div>}

  {screen==='cash'&&<div className="barmoney-grid two">
   <Card title="Turno a cerrar" subtitle="El conteo se guarda por denominación y la diferencia queda auditada."><label>Turno abierto<select value={closeSessionId} onChange={e=>{setCloseSessionId(e.target.value);setCounts({})}}><option value="">Seleccionar caja…</option>{openSessions.map(s=><option key={s.id} value={s.id}>{accounts.find(a=>a.id===s.cash_account_id)?.name||'Caja'} · abrió {fmt(s.opened_at)}</option>)}</select></label>{closePreview&&<><div className="barmoney-kpis"><Kpi label="Apertura" value={money.format(Number(closePreview.opening||0))}/><Kpi label="Ventas efectivo" value={money.format(Number(closePreview.cash_sales||0))}/><Kpi label="Devoluciones" value={money.format(Number(closePreview.cash_refunds||0))}/><Kpi label="Propinas pagadas" value={money.format(Number(closePreview.tip_payouts||0))}/><Kpi label="Esperado" value={money.format(expected)}/></div><div className="barmoney-warning-row"><span>Pedidos aún abiertos</span><b>{closePreview.open_orders||0}</b><span>Cobros sin contabilizar</span><b>{closePreview.pending_postings||0}</b></div></>}</Card>
   <Card title="Arqueo por denominación" subtitle="Contá billetes y monedas; el sistema calcula el efectivo real."><div className="barmoney-denoms">{DENOMS.map(d=><label key={d}><span>{money.format(d)}</span><input type="number" min="0" step="1" value={counts[d]||''} onChange={e=>setCounts(v=>({...v,[d]:e.target.value}))}/><b>{money.format(d*Number(counts[d]||0))}</b></label>)}</div><div className="barmoney-close-total"><span>Contado <b>{money.format(counted)}</b></span><span>Esperado <b>{money.format(expected)}</b></span><span className={Math.abs(diff)>=.01?'difference':''}>Diferencia <b>{money.format(diff)}</b></span></div><label>Observación de cierre<textarea rows="2" value={closeNotes} onChange={e=>setCloseNotes(e.target.value)} placeholder={Math.abs(diff)>=.01?'Obligatorio: explica la diferencia':'Opcional'}/></label><button className="barmoney-primary" disabled={working||!closeSessionId} onClick={closeCash}>Cerrar turno con arqueo</button></Card>
  </div>}

  {screen==='day'&&isAdmin&&<div className="barmoney-grid two">
   <Card title="Consolidado del día" subtitle="El cierre diario solo se habilita cuando pedidos, cajas y contabilización están limpios.">{daySnapshot?<><div className="barmoney-kpis"><Kpi label="Venta bruta" value={money.format(Number(daySnapshot.gross_sales||0))}/><Kpi label="Devoluciones" value={money.format(Number(daySnapshot.refunds||0))}/><Kpi label="Venta neta" value={money.format(Number(daySnapshot.net_sales||0))}/><Kpi label="Propinas" value={money.format(Number(daySnapshot.tips_earned||0))}/><Kpi label="Propinas pagadas" value={money.format(Number(daySnapshot.tip_payouts||0))}/></div><div className={`barmoney-ready ${daySnapshot.ready?'ok':'pending'}`}><b>{daySnapshot.ready?'LISTO PARA CERRAR':'PENDIENTE'}</b><span>Pedidos abiertos: {daySnapshot.open_orders||0} · cajas abiertas: {daySnapshot.open_sessions||0} · cobros pendientes: {daySnapshot.pending_postings||0}</span></div><label>Nota del cierre diario<textarea rows="3" value={dayNotes} onChange={e=>setDayNotes(e.target.value)} placeholder="Observaciones del propietario o gerente"/></label><button className="barmoney-primary" disabled={working||!daySnapshot.ready||!can('admin.manage')} onClick={finalizeDay}>Guardar cierre consolidado del día</button></>:<Empty>No hay información de cierre.</Empty>}</Card>
   <Card title="Integridad del dinero" subtitle="Debe permanecer en cero antes de entregar el sistema.">{integrity?<div className="barmoney-integrity">{Object.entries(integrity).map(([key,value])=><div key={key} className={Number(value)>0?'bad':'good'}><span>{key.replaceAll('_',' ')}</span><b>{value}</b></div>)}</div>:<Empty>Auditoría disponible para Gerencia.</Empty>}<h4>Sesiones del día</h4>{(daySnapshot?.sessions||[]).map(s=><article key={s.id}><div><b>{accounts.find(a=>a.id===s.account_id)?.name||'Caja'}</b><small>{s.status} · {fmt(s.opened_at)}{s.closed_at?` → ${fmt(s.closed_at)}`:''}</small></div><strong>{s.status==='CLOSED'?`Dif. ${money.format(Number(s.difference||0))}`:'ABIERTA'}</strong></article>)}</Card>
  </div>}
 </section>
}

function Card({title,subtitle,children}){return <div className="barmoney-card"><header><h4>{title}</h4>{subtitle&&<p>{subtitle}</p>}</header>{children}</div>}
function Kpi({label,value}){return <div className="barmoney-kpi"><span>{label}</span><b>{value}</b></div>}
function Empty({children}){return <div className="barmoney-empty">{children}</div>}
