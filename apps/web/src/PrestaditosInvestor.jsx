import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { Logo } from './PrestaditosPortal.jsx'

const usd = (n) => new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(n)||0)
const names = {pending:'Pendiente',review:'En revisión',approved:'Aprobada',rejected:'Rechazada',processed:'Procesada'}
const today = () => new Date().toISOString().slice(0,10)
const initial = () => ({request_type:'contribution',withdrawal_source:'capital',amount:'',method:'transfer',requested_date:today(),notes:''})
export default function PrestaditosInvestor({ session }) {
  const [profile,setProfile] = useState(null)
  const [form,setForm] = useState({full_name:'',dui:'',phone:''})
  const [request,setRequest] = useState(initial)
  const [receipt,setReceipt] = useState(null)
  const [requests,setRequests] = useState([])
  const [ledger,setLedger] = useState([])
  const [view,setView] = useState('inicio')
  const [busy,setBusy] = useState(false)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const load = useCallback(async () => {
    setLoading(true);setError('')
    const {data:row,error:profileError}=await supabase.from('prestaditos_investors').select('*').eq('user_id',session.user.id).maybeSingle()
    if(profileError){setError('No se pudo consultar Prestaditos. Puede faltar activar el módulo en Supabase: '+profileError.message);setLoading(false);return}
    setProfile(row)
    if(row){
      const [r,l] = await Promise.all([
        supabase.from('prestaditos_requests').select('*').eq('investor_id',row.id).order('created_at',{ascending:false}),
        supabase.from('prestaditos_ledger').select('*').eq('investor_id',row.id).order('created_at',{ascending:false})
      ])
      if(r.error || l.error) setError((r.error||l.error).message)
      setRequests(r.data||[]);setLedger(l.data||[])
    }
    setLoading(false)
  },[session.user.id])
  useEffect(()=>{void load()},[load])
  const balance=useMemo(()=>ledger.reduce((s,row)=>{
    const n=Number(row.amount)||0
    if(row.movement_type==='capital_in')s.capital+=n
    if(row.movement_type==='capital_out')s.capital-=n
    if(row.movement_type==='yield')s.yield+=n
    if(row.movement_type==='yield_paid'){s.yield-=n;s.paid+=n}
    return s
  },{capital:0,yield:0,paid:0}),[ledger])
  const enroll=async e=>{
    e.preventDefault();setBusy(true);setError('');setNotice('')
    const {error:err}=await supabase.from('prestaditos_investors').insert({
      user_id:session.user.id,full_name:form.full_name.trim(),dui:form.dui.trim(),phone:form.phone.trim(),email:session.user.email
    })
    setBusy(false)
    if(err){setError(err.message);return}
    setNotice('Registro enviado. Prestaditos revisará tus datos antes de habilitar inversiones.')
    void load()
  }
  const send=async e=>{
    e.preventDefault()
    if(!profile || profile.approval_status!=='approved')return
    const amount=Number(request.amount)
    if(!Number.isFinite(amount)||amount<=0||amount>999999999999.99){setError('Ingresa un monto válido.');return}
    setBusy(true);setError('');setNotice('')
    let proof_path=null
    if(request.request_type==='contribution' && receipt){
      const allowed={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}
      if(!allowed[receipt.type]||receipt.size>5*1024*1024){
        setBusy(false);setError('El comprobante debe ser JPG, PNG o PDF de máximo 5 MB.');return
      }
      proof_path=session.user.id+'/'+crypto.randomUUID()+'.'+allowed[receipt.type]
      const {error:uploadErr}=await supabase.storage.from('prestaditos-receipts').upload(proof_path,receipt,{contentType:receipt.type,upsert:false})
      if(uploadErr){setBusy(false);setError('No se pudo adjuntar el comprobante: '+uploadErr.message);return}
    }
    const {error:err}=await supabase.from('prestaditos_requests').insert({
      investor_id:profile.id,request_type:request.request_type,
      withdrawal_source:request.request_type==='withdrawal'?request.withdrawal_source:null,
      amount,method:request.method,requested_date:request.requested_date||null,
      proof_path,notes:request.notes.trim()
    })
    setBusy(false)
    if(err){setError(err.message);return}
    setNotice('Solicitud enviada correctamente. Puedes consultar su estado en el historial.')
    setRequest(initial());setReceipt(null);setView('solicitudes');void load()
  }
  return <div className="pt-app">
    <header className="pt-app-header"><Logo/><div className="pt-header-actions"><span>{profile?.full_name?.split(' ')[0]||'Inversionista'}</span><button type="button" onClick={()=>supabase.auth.signOut()}>Salir</button></div></header>
    <div className="pt-mobile-body">
      {loading ? <div className="pt-loading">Cargando tu información…</div> : <>
        {error && <p className="pt-error" role="alert">{error}</p>}
        {notice && <p className="pt-notice" role="status">{notice}</p>}
        {!profile ? <section className="pt-card pt-enroll">
          <p className="pt-eyebrow">PASO 1 · VERIFICACIÓN</p><h2>Solicita tu registro</h2>
          <p>Completa tus datos. Solo después de la aprobación podrás enviar aportaciones o retiros.</p>
          <form onSubmit={enroll} className="pt-form">
            <label>Nombre completo<input value={form.full_name} maxLength="120" minLength="3" required onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
            <label>DUI<input value={form.dui} minLength="8" maxLength="20" placeholder="00000000-0" required onChange={e=>setForm({...form,dui:e.target.value})}/></label>
            <label>Teléfono<input value={form.phone} minLength="8" maxLength="25" required onChange={e=>setForm({...form,phone:e.target.value})}/></label>
            <label>Correo electrónico<input value={session.user.email||''} readOnly /></label>
            <button className="pt-primary" disabled={busy}>{busy?'Enviando…':'Enviar solicitud de registro'}</button>
          </form>
        </section> : <>
          <div className="pt-welcome"><div><p>Hola, {profile.full_name.split(' ')[0]}</p><h1>Mis inversiones</h1></div><span className={'pt-tag '+profile.approval_status}>{names[profile.approval_status]||profile.approval_status}</span></div>
          {profile.approval_status!=='approved' && <p className="pt-notice">Tu registro está {profile.approval_status==='pending'?'pendiente de revisión':'rechazado'}. El envío de inversiones se habilita al aprobarlo.</p>}
          {view==='inicio' && <>
            <div className="pt-balance"><small>Capital registrado disponible</small><strong>{usd(balance.capital)}</strong><p>Movimientos confirmados por Prestaditos</p></div>
            <div className="pt-stats"><article><small>Rendimientos disponibles</small><strong>{usd(balance.yield)}</strong></article><article><small>Rendimientos pagados</small><strong>{usd(balance.paid)}</strong></article></div>
            <div className="pt-card"><h2>¿Qué deseas hacer?</h2><div className="pt-quick"><button onClick={()=>{setRequest({...initial(),request_type:'contribution'});setView('invertir')}}>+ Solicitar inversión</button><button onClick={()=>{setRequest({...initial(),request_type:'withdrawal'});setView('invertir')}}>↗ Solicitar retiro</button></div></div>
            <p className="pt-footnote">Los rendimientos dependen de los registros y acuerdos aprobados; esta aplicación no garantiza ganancias.</p>
          </>}
          {view==='invertir' && <section className="pt-card"><p className="pt-eyebrow">NUEVA OPERACIÓN</p><h2>Enviar solicitud</h2>
            <div className="pt-tabs"><button className={request.request_type==='contribution'?'active':''} onClick={()=>setRequest({...initial(),request_type:'contribution'})}>Inversión</button><button className={request.request_type==='withdrawal'?'active':''} onClick={()=>setRequest({...initial(),request_type:'withdrawal'})}>Retiro</button></div>
            <form className="pt-form" onSubmit={send}>
              <label>Inversionista<input value={profile.full_name} readOnly /></label>
              <label>Correo<input value={profile.email} readOnly /></label>
              <label>Monto en dólares (USD)<input type="number" min="0.01" max="999999999999.99" step="0.01" required value={request.amount} onChange={e=>setRequest({...request,amount:e.target.value})} placeholder="1000.00" /></label>
              {request.request_type==='withdrawal' && <label>¿Qué deseas retirar?<select value={request.withdrawal_source} onChange={e=>setRequest({...request,withdrawal_source:e.target.value})}><option value="capital">Capital</option><option value="yield">Rendimientos</option></select></label>}
              <label>{request.request_type==='contribution'?'Método de aporte':'Método de pago solicitado'}<select value={request.method} onChange={e=>setRequest({...request,method:e.target.value})}><option value="transfer">Transferencia bancaria</option><option value="deposit">Depósito</option><option value="cash">Efectivo (sujeto a aprobación)</option></select></label>
              <label>Fecha propuesta<input type="date" required value={request.requested_date} onChange={e=>setRequest({...request,requested_date:e.target.value})}/></label>
              {request.request_type==='contribution' && <label>Comprobante (opcional, JPG/PNG/PDF hasta 5 MB)<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>setReceipt(e.target.files?.[0]||null)} /></label>}
              <label>Observaciones<textarea value={request.notes} maxLength="1000" rows="3" onChange={e=>setRequest({...request,notes:e.target.value})}/></label>
              <p className="pt-footnote">Enviar una solicitud no transfiere dinero ni confirma una inversión.</p>
              <button className="pt-primary" disabled={busy||profile.approval_status!=='approved'}>{busy?'Enviando…':'Enviar solicitud'}</button>
            </form>
          </section>}
          {view==='solicitudes' && <section className="pt-card"><h2>Historial de solicitudes</h2>{requests.length===0?<p>Aún no tienes solicitudes.</p>:requests.map(r=><div className="pt-request" key={r.id}><div><strong>{r.request_type==='contribution'?'Aportación':'Retiro'}</strong><small>{new Date(r.created_at).toLocaleDateString('es-SV')} · {r.method}</small></div><div className="pt-right"><b>{usd(r.amount)}</b><span className={'pt-tag '+r.status}>{names[r.status]}</span></div>{r.admin_notes&&<p className="pt-request-note">{r.admin_notes}</p>}</div>)}</section>}
          {view==='movimientos' && <section className="pt-card"><h2>Movimientos registrados</h2>{ledger.length===0?<p>No hay movimientos confirmados.</p>:ledger.map(m=><div key={m.id} className="pt-request"><div><strong>{{capital_in:'Aporte',capital_out:'Retiro de capital',yield:'Rendimiento',yield_paid:'Pago de rendimiento'}[m.movement_type]}</strong><small>{new Date(m.created_at).toLocaleDateString('es-SV')}</small></div><b>{usd(m.amount)}</b></div>)}</section>}
        </>}
      </>}
    </div>
    <nav className="pt-bottom"><button className={view==='inicio'?'active':''} onClick={()=>setView('inicio')}>⌂<small>Inicio</small></button><button className={view==='solicitudes'?'active':''} onClick={()=>setView('solicitudes')}>☷<small>Solicitudes</small></button><button className={view==='invertir'?'active':''} onClick={()=>setView('invertir')}>＄<small>Invertir</small></button><button className={view==='movimientos'?'active':''} onClick={()=>setView('movimientos')}>▤<small>Movimientos</small></button></nav>
  </div>
}
