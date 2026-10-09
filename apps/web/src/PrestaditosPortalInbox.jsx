import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './prestaditos-portal.css'

const num=s=>String(s||'').replace(/[^0-9]/g,'')
const usd=n=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(n)||0)
export default function PrestaditosPortalInbox({company,role,investors=[],payments=[],applications=[],onChanged,onGoPayment}){
 const [rows,setRows]=useState([])
 const [withdrawals,setWithdrawals]=useState([])
 const [pick,setPick]=useState({})
 const [tab,setTab]=useState('access')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const allowed=['owner','admin'].includes(String(role).toLowerCase())
 const load=async()=>{
  if(!company?.id||!allowed)return
  const [a,b]=await Promise.all([
    supabase.from('inv_portal_enrollments').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_portal_withdrawals').select('*').eq('company_id',company.id).order('created_at',{ascending:false})
  ])
  if(a.error||b.error){setError((a.error||b.error).message);return}
  setRows(a.data||[]);setWithdrawals(b.data||[])
 }
 useEffect(()=>{void load()},[company?.id,allowed])
 const action=async(name,params)=>{
  if(busy)return
  setBusy(true);setError('');setNotice('')
  const {error:e}=await supabase.rpc(name,params)
  setBusy(false)
  if(e){setError(e.message);return}
  setNotice('Actualizado correctamente.');await load();await onChanged?.()
 }
 const reject=(id)=>{
  const reason=window.prompt('Motivo del rechazo:')
  if(reason===null)return
  if(reason.trim().length<3){setError('Escribe un motivo de al menos 3 caracteres.');return}
  return reason.trim()
 }
 const openReceipt=async path=>{
  const tab=window.open('','_blank')
  const {data,error:e}=await supabase.storage.from('prestaditos-portal-receipts').createSignedUrl(path,60)
  if(e||!data?.signedUrl){tab?.close();setError(e?.message||'No se pudo abrir el comprobante');return}
  if(tab)tab.location.href=data.signedUrl
  else setError('Permite ventanas emergentes para abrir comprobantes.')
 }
 const portalUrl=company?.id?window.location.origin+'/prestaditos/app?company='+encodeURIComponent(company.id):''
 const choose=(key,value)=>setPick(current=>({...current,[key]:value}))
 const matches=w=>payments.filter(p=>p.investor_id===w.investor_id&&p.investment_id===w.investment_id&&p.payment_type===w.payment_type&&Number(p.amount)===Number(w.amount)&&(p.status||'POSTED')==='POSTED')
 if(!allowed)return <section className="pti-admin-panel"><h2>Portal de inversionistas</h2><p>Solo propietario o administrador puede revisar solicitudes del portal.</p></section>
 return <section className="pti-admin-panel">
  <h2>Acceso de inversionistas y solicitudes de retiro</h2>
  <p>Vincula cada cuenta con el expediente real después de verificar su identidad. Nunca se generan saldos adicionales.</p>
  <div className="pti-admin-copy"><code>{portalUrl}</code><button onClick={()=>navigator.clipboard.writeText(portalUrl).then(()=>setNotice('Enlace copiado')).catch(()=>setError('Copia el enlace manualmente'))}>Copiar enlace de la app</button></div>
  <div className="pti-admin-tabs"><button className={tab==='access'?'active':''} onClick={()=>setTab('access')}>Registros ({rows.filter(x=>x.status==='PENDING').length})</button><button className={tab==='withdraw'?'active':''} onClick={()=>setTab('withdraw')}>Retiros ({withdrawals.filter(x=>x.status==='PENDING'||x.status==='REVIEW'||x.status==='APPROVED').length})</button><button className={tab==='receipts'?'active':''} onClick={()=>setTab('receipts')}>Comprobantes ({applications.filter(a=>a.portal_receipt_path).length})</button><button onClick={load}>Actualizar</button></div>
  {error&&<div role="alert" className="pti-admin-alert bad">{error}</div>}
  {notice&&<div role="status" className="pti-admin-alert">{notice}</div>}
  {tab==='access'&&<>
   <div className="pti-admin-alert">Si el expediente no existe, créalo en Inversionistas. La aprobación exige coincidencia del DUI y correo del expediente.</div>
   <div className="pti-admin-scroll"><table className="pti-admin-table"><thead><tr><th>Solicitante</th><th>DUI</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows.map(e=>{
    const possible=investors.filter(i=>num(i.dui)===num(e.dui)&&i.status==='ACTIVE'&&(!i.email||i.email.trim().toLowerCase()===e.email.trim().toLowerCase()))
    return <tr key={e.id}><td>{e.full_name}<br/>{e.email}<br/>{e.phone}</td><td>{e.dui}</td><td>{e.status}</td><td>{e.status==='PENDING'?<><select aria-label="Expediente verificado" value={pick[e.id]||''} onChange={event=>choose(e.id,event.target.value)}><option value="">Elegir expediente</option>{possible.map(i=><option key={i.id} value={i.id}>{i.first_names} {i.last_names}</option>)}</select><button disabled={busy||!pick[e.id]} className="primary" onClick={()=>{if(window.confirm('¿Verificaste identidad y DUI?'))action('inv_portal_link_account',{p_enrollment:e.id,p_investor:pick[e.id]})}}>Vincular</button><button disabled={busy} onClick={()=>{const reason=reject(e.id);if(reason)action('inv_portal_reject_enrollment',{p_enrollment:e.id,p_reason:reason})}}>Rechazar</button></>:e.decision_notes||'Finalizado'}</td></tr>
   })}</tbody></table></div>{!rows.length&&<p>No hay registros.</p>}
  </>}
  {tab==='receipts'&&<><p>Solo se muestran comprobantes privados adjuntados por inversionistas; el enlace caduca en un minuto.</p><div className="pti-admin-scroll"><table className="pti-admin-table"><thead><tr><th>Solicitud</th><th>Inversionista</th><th>Fecha</th><th>Archivo</th></tr></thead><tbody>{applications.filter(a=>a.portal_receipt_path).map(a=>{const i=investors.find(x=>x.id===a.investor_id);return <tr key={a.id}><td>{a.application_code}</td><td>{i?[i.first_names,i.last_names].join(' '):'—'}</td><td>{new Date(a.created_at).toLocaleDateString('es-SV')}</td><td><button onClick={()=>openReceipt(a.portal_receipt_path)}>Ver comprobante</button></td></tr>})}</tbody></table></div></>}
  {tab==='withdraw'&&<>
   <div className="pti-admin-alert">Aprobar NO transfiere dinero. Completar requiere un pago previamente registrado en Rendimientos.</div>
   <div className="pti-admin-scroll"><table className="pti-admin-table"><thead><tr><th>Inversionista</th><th>Tipo</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{withdrawals.map(w=>{
    const investor=investors.find(i=>i.id===w.investor_id)
    const found=matches(w)
    const call=(status,note='',paymentId=null)=>action('inv_portal_review_withdrawal',{p_request:w.id,p_status:status,p_note:note,p_payment:paymentId})
    return <tr key={w.id}><td>{investor?[investor.first_names,investor.last_names].join(' '):'—'}</td><td>{w.payment_type==='YIELD'?'Rendimiento':'Capital'}</td><td>{usd(w.amount)}</td><td>{w.status}</td><td>{w.status==='PENDING'&&<button disabled={busy} onClick={()=>call('REVIEW')}>Revisar</button>}{w.status==='REVIEW'&&<button disabled={busy} className="primary" onClick={()=>call('APPROVED')}>Aprobar</button>}{['PENDING','REVIEW'].includes(w.status)&&<button disabled={busy} onClick={()=>{const reason=reject(w.id);if(reason)call('REJECTED',reason)}}>Rechazar</button>}{w.status==='APPROVED'&&<><button onClick={()=>onGoPayment?.(w.investment_id)}>Registrar pago</button><select value={pick[w.id]||''} aria-label="Pago asentado" onChange={ev=>choose(w.id,ev.target.value)}><option value="">Seleccionar pago</option>{found.map(p=><option key={p.id} value={p.id}>{p.payment_code||p.id.slice(0,8)}</option>)}</select><button disabled={busy||!pick[w.id]} className="primary" onClick={()=>{if(window.confirm('¿Confirmas el pago en ERP?'))call('COMPLETED','Pago verificado',pick[w.id])}}>Completar</button></>}{['COMPLETED','REJECTED'].includes(w.status)&&'Cerrada'}</td></tr>
   })}</tbody></table></div>{!withdrawals.length&&<p>No hay solicitudes de retiro.</p>}
  </>}
 </section>
}
