import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { AttendanceLaborModule, EmployeesModule, PayrollModule } from './HrPayrollModules.jsx'
import EmployeeCommissions from './EmployeeCommissions.jsx'

export default function HrPayrollLauncher(){
  const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Empleados')
  useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
  if(!session||!company)return null
  const tabs=['Empleados','Asistencia y mano de obra','Comisiones','Planilla']
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="sidebar-module-access hr" aria-label="Abrir personal y planilla"><span className="module-glyph">♟</span><span className="module-copy"><span>Personal y planilla</span><small>Empleados · Horas · Comisiones · Pago</small></span></button>
    {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Personal y planilla" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>Personal y planilla</strong><small>Asistencia → horas por OT → comisiones → planilla → Caja/Banco</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><nav className="erp-module-tabs">{tabs.map(name=><button type="button" key={name} onClick={()=>setTab(name)} className={`erp-module-tab ${tab===name?'active':''}`}>{name}</button>)}</nav><div className="erp-modal-body commercial-module">{tab==='Empleados'&&<EmployeesModule company={company} supabase={supabase}/>} {tab==='Asistencia y mano de obra'&&<AttendanceLaborModule company={company} supabase={supabase}/>} {tab==='Comisiones'&&<EmployeeCommissions company={company} supabase={supabase}/>} {tab==='Planilla'&&<PayrollModule company={company} supabase={supabase}/>}</div></section></div>}
  </>
}
