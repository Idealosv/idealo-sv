import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { Logo } from './PrestaditosPortal.jsx'

const usd = n => new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(n)||0)
const labels={pending:'Pendiente',review:'En revisión',approved:'Aprobada',rejected:'Rechazada',processed:'Procesada'}
const requestName = r => r.request_type==='contribution'?'Inversión':'Retiro'

export default function PrestaditosAdmin({session}) {
  const [staff,setStaff]=useState(null)
  const [ready,setReady]=useState(false)
  const [investors,setInvestors]=useState([])
  const [requests,setRequests]=useState([])
  const [ledger,setLedger]=useState([])
  const [tab,setTab]=useState('solicitudes')
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState(null)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [working,setWorking]=useState(false)
  const [yieldForm,setYieldForm]=useState({investor_id:'',amount:'',notes:''})
  useEffect(()=>{
    let alive=true
    supabase.from('prestaditos_staff').select('role').eq('user_id',session.user.id).maybeSingle()
      .then(({data,error})=>{if(alive){setStaff(error?null:data);setReady(true);if(error)setError(error.message)}})
    return ()=>{alive=false}
  },[session.user.id])
  const reload=useCallback(async()=>{
    setError('')
    const [i,r,l]=await Promise.all([
      supabase.from('prestaditos_investors').select('*').order('created_at',{ascending:false}),
      supabase.from('prestaditos_requests').select('*').order('created_at',{ascending:false}),
      supabase.from('prestaditos_ledger').select('*').order('created_at',{ascending:false})
    ])
    if(i.error||r.error||l.error){setError((i.error||r.error||l.error).message);return}
    setInvestors(i.data||[]);setRequests(r.data||[]);setLedger(l.data||[])
  },[])
  useEffect(()=>{if(staff)void reload()},[staff,reload])
  const byId=useMemo(()=>Object.fromEntries(investors.map(i=>[i.id,i])),[investors])
  const displayed=useMemo(()=>requests.filter(r=>(filter==='all'||r.status===filter)
     && ((byId[r.investor_id]?.full_name||'').toLowerCase().includes(search.toLowerCase())
      || r.id.toLowerCase().includes(search.toLowerCase()))),[requests,filter,search,byId])
  const summary=useMemo(()=>ledger.reduce((s,row)=>{
    const amt=Number(row.amount)||0
    if(row.movement_type==='capital_in')s.capital+=amt
    if(row.movement_type==='capital_out')s.capital-=amt
    if(row.movement_type==='yield')s.yield+=amt
    if(row.movement_type==='yield_paid'){s.yield-=amt;s.paid+=amt}
    return s
  },{capital:0,yield:0,paid:0}),[ledger])
  const action=async(fn)=>{
    if(working)return
    setWorking(true);setError('');setMessage('')
    try{await fn();setSelected(null);setMessage('Operación registrada correctamente.');await reload()}
    catch(e){setError(e.message)}
    finally{setWorking(false)}
  }
  const rpc=(name,args)=>action(async()=>{
    const {error:e}=await supabase.rpc(name,args)
    if(e)throw e
  })
  const review=(id,status)=>rpc('prestaditos_review_request',{p_id:id,p_status:status,p_notes:status==='rejected'?(window.prompt('Motivo del rechazo:')||'Solicitud rechazada'):''})
  const process=(r)=>{
    if(!window.confirm('¿Confirmas que la operación bancaria ya fue verificada? Esto registrará un movimiento contable real en Prestaditos.'))return
    rpc('prestaditos_process_request',{p_id:r.id})
  }
  const openProof=async(path)=>{
    if(!path)return
    const win=window.open('','_blank')
    const {data,error:e}=await supabase.storage.from('prestaditos-receipts').createSignedUrl(path,60)
    if(e||!data?.signedUrl){win?.close();setError(e?.message||'No se pudo abrir el comprobante');return}
    if(win)win.location.href=data.signedUrl
    else setMessage('El navegador bloqueó la ventana emergente del comprobante.')
  }
  const recordYield=async(e)=>{
    e.preventDefault()
    const n=Number(yieldForm.amount)
    if(!Number.isFinite(n)||n<=0){setError('Monto inválido');return}
    await rpc('prestaditos_record_yield',{p_investor:yieldForm.investor_id,p_amount:n,p_notes:yieldForm.notes})
    setYieldForm({investor_id:'',amount:'',notes:''})
  }
  if(!ready)return <div className="pt-loading">Comprobando permisos de Prestaditos…</div>
  if(!staff)return <div className="pt-blocked"><Logo/><h2>Acceso restringido</h2><p>Tu cuenta no está designada como administradora de Prestaditos. Un responsable autorizado debe habilitarla; ser administrador de IDEALO SV no concede acceso financiero automáticamente.</p>{error&&<p className="pt-error">{error}</p>}<a href="/">Volver a IDEALO SV</a></div>
  const canEdit=staff.role==='admin'
  return <div className="pt-admin">
    <aside className="pt-sidebar">
      <Logo/><p className="pt-sidebar-title">GESTIÓN DE INVERSIONISTAS</p>
      {['solicitudes','inversionistas','rendimientos','reportes'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{{solicitudes:'☷',inversionistas:'♙',rendimientos:'↗',reportes:'▥'}[x]} <span>{x.charAt(0).toUpperCase()+x.slice(1)}</span></button>)}
      <a href="/">← Volver a IDEALO SV</a>
    </aside>
    <main className="pt-admin-main">
      <header className="pt-admin-head"><div><small>PRESTADITOS EL SALVADOR · IDEALO SV</small><h1>{tab==='solicitudes'?'Solicitudes de inversionistas':tab.charAt(0).toUpperCase()+tab.slice(1)}</h1><p>Administración segura de aportaciones, retiros y movimientos.</p></div><div className="pt-header-actions"><span>{session.user.email}</span><button onClick={()=>supabase.auth.signOut()}>Salir</button></div></header>
      {error&&<p role="alert" className="pt-error">{error}</p>}
      {message&&<p role="status" className="pt-notice">{message}</p>}
      <div className="pt-admin-stats">
        <div><small>Solicitudes pendientes</small><strong>{requests.filter(r=>r.status==='pending').length}</strong></div>
        <div><small>En revisión</small><strong>{requests.filter(r=>r.status==='review').length}</strong></div>
        <div><small>Inversionistas aprobados</small><strong>{investors.filter(i=>i.approval_status==='approved').length}</strong></div>
        <div><small>Capital registrado</small><strong>{usd(summary.capital)}</strong></div>
      </div>
      {tab==='solicitudes'&& <section className="pt-admin-card"><div className="pt-section-head"><h2>Solicitudes recibidas</h2><div><input placeholder="Buscar nombre o ID" value={search} onChange={e=>setSearch(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos los estados</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button onClick={reload}>Actualizar</button></div></div>
        <div className="pt-table-scroll"><table><thead><tr><th>Inversionista</th><th>Tipo</th><th>Monto</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{displayed.map(r=><tr key={r.id} className={selected?.id===r.id?'selected':''}><td><strong>{byId[r.investor_id]?.full_name||'—'}</strong><small>{r.id.slice(0,8)}</small></td><td>{requestName(r)}</td><td>{usd(r.amount)}</td><td>{new Date(r.created_at).toLocaleDateString('es-SV')}</td><td><span className={'pt-tag '+r.status}>{labels[r.status]}</span></td><td><button className="pt-table-button" onClick={()=>setSelected(r)}>Ver detalle</button></td></tr>)}</tbody></table></div>
        {!displayed.length&&<p>No hay solicitudes con esos filtros.</p>}
      </section>}
      {tab==='solicitudes'&&selected&&<section className="pt-admin-card pt-detail"><div className="pt-section-head"><h2>Detalle de solicitud</h2><button onClick={()=>setSelected(null)}>Cerrar</button></div><p><b>Inversionista:</b> {byId[selected.investor_id]?.full_name||'—'}</p><p><b>Correo:</b> {byId[selected.investor_id]?.email||'—'}</p><p><b>Teléfono:</b> {byId[selected.investor_id]?.phone||'—'}</p><p><b>DUI:</b> {byId[selected.investor_id]?.dui||'—'}</p><p><b>Tipo:</b> {requestName(selected)} {selected.withdrawal_source?('· '+(selected.withdrawal_source==='capital'?'Capital':'Rendimientos')):''}</p><p><b>Monto:</b> {usd(selected.amount)}</p><p><b>Método:</b> {selected.method}</p><p><b>Fecha solicitada:</b> {selected.requested_date||'—'}</p><p><b>Observaciones:</b> {selected.notes||'—'}</p>{selected.proof_path&&<button className="pt-secondary" onClick={()=>openProof(selected.proof_path)}>Abrir comprobante privado</button>}<p className="pt-footnote">Aprobar no registra dinero recibido; «Procesar» registra un movimiento luego de verificarlo externamente.</p>
        {canEdit&&<div className="pt-actions">{['pending','review'].includes(selected.status)&&<><button disabled={working} onClick={()=>review(selected.id,'review')}>En revisión</button><button disabled={working} onClick={()=>review(selected.id,'approved')}>Aprobar</button><button disabled={working} className="pt-danger" onClick={()=>review(selected.id,'rejected')}>Rechazar</button></>}{selected.status==='approved'&&<button disabled={working} className="pt-primary" onClick={()=>process(selected)}>Procesar operación verificada</button>}</div>}
      </section>}
      {tab==='inversionistas'&&<section className="pt-admin-card"><h2>Registro de inversionistas</h2><div className="pt-table-scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{investors.map(i=><tr key={i.id}><td>{i.full_name}</td><td>{i.email}</td><td>{i.phone}</td><td><span className={'pt-tag '+i.approval_status}>{labels[i.approval_status]||i.approval_status}</span></td><td>{i.approval_status==='pending'&&canEdit?<div className="pt-actions"><button disabled={working} onClick={()=>rpc('prestaditos_review_investor',{p_id:i.id,p_status:'approved'})}>Aprobar</button><button disabled={working} className="pt-danger" onClick={()=>rpc('prestaditos_review_investor',{p_id:i.id,p_status:'rejected'})}>Rechazar</button></div>:'—'}</td></tr>)}</tbody></table></div></section>}
      {tab==='rendimientos'&&<section className="pt-admin-card"><h2>Registrar rendimiento documentado</h2><p>Solo registra resultados sustentados por contratos y comprobantes. Esta acción genera un movimiento visible para el inversionista.</p>{canEdit&&<form className="pt-form pt-yield-form" onSubmit={recordYield}><label>Inversionista<select required value={yieldForm.investor_id} onChange={e=>setYieldForm({...yieldForm,investor_id:e.target.value})}><option value="">Seleccionar</option>{investors.filter(i=>i.approval_status==='approved').map(i=><option key={i.id} value={i.id}>{i.full_name}</option>)}</select></label><label>Rendimiento (USD)<input required type="number" min="0.01" step="0.01" value={yieldForm.amount} onChange={e=>setYieldForm({...yieldForm,amount:e.target.value})}/></label><label>Referencia del contrato o fundamento<input required minLength="5" maxLength="1000" value={yieldForm.notes} onChange={e=>setYieldForm({...yieldForm,notes:e.target.value})}/></label><button disabled={working} className="pt-primary">{working?'Guardando…':'Registrar rendimiento'}</button></form>}<h3>Movimientos recientes</h3><div className="pt-table-scroll"><table><thead><tr><th>Inversionista</th><th>Concepto</th><th>Monto</th><th>Fecha</th></tr></thead><tbody>{ledger.slice(0,60).map(m=><tr key={m.id}><td>{byId[m.investor_id]?.full_name||'—'}</td><td>{m.movement_type}</td><td>{usd(m.amount)}</td><td>{new Date(m.created_at).toLocaleDateString('es-SV')}</td></tr>)}</tbody></table></div></section>}
      {tab==='reportes'&&<section className="pt-admin-card"><h2>Resumen financiero registrado</h2><div className="pt-admin-stats"><div><small>Capital neto</small><strong>{usd(summary.capital)}</strong></div><div><small>Rendimientos disponibles</small><strong>{usd(summary.yield)}</strong></div><div><small>Rendimientos pagados</small><strong>{usd(summary.paid)}</strong></div><div><small>Total solicitudes</small><strong>{requests.length}</strong></div></div><p className="pt-footnote">Este panel muestra registros internos. No es un estado bancario ni certificación de rendimientos.</p></section>}
      <footer className="pt-footer">Prestaditos Inversionistas · Un sistema de IDEALO SV · Datos privados</footer>
    </main>
  </div>
}
