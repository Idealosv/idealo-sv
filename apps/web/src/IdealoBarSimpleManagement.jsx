import {useMemo,useState} from 'react'
import IdealoBarAdvancedCenter from './IdealoBarAdvancedCenter.jsx'
import IdealoBarManagementV2 from './IdealoBarManagementV2.jsx'
import IdealoBarCommercialReady from './IdealoBarCommercialReady.jsx'

const options=[
 {id:'control',icon:'▦',title:'Control diario',text:'Cuentas divididas, propinas, compras, tickets, delivery, DTE y rentabilidad.',permission:'advanced'},
 {id:'admin',icon:'⚙',title:'Administración',text:'Personal, permisos, reportes, auditoría y configuración del negocio.',permission:'admin.view'},
 {id:'setup',icon:'✓',title:'Puesta en marcha',text:'Revisa qué falta para tener el bar listo para operar.',permission:'admin.manage'},
]

export default function IdealoBarSimpleManagement({company,supabase,access,onOpenCatalog,onOpenInventory}){
 const [screen,setScreen]=useState('home')
 const permissions=Array.isArray(access?.permissions)?access.permissions:[]
 const has=p=>permissions.includes('*')||permissions.includes(p)
 const advanced=has('admin.manage')||has('payment.take')||has('bill.request')||has('inventory.view')||has('inventory.manage')
 const available=useMemo(()=>options.filter(option=>option.permission==='advanced'?advanced:has(option.permission)),[permissions,advanced])

 if(screen==='control')return <div className="bar-simple-management-stage"><StageHeader title="Control diario" onBack={()=>setScreen('home')}/><IdealoBarAdvancedCenter company={company} supabase={supabase} access={access}/></div>
 if(screen==='admin'&&has('admin.view'))return <div className="bar-simple-management-stage"><StageHeader title="Administración" onBack={()=>setScreen('home')}/><IdealoBarManagementV2 company={company} supabase={supabase}/></div>
 if(screen==='setup'&&has('admin.manage'))return <div className="bar-simple-management-stage"><StageHeader title="Puesta en marcha" onBack={()=>setScreen('home')}/><IdealoBarCommercialReady company={company} supabase={supabase} access={access} onOpenCatalog={onOpenCatalog} onOpenInventory={onOpenInventory} onOpenAdmin={()=>setScreen('admin')}/></div>

 return <section className="bar-simple-management-home">
  <header className="bar-simple-page-head"><div><span>GESTIÓN</span><h2>Control del negocio</h2><p>Todo lo administrativo está agrupado aquí para que no tengas que buscar entre muchas pantallas.</p></div></header>
  <div className="bar-simple-management-grid">{available.map(option=><button key={option.id} type="button" onClick={()=>setScreen(option.id)}><span className="bar-simple-management-icon">{option.icon}</span><div><b>{option.title}</b><small>{option.text}</small></div><strong>Entrar →</strong></button>)}</div>
  <div className="bar-simple-help"><b>Forma recomendada de trabajar:</b><span>Vender → revisar Caja/Control → consultar Inventario → cerrar el día desde Gestión.</span></div>
 </section>
}

function StageHeader({title,onBack}){return <div className="bar-simple-stage-head"><button type="button" onClick={onBack}>← Gestión</button><div><small>IDEALO BAR</small><b>{title}</b></div></div>}
