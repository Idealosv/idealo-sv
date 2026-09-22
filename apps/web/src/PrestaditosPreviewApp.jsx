import { useMemo, useState } from 'react'
import './prestaditos-investors.css'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const TABS=['Dashboard','Notificaciones','Agenda','Inversionistas','Perfil 360','Solicitudes','Simulador','Inversiones','Contratos','Beneficiarios','Estado de cuenta','Rendimientos','Vencimientos','Renovaciones','Tesorería','Documentos','Reportes','Cierre mensual','Auditoría','Auditoría técnica','Prueba integral','Preparación','Configuración']

const demo={
 investors:[
  {id:'i1',code:'INV-2026-001284',name:'Carlos Ernesto Mejía',dui:'01234567-8',phone:'7788-1122',email:'carlos@ejemplo.com',docs:'3/3',status:'Activo'},
  {id:'i2',code:'INV-2026-001517',name:'María Elena López',dui:'02345678-9',phone:'7211-4433',email:'maria@ejemplo.com',docs:'3/3',status:'Activo'},
  {id:'i3',code:'INV-2026-001793',name:'José Roberto Hernández',dui:'03456789-0',phone:'7654-3300',email:'jose@ejemplo.com',docs:'2/3',status:'Activo'},
 ],
 applications:[
  {code:'SOL-20260918-A2F811',name:'Carlos Ernesto Mejía',amount:15000,term:12,status:'Aprobada',place:'Transferencia bancaria'},
  {code:'SOL-20260920-B5C229',name:'María Elena López',amount:8000,term:6,status:'En revisión',place:'Oficina central'},
  {code:'SOL-20260921-C9D184',name:'José Roberto Hernández',amount:20000,term:18,status:'Pendiente',place:'Transferencia bancaria'},
 ],
 investments:[
  {code:'INVEST-20260901-A1B2C3',name:'Carlos Ernesto Mejía',capital:4000,term:12,granted:'01 sep 2026',maturity:'01 sep 2027',gain:400,rate:10,status:'Activa'},
  {code:'INVEST-20260815-D4E5F6',name:'María Elena López',capital:8000,term:6,granted:'15 ago 2026',maturity:'15 feb 2027',gain:960,rate:12,status:'Activa'},
  {code:'INVEST-20260310-G7H8I9',name:'José Roberto Hernández',capital:12000,term:6,granted:'10 mar 2026',maturity:'10 sep 2026',gain:1800,rate:15,status:'Vencida'},
 ],
 contracts:[
  {code:'CTR-20260901-AB12CD',number:'PS-2026-001',investor:'Carlos Ernesto Mejía',investment:'INVEST-20260901-A1B2C3',capital:4000,rate:10,status:'Firmado'},
  {code:'CTR-20260815-EF34GH',number:'PS-2026-002',investor:'María Elena López',investment:'INVEST-20260815-D4E5F6',capital:8000,rate:12,status:'Preparado'},
 ],
 beneficiaries:[
  {code:'BEN-20260901-11AB22',name:'Ana Mejía',investor:'Carlos Ernesto Mejía',relation:'Esposa',pct:60,status:'Activo'},
  {code:'BEN-20260901-33CD44',name:'Luis Mejía',investor:'Carlos Ernesto Mejía',relation:'Hijo',pct:40,status:'Activo'},
  {code:'BEN-20260815-55EF66',name:'Sofía López',investor:'María Elena López',relation:'Hija',pct:100,status:'Activo'},
 ],
 payments:[
  {code:'PAG-20260905-AA1122',name:'Carlos Ernesto Mejía',investment:'INVEST-20260901-A1B2C3',type:'Rendimiento',amount:150,date:'05 sep 2026',status:'Vigente'},
  {code:'PAG-20260915-BB3344',name:'María Elena López',investment:'INVEST-20260815-D4E5F6',type:'Rendimiento',amount:120,date:'15 sep 2026',status:'Vigente'},
  {code:'PAG-20260918-CC5566',name:'José Roberto Hernández',investment:'INVEST-20260310-G7H8I9',type:'Devolución de capital',amount:12000,date:'18 sep 2026',status:'Vigente'},
 ],
 renewals:[
  {code:'REN-20260910-AB1234',name:'José Roberto Hernández',investment:'INVEST-20260310-G7H8I9',decision:'Renovar capital',amount:12000,term:12,status:'Registrada'},
 ],
 documents:[
  {code:'DOC-20260901-AA1010',title:'Contrato de inversión firmado',investor:'Carlos Ernesto Mejía',relation:'INVEST-20260901-A1B2C3',type:'Contrato',size:'1.8 MB',status:'Activo'},
  {code:'DOC-20260905-BB2020',title:'Comprobante de transferencia',investor:'Carlos Ernesto Mejía',relation:'INVEST-20260901-A1B2C3',type:'Comprobante de pago',size:'462 KB',status:'Activo'},
  {code:'DOC-20260915-CC3030',title:'Formulario de beneficiarios',investor:'María Elena López',relation:'Expediente general',type:'Formulario',size:'820 KB',status:'Activo'},
 ],
 audit:[
  {date:'21 sep 2026 · 10:14',category:'Inversionistas',action:'Inversionista actualizado',investor:'Carlos Ernesto Mejía',actor:'Usuario 41a8c229'},
  {date:'21 sep 2026 · 10:32',category:'Solicitudes',action:'Solicitud aprobada',investor:'María Elena López',actor:'Usuario 41a8c229'},
  {date:'21 sep 2026 · 10:49',category:'Pagos',action:'Pago registrado',investor:'Carlos Ernesto Mejía',actor:'Usuario 41a8c229'},
  {date:'21 sep 2026 · 11:06',category:'Documentos',action:'Documento registrado',investor:'María Elena López',actor:'Usuario 41a8c229'},
 ],
}

function Status({children,tone='active'}){return <span className={`prst-status ${tone}`}>{children}</span>}
function Card({title,kicker='MÓDULO',children}){return <article className="prst-card"><div className="prst-card-head"><div><small>{kicker}</small><h2>{title}</h2></div></div>{children}</article>}
function Table({headers,rows}){return <div className="prst-table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>}

export default function PrestaditosPreviewApp(){
 const [tab,setTab]=useState('Dashboard')
 const [mobileNavOpen,setMobileNavOpen]=useState(false)
 const capital=useMemo(()=>demo.investments.filter(x=>x.status==='Activa').reduce((s,x)=>s+x.capital,0),[])
 const projected=useMemo(()=>demo.investments.filter(x=>x.status==='Activa').reduce((s,x)=>s+x.gain,0),[])
 const yieldPaid=useMemo(()=>demo.payments.filter(x=>x.type==='Rendimiento').reduce((s,x)=>s+x.amount,0),[])

 const selectTab=name=>{setTab(name);setMobileNavOpen(false)}
 return <div className="prst-app">
  {mobileNavOpen&&<button type="button" className="prst-mobile-overlay" aria-label="Cerrar menú" onClick={()=>setMobileNavOpen(false)}/>}
  <aside className={`prst-sidebar ${mobileNavOpen?'mobile-open':''}`}>
   <div className="prst-brand"><span className="prst-mark">$</span><div><strong>PRESTADITO$</strong><small>El Préstamo a tu Crecimiento</small></div></div>
   <div className="prst-company"><span>IDEALO SV · VISTA PREVIA</span><strong>Prestadito$ El Salvador</strong><small>ERP de inversionistas</small></div>
   <nav>{TABS.map(name=><button key={name} type="button" className={tab===name?'active':''} onClick={()=>selectTab(name)}><strong>{name}</strong><small>{({
    Dashboard:'Resumen ejecutivo',Notificaciones:'Seguimiento operativo',Agenda:'Vencimientos y tareas',Inversionistas:'Expedientes y documentos','Perfil 360':'Vista integral del inversionista',Solicitudes:'Solicitudes de inversión',Simulador:'Tasas anuales por monto',Inversiones:'Capital y vigencias',Contratos:'PDF y firma',Beneficiarios:'Designaciones','Estado de cuenta':'Resumen por inversionista',Rendimientos:'Pagos al inversionista',Vencimientos:'Fechas críticas',Renovaciones:'Decisiones al vencimiento',Tesorería:'Entradas y salidas',Documentos:'Expediente privado',Reportes:'Indicadores gerenciales','Cierre mensual':'Snapshot del período',Auditoría:'Trazabilidad','Auditoría técnica':'Integridad y seguridad','Prueba integral':'3 casos ficticios',Preparación:'Cierre para producción',Configuración:'Reglas del vertical'
   })[name]}</small></button>)}</nav>
  </aside>

  <main className="prst-main">
   <header className="prst-topbar">
    <button type="button" className="prst-mobile-menu" onClick={()=>setMobileNavOpen(true)} aria-label="Abrir menú">☰</button>
    <div className="prst-top-title"><span>IDEALO SV · FINANCIERA / INVERSIONISTAS</span><h1>{tab}</h1><p>Vista previa con datos demostrativos. No modifica información real.</p></div>
    <PreviewSearch onOpen={()=>selectTab('Perfil 360')}/>
    <div className="prst-top-actions"><button type="button" onClick={()=>selectTab('Dashboard')}>Inicio</button></div>
   </header>
   <div className="prst-alert success">VISTA PREVIA · Esta pantalla sirve para revisar diseño, orden y funcionamiento visual antes de integrar Prestadito$ a producción.</div>
   <section className="prst-content">
    {tab==='Dashboard'&&<Dashboard capital={capital} projected={projected} yieldPaid={yieldPaid} onGo={selectTab}/>} 
    {tab==='Notificaciones'&&<Notifications/>}
    {tab==='Agenda'&&<Agenda/>}
    {tab==='Inversionistas'&&<Investors/>}
    {tab==='Perfil 360'&&<Profile360/>}
    {tab==='Solicitudes'&&<Applications/>}
    {tab==='Simulador'&&<Simulator/>}
    {tab==='Inversiones'&&<Investments/>}
    {tab==='Contratos'&&<Contracts/>}
    {tab==='Beneficiarios'&&<Beneficiaries/>}
    {tab==='Estado de cuenta'&&<Statement/>}
    {tab==='Rendimientos'&&<Payments/>}
    {tab==='Vencimientos'&&<Maturities/>}
    {tab==='Renovaciones'&&<Renewals/>}
    {tab==='Tesorería'&&<Treasury capital={capital} yieldPaid={yieldPaid}/>} 
    {tab==='Documentos'&&<Documents/>}
    {tab==='Reportes'&&<Reports/>}
    {tab==='Cierre mensual'&&<MonthlyCloseout/>}
    {tab==='Auditoría'&&<Audit/>}
    {tab==='Auditoría técnica'&&<TechnicalAudit/>}
    {tab==='Prueba integral'&&<EndToEndDemo/>}
    {tab==='Preparación'&&<Readiness/>}
    {tab==='Configuración'&&<Configuration/>}
   </section>
  </main>
 </div>
}

function Dashboard({capital,projected,yieldPaid,onGo}){
 return <>
  <section className="prst-metrics">
   <Metric label="Inversionistas" value="3" hint="expedientes registrados"/>
   <Metric label="Capital activo" value={money(capital)} hint="2 inversiones activas" tone="money"/>
   <Metric label="Solicitudes pendientes" value="2" hint="por revisar o formalizar" tone="warn"/>
   <Metric label="Referencia anual" value={money(projected)} hint="proyección demostrativa" tone="money"/>
   <Metric label="Rendimientos pagados" value={money(yieldPaid)} hint="pagos registrados"/>
   <Metric label="Próximo vencimiento" value="15 feb 2027" hint="seguimiento automático"/>
  </section>
  <section className="prst-grid two">
   <Card title="Atención requerida" kicker="ALERTAS OPERATIVAS">
    <div className="prst-dashboard-alerts">
     <button className="critical"><span>Crítica</span><strong>Inversión vencida</strong><small>José Roberto Hernández · 11 días vencida</small></button>
     <button className="high"><span>Alta</span><strong>Contrato pendiente de firma</strong><small>María Elena López · CTR-20260815-EF34GH</small></button>
     <button className="medium"><span>Media</span><strong>Expediente incompleto</strong><small>José Roberto Hernández · falta documento de identidad</small></button>
    </div>
   </Card>
   <Card title="Flujo principal" kicker="OPERACIÓN DE INVERSIONISTAS">
    <div className="prst-flow">
     {[
      ['1','Registrar inversionista','Datos, rostro y DUI','Inversionistas'],
      ['2','Recibir solicitud','Monto, plazo y lugar de pago','Solicitudes'],
      ['3','Aprobar y formalizar','Contrato, capital y vencimiento','Inversiones'],
      ['4','Registrar pagos','Rendimientos y devolución de capital','Rendimientos'],
      ['5','Gestionar vencimiento','Renovar o retirar','Renovaciones'],
     ].map(([n,t,s,target])=><button key={n} type="button" onClick={()=>onGo(target)}><b>{n}</b><span><strong>{t}</strong><small>{s}</small></span></button>)}
    </div>
   </Card>
   <Card title="Solicitudes recientes" kicker="ACTIVIDAD">
    <div className="prst-list">{demo.applications.map(x=><article key={x.code}><div><b>{x.name}</b><small>{money(x.amount)} · {x.term} meses</small></div><Status tone={x.status==='Aprobada'?'active':x.status==='Pendiente'?'pending':'review'}>{x.status}</Status></article>)}</div>
   </Card>
  </section>
  <section className="prst-executive-analytics">
   <section className="prst-grid two">
    <Card title="Capital vigente por tasa anual" kicker="DISTRIBUCIÓN POR TASA">
     <div className="prst-exec-bars">
      <div className="prst-exec-bar"><div><span>10% anual</span><b>{money(4000)}</b></div><div className="prst-exec-track"><i style={{width:'33%'}}/></div><small>1 inversión</small></div>
      <div className="prst-exec-bar"><div><span>12% anual</span><b>{money(8000)}</b></div><div className="prst-exec-track"><i style={{width:'67%'}}/></div><small>1 inversión</small></div>
      <div className="prst-exec-bar"><div><span>15% anual</span><b>{money(12000)}</b></div><div className="prst-exec-track"><i style={{width:'100%'}}/></div><small>1 inversión vencida</small></div>
     </div>
    </Card>
    <Card title="Capital por ventana de vencimiento" kicker="VENCIMIENTOS">
     <div className="prst-exec-bars"><div className="prst-exec-bar"><div><span>Vencidas</span><b>{money(12000)}</b></div><div className="prst-exec-track"><i style={{width:'100%'}}/></div><small>1 inversión</small></div><div className="prst-exec-bar"><div><span>Más de 90 días</span><b>{money(12000)}</b></div><div className="prst-exec-track"><i style={{width:'100%'}}/></div><small>2 inversiones activas</small></div></div>
    </Card>
   </section>
  </section>
 </>}

function Metric({label,value,hint,tone=''}){return <article className={`prst-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>}

function Investors(){return <>
 <section className="prst-investor-summary"><article><span>Total</span><strong>3</strong><small>expedientes</small></article><article><span>Activos</span><strong>3</strong><small>habilitados</small></article><article><span>Documentación completa</span><strong>2</strong><small>rostro + DUI</small></article><article><span>Documentos pendientes</span><strong>1</strong><small>requiere seguimiento</small></article></section>
 <Card title="Directorio de inversionistas" kicker="EXPEDIENTES">
  <Table headers={['Inversionista','DUI','Contacto','Documentos','Estado']} rows={demo.investors.map(x=><tr key={x.id}><td><b>{x.name}</b><small>{x.code}</small></td><td>{x.dui}</td><td><b>{x.phone}</b><small>{x.email}</small></td><td><span className={`prst-doc-badge ${x.docs==='3/3'?'complete':'pending'}`}>{x.docs}</span></td><td><Status>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Applications(){return <>
 <section className="prst-investor-summary"><article><span>Solicitudes</span><strong>3</strong><small>histórico</small></article><article><span>Pendientes / revisión</span><strong>2</strong><small>{money(28000)} solicitado</small></article><article><span>Aprobadas</span><strong>1</strong><small>lista para proceso</small></article><article><span>Formalizadas</span><strong>0</strong><small>desde esta muestra</small></article></section>
 <Card title="Bandeja de solicitudes" kicker="CONTROL">
  <Table headers={['Solicitud','Inversionista','Monto','Plazo','Lugar','Estado']} rows={demo.applications.map(x=><tr key={x.code}><td><b>{x.code}</b></td><td>{x.name}</td><td><b>{money(x.amount)}</b></td><td>{x.term} meses</td><td>{x.place}</td><td><Status tone={x.status==='Aprobada'?'active':x.status==='Pendiente'?'pending':'review'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Investments(){return <>
 <section className="prst-investor-summary"><article><span>Inversiones activas</span><strong>2</strong><small>vigentes</small></article><article><span>Capital activo</span><strong>{money(12000)}</strong><small>formalizado</small></article><article><span>Referencia anual</span><strong>{money(1360)}</strong><small>demostrativa</small></article><article><span>Vencidas</span><strong>1</strong><small>requiere gestión</small></article></section>
 <Card title="Portafolio de inversiones" kicker="INVERSIONES">
  <Table headers={['Inversión','Inversionista','Capital','Plazo','Tasa anual','Otorgada','Vence','Referencia anual','Estado']} rows={demo.investments.map(x=><tr key={x.code}><td><b>{x.code}</b></td><td>{x.name}</td><td><b>{money(x.capital)}</b></td><td>{x.term} meses</td><td><b>{x.rate}% anual</b><small>según monto de ejemplo</small></td><td>{x.granted}</td><td>{x.maturity}</td><td>{money(x.gain)}</td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Beneficiaries(){return <>
 <section className="prst-investor-summary"><article><span>Beneficiarios activos</span><strong>3</strong><small>designaciones</small></article><article><span>Inversionistas cubiertos</span><strong>2</strong><small>con beneficiarios</small></article><article><span>Asignación completa</span><strong>2</strong><small>100% distribuido</small></article><article><span>Inactivos</span><strong>0</strong><small>histórico</small></article></section>
 <Card title="Beneficiarios registrados" kicker="DESIGNACIONES">
  <Table headers={['Código','Beneficiario','Inversionista','Relación','Porcentaje','Estado']} rows={demo.beneficiaries.map(x=><tr key={x.code}><td>{x.code}</td><td><b>{x.name}</b></td><td>{x.investor}</td><td>{x.relation}</td><td><b>{x.pct.toFixed(2)}%</b></td><td><Status>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Payments(){return <>
 <section className="prst-investor-summary"><article><span>Rendimientos pagados</span><strong>{money(270)}</strong><small>vigentes</small></article><article><span>Capital devuelto</span><strong>{money(12000)}</strong><small>registrado</small></article><article><span>Movimientos</span><strong>3</strong><small>en la muestra</small></article><article><span>Revertidos</span><strong>0</strong><small>auditoría</small></article></section>
 <Card title="Libro de pagos" kicker="RENDIMIENTOS / PAGOS">
  <Table headers={['Pago','Fecha','Inversionista','Inversión','Tipo','Monto','Estado']} rows={demo.payments.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.date}</td><td>{x.name}</td><td>{x.investment}</td><td>{x.type}</td><td><b>{money(x.amount)}</b></td><td><Status>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Maturities(){return <>
 <section className="prst-investor-summary"><article><span>Vencidas</span><strong>1</strong><small>requiere decisión</small></article><article><span>Próximos 7 días</span><strong>0</strong><small>atención inmediata</small></article><article><span>Próximos 30 días</span><strong>0</strong><small>gestión preventiva</small></article><article><span>Próximos 90 días</span><strong>0</strong><small>planificación</small></article></section>
 <Card title="Control de vencimientos" kicker="CALENDARIO">
  <Table headers={['Inversión','Inversionista','Capital','Vencimiento','Situación']} rows={demo.investments.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td><b>{money(x.capital)}</b></td><td>{x.maturity}</td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status==='Vencida'?'Vencida':'Vigente'}</Status></td></tr>)}/>
 </Card>
 </>}

function Renewals(){return <>
 <section className="prst-investor-summary"><article><span>Por gestionar</span><strong>1</strong><small>vencida / ≤30 días</small></article><article><span>Decisiones registradas</span><strong>1</strong><small>pendiente de ejecución</small></article><article><span>Intención de renovar</span><strong>1</strong><small>capital</small></article><article><span>No renovar</span><strong>0</strong><small>retiros</small></article></section>
 <Card title="Decisiones de renovación" kicker="RENOVACIONES">
  <Table headers={['Código','Inversionista','Inversión','Decisión','Monto','Nuevo plazo','Estado']} rows={demo.renewals.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td>{x.investment}</td><td>{x.decision}</td><td><b>{money(x.amount)}</b></td><td>{x.term} meses</td><td><Status tone="review">{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Treasury({capital,yieldPaid}){return <>
 <section className="prst-investor-summary"><article><span>Capital recibido</span><strong>{money(24000)}</strong><small>formalizado</small></article><article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong><small>salidas vigentes</small></article><article><span>Capital devuelto</span><strong>{money(12000)}</strong><small>devoluciones</small></article><article><span>Posición neta</span><strong>{money(11730)}</strong><small>entradas menos salidas</small></article></section>
 <Card title="Libro consolidado de tesorería" kicker="MOVIMIENTOS">
  <Table headers={['Fecha','Movimiento','Inversionista','Inversión','Entrada','Salida','Estado']} rows={[
   <tr key="t1"><td>01 sep 2026</td><td>Entrada de capital</td><td>Carlos Ernesto Mejía</td><td>INVEST-20260901-A1B2C3</td><td><b className="prst-money-in">{money(4000)}</b></td><td>—</td><td><Status>Vigente</Status></td></tr>,
   <tr key="t2"><td>05 sep 2026</td><td>Pago de rendimiento</td><td>Carlos Ernesto Mejía</td><td>INVEST-20260901-A1B2C3</td><td>—</td><td><b className="prst-money-out">{money(150)}</b></td><td><Status>Vigente</Status></td></tr>,
   <tr key="t3"><td>18 sep 2026</td><td>Devolución de capital</td><td>José Roberto Hernández</td><td>INVEST-20260310-G7H8I9</td><td>—</td><td><b className="prst-money-out">{money(12000)}</b></td><td><Status>Vigente</Status></td></tr>,
  ]}/>
 </Card>
 </>}


function Documents(){return <>
 <section className="prst-investor-summary"><article><span>Documentos activos</span><strong>3</strong><small>archivos vigentes</small></article><article><span>Contratos</span><strong>1</strong><small>documento contractual</small></article><article><span>Comprobantes</span><strong>1</strong><small>respaldo de pago</small></article><article><span>Inactivos</span><strong>0</strong><small>histórico conservado</small></article></section>
 <Card title="Repositorio documental" kicker="EXPEDIENTE PRIVADO">
  <Table headers={['Documento','Inversionista','Relación','Tipo','Archivo','Estado']} rows={demo.documents.map(x=><tr key={x.code}><td><b>{x.title}</b><small>{x.code}</small></td><td>{x.investor}</td><td>{x.relation}</td><td>{x.type}</td><td>{x.size}</td><td><Status>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}


function Reports(){return <>
 <section className="prst-metrics">
  <Metric label="Inversionistas activos" value="3" hint="expedientes habilitados"/>
  <Metric label="Capital activo" value={money(12000)} hint="inversiones vigentes" tone="money"/>
  <Metric label="Referencia anual" value={money(1360)} hint="referencia anual" tone="money"/>
  <Metric label="Rendimientos pagados" value={money(270)} hint="pagos vigentes"/>
  <Metric label="Capital devuelto" value={money(12000)} hint="devoluciones"/>
  <Metric label="Vencidas" value="1" hint="requiere seguimiento" tone="warn"/>
 </section>
 <Card title="Inversiones" kicker="REPORTES GERENCIALES">
  <div className="prst-report-tabs"><button className="active">Inversiones</button><button>Inversionistas</button><button>Solicitudes</button><button>Pagos</button><button>Vencimientos</button><button>Renovaciones</button><button>Documentos</button></div>
  <Table headers={['Código','Inversionista','Capital','Plazo','Otorgada','Vence','Ganancia','Estado']} rows={demo.investments.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td><b>{money(x.capital)}</b></td><td>{x.term} meses</td><td>{x.granted}</td><td>{x.maturity}</td><td>{money(x.gain)}</td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Audit(){return <>
 <section className="prst-investor-summary"><article><span>Eventos cargados</span><strong>4</strong><small>últimos movimientos</small></article><article><span>Expedientes</span><strong>1</strong><small>cambios de inversionistas</small></article><article><span>Financieros</span><strong>2</strong><small>solicitudes y pagos</small></article><article><span>Documentales</span><strong>1</strong><small>archivos</small></article></section>
 <Card title="Auditoría del ERP" kicker="TRAZABILIDAD">
  <Table headers={['Fecha y hora','Categoría','Acción','Inversionista','Responsable']} rows={demo.audit.map((x,i)=><tr key={i}><td><b>{x.date}</b></td><td><span className="prst-audit-category">{x.category}</span></td><td>{x.action}</td><td>{x.investor}</td><td>{x.actor}</td></tr>)}/>
 </Card>
 </>}


function Configuration(){return <>
 <section className="prst-investor-summary prst-config-summary">
  <article><span>Empresa</span><strong>Prestadito$ El Salvador</strong><small>vertical de inversionistas</small></article>
  <article><span>Tu rol</span><strong>owner</strong><small>permisos efectivos</small></article>
  <article><span>Plazos configurados</span><strong>3</strong><small>6, 12, 18 meses</small></article>
  <article><span>Rendimiento</span><strong>10 · 12 · 15%</strong><small>tasas anuales por monto</small></article>
 </section>
 <Card title="Reglas y catálogos de Prestadito$" kicker="CONFIGURACIÓN OPERATIVA">
  <div className="prst-config-sections">
   <section><div className="prst-section-title">Plazos disponibles</div><p className="prst-copy">Opciones sugeridas para solicitudes y renovaciones.</p><div className="prst-chip-list"><span>6 meses</span><span>12 meses</span><span>18 meses</span></div></section>
   <section><div className="prst-section-title">Formas de pago</div><p className="prst-copy">Catálogo de uso operativo.</p><div className="prst-chip-list"><span>Transferencia bancaria</span><span>Depósito</span><span>Efectivo</span></div></section>
   <section><div className="prst-section-title">Lugares de pago</div><p className="prst-copy">Nombres consistentes en el ERP.</p><div className="prst-chip-list"><span>Oficina central</span><span>Banco</span></div></section>
   <section><div className="prst-section-title">Rendimiento financiero</div><div className="prst-config-locked"><div><span>Tasas anuales</span><strong>10% · 12% · 15% anual</strong></div><p>Ejemplos provisionales por monto hasta recibir la tabla real.</p><div className="prst-rate-tier-list"><span>$1,000 a $4,999.99 → <b>10% anual</b></span><span>$5,000 a $9,999.99 → <b>12% anual</b></span><span>$10,000 en adelante → <b>15% anual</b></span></div></div></section>
  </div>
 </Card>
 <Card title="Matriz de acceso" kicker="PERMISOS EFECTIVOS">
  <Table headers={['Acción','Propietario','Administrador','Personal','Otros']} rows={[
   ['Consultar información','Sí','Sí','Sí','Sí'],
   ['Registrar solicitudes','Sí','Sí','Sí','No'],
   ['Aprobar solicitudes','Sí','Sí','No','No'],
   ['Formalizar inversiones','Sí','Sí','No','No'],
   ['Registrar / revertir pagos','Sí','Sí','No','No'],
   ['Modificar configuración','Sí','Sí','No','No'],
  ].map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{j===0?<b>{cell}</b>:cell}</td>)}</tr>)}/>
 </Card>
 </>}


function Contracts(){return <>
 <section className="prst-investor-summary prst-contracts-summary"><article><span>Contratos preparados</span><strong>2</strong><small>documentos operativos</small></article><article><span>Firmados</span><strong>1</strong><small>con documento archivado</small></article><article><span>Pendientes de firma</span><strong>1</strong><small>requieren seguimiento</small></article><article><span>Porcentajes disponibles</span><strong>10 · 12 · 15%</strong><small>tasas anuales</small></article></section>
 <Card title="Control contractual" kicker="CONTRATOS / PDF / FIRMA">
  <div className="prst-note"><strong>Confirmado:</strong> 10%, 12% y 15% son tasas anuales. Por ahora usamos como ejemplo: $1,000–$4,999.99 = 10%, $5,000–$9,999.99 = 12% y $10,000+ = 15%.</div>
  <Table headers={['Contrato','Inversionista','Inversión','Capital','Porcentaje','Estado']} rows={demo.contracts.map(x=><tr key={x.code}><td><b>{x.code}</b><small>{x.number}</small></td><td>{x.investor}</td><td>{x.investment}</td><td>{money(x.capital)}</td><td><b>{x.rate}% anual</b><small>según monto de ejemplo</small></td><td><Status tone={x.status==='Firmado'?'active':'review'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}


function Simulator(){
 const [amount,setAmount]=useState('5000')
 const [term,setTerm]=useState('12')
 const value=Number(amount||0)
 const rate=value>=10000?15:value>=5000?12:value>=1000?10:10
 const annual=value*rate/100
 const selected=Number(term)===12?annual:null
 return <>
  <section className="prst-investor-summary prst-simulator-summary">
   <article><span>Monto simulado</span><strong>{money(value)}</strong><small>capital de referencia</small></article>
   <article><span>Tasa anual</span><strong>{rate}%</strong><small>rango provisional</small></article>
   <article><span>Referencia anual</span><strong>{money(annual)}</strong><small>capital × tasa anual</small></article>
   <article><span>Plazo</span><strong>{term} meses</strong><small>{selected==null?'prorrateo pendiente':'equivale a un año'}</small></article>
  </section>
  <section className="prst-grid form-list">
   <Card title="Simular una inversión" kicker="SIMULADOR">
    <div className="prst-form-grid">
     <label className="prst-field"><span>Monto a invertir</span><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label className="prst-field"><span>Plazo</span><div className="prst-input-suffix"><input type="number" value={term} onChange={e=>setTerm(e.target.value)}/><span>meses</span></div></label>
    </div>
    <div className="prst-rate-reference"><span><b>Tasa anual sugerida</b><strong>{rate}%</strong></span><span><b>Ganancia anual de referencia</b><strong>{money(annual)}</strong></span><span><b>Ganancia del plazo seleccionado</b><strong>{selected==null?'Pendiente de regla':money(selected)}</strong></span><span><b>Total a 12 meses</b><strong>{money(value+annual)}</strong></span><small>{Number(term)===12?'Para 12 meses la referencia anual coincide con el plazo simulado.':'Para este plazo todavía no se calcula automáticamente el rendimiento hasta recibir la regla de prorrateo.'}</small></div>
   </Card>
   <Card title="Tasas anuales por monto" kicker="EJEMPLOS PROVISIONALES">
    <div className="prst-simulator-examples"><article><span>$1,000 a $4,999.99</span><strong>10% anual</strong><small>Ejemplo: $2,000 → $200 al año</small></article><article><span>$5,000 a $9,999.99</span><strong>12% anual</strong><small>Ejemplo: $7,500 → $900 al año</small></article><article><span>$10,000 en adelante</span><strong>15% anual</strong><small>Ejemplo: $15,000 → $2,250 al año</small></article></div>
   </Card>
  </section>
 </>}

function Statement(){return <>
 <section className="prst-investor-summary prst-statement-summary"><article><span>Capital vigente</span><strong>{money(4000)}</strong><small>saldo actual</small></article><article><span>Capital histórico</span><strong>{money(4000)}</strong><small>formalizado</small></article><article><span>Rendimientos pagados</span><strong>{money(150)}</strong><small>movimientos vigentes</small></article><article><span>Capital devuelto</span><strong>{money(0)}</strong><small>devoluciones</small></article></section>
 <Card title="Estado de cuenta · Carlos Ernesto Mejía" kicker="ESTADO DE CUENTA">
  <div className="prst-profile-grid"><article><small>Código</small><b>INV-2026-001284</b><span>DUI 01234567-8</span></article><article><small>Inversiones</small><b>1</b><span>1 vigente</span></article><article><small>Tasa</small><b>10% anual</b><span>rango provisional</span></article><article><small>Beneficiarios</small><b>2</b><span>100% asignado</span></article></div>
  <Table headers={['Inversión','Capital','Tasa anual','Inicio','Vence','Capital pendiente','Estado']} rows={[<tr key="s1"><td>INVEST-20260901-A1B2C3</td><td>{money(4000)}</td><td>10% anual</td><td>01 sep 2026</td><td>01 sep 2027</td><td><b>{money(4000)}</b></td><td><Status>Activa</Status></td></tr>]}/>
  <div className="prst-note"><strong>PDF:</strong> en la versión operativa se puede imprimir o guardar este estado de cuenta como PDF.</div>
 </Card>
 </>}

function MonthlyCloseout(){return <>
 <section className="prst-investor-summary prst-closeout-summary"><article><span>Cierres guardados</span><strong>2</strong><small>todas las versiones</small></article><article><span>Meses cerrados</span><strong>1</strong><small>septiembre 2026</small></article><article><span>Último período</span><strong>sep 2026</strong><small>CIE-202609-V02</small></article><article><span>Modo</span><strong>Snapshot</strong><small>no bloquea movimientos</small></article></section>
 <Card title="CIE-202609-V02 · septiembre 2026" kicker="CIERRE MENSUAL">
  <section className="prst-metrics prst-closeout-detail"><article><span>Nuevas inversiones</span><strong>1</strong><small>formalizadas</small></article><article><span>Capital formalizado</span><strong>{money(4000)}</strong><small>del período</small></article><article><span>Rendimientos pagados</span><strong>{money(270)}</strong><small>vigentes</small></article><article><span>Capital devuelto</span><strong>{money(12000)}</strong><small>vigente</small></article><article><span>Vencimientos</span><strong>1</strong><small>del período</small></article><article><span>Renovaciones</span><strong>1</strong><small>ejecutadas</small></article></section>
  <div className="prst-note"><strong>No destructivo:</strong> el cierre conserva versiones y no modifica inversiones, pagos ni contratos.</div>
 </Card>
 </>}

function TechnicalAudit(){return <>
 <section className="prst-investor-summary prst-tech-audit-summary"><article><span>Estado general</span><strong>Correcto</strong><small>sin inconsistencias demo</small></article><article><span>Errores</span><strong>0</strong><small>integridad crítica</small></article><article><span>Advertencias</span><strong>0</strong><small>requieren verificación</small></article><article><span>Controles</span><strong>6</strong><small>seguridad implementada</small></article></section>
 <Card title="Integridad del vertical" kicker="AUDITORÍA TÉCNICA"><div className="prst-tech-ok"><strong>Sin inconsistencias detectadas.</strong><span>Inversiones, pagos, contratos, documentos y renovaciones mantienen consistencia en la muestra.</span></div></Card>
 <Card title="Controles implementados" kicker="ARQUITECTURA DE SEGURIDAD"><div className="prst-security-checks">{['Aislamiento por empresa','Pagos protegidos','Inversiones protegidas','Documentos privados','Contratos auditados','Cierres no destructivos'].map(x=><article key={x}><span>✓</span><div><strong>{x}</strong><small>Control activo en el vertical de inversionistas.</small></div></article>)}</div></Card>
 </>}

function Notifications(){return <>
 <section className="prst-investor-summary prst-alert-summary"><article><span>Críticas abiertas</span><strong>1</strong><small>acción inmediata</small></article><article><span>Altas abiertas</span><strong>2</strong><small>requieren atención</small></article><article><span>Revisadas</span><strong>1</strong><small>siguen activas</small></article><article><span>Archivadas</span><strong>2</strong><small>historial personal</small></article></section>
 <Card title="Centro de notificaciones" kicker="SEGUIMIENTO OPERATIVO">
  <div className="prst-notification-tabs"><button className="active">Abiertas</button><button>Revisadas</button><button>Archivadas</button></div>
  <div className="prst-alert-list">
   <article className="prst-operational-alert critical"><div className="prst-alert-icon">!</div><div className="prst-alert-copy"><div><span>Vencimiento</span><b>Crítica</b></div><strong>Inversión vencida</strong><small>José Roberto Hernández · INVEST-20260310-G7H8I9</small></div><div className="prst-notification-actions"><button>Abrir</button><button>Revisada</button><button>Archivar</button></div></article>
   <article className="prst-operational-alert high"><div className="prst-alert-icon">↑</div><div className="prst-alert-copy"><div><span>Contrato</span><b>Alta</b></div><strong>Contrato pendiente de firma</strong><small>María Elena López · CTR-20260815-EF34GH</small></div><div className="prst-notification-actions"><button>Abrir</button><button>Revisada</button><button>Archivar</button></div></article>
  </div>
 </Card>
 </>}


function PreviewSearch({onOpen}){
 const [query,setQuery]=useState('')
 const rows=useMemo(()=>{
  const q=query.trim().toLowerCase()
  if(q.length<2)return []
  const results=[]
  demo.investors.forEach(x=>{if((x.name+' '+x.dui+' '+x.code).toLowerCase().includes(q))results.push({type:'Inversionista',title:x.name,sub:x.code+' · '+x.dui})})
  demo.investments.forEach(x=>{if((x.code+' '+x.name).toLowerCase().includes(q))results.push({type:'Inversión',title:x.code,sub:x.name+' · '+money(x.capital)})})
  demo.contracts.forEach(x=>{if((x.code+' '+x.number+' '+x.investor).toLowerCase().includes(q))results.push({type:'Contrato',title:x.code,sub:x.investor+' · '+x.number})})
  demo.payments.forEach(x=>{if((x.code+' '+x.name+' '+x.investment).toLowerCase().includes(q))results.push({type:'Pago',title:x.code,sub:x.name+' · '+money(x.amount)})})
  demo.documents.forEach(x=>{if((x.code+' '+x.title+' '+x.investor).toLowerCase().includes(q))results.push({type:'Documento',title:x.code,sub:x.investor+' · '+x.title})})
  return results.slice(0,8)
 },[query])
 return <div className="prst-global-search">
  <div className="prst-global-search-input"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nombre, DUI, inversión, contrato, pago o documento"/>{query?<button type="button" onClick={()=>setQuery('')}>×</button>:<span/>}</div>
  {query.trim().length>=2&&<div className="prst-global-search-results"><div className="prst-global-search-head"><b>{rows.length} resultados</b><span>Vista previa</span></div>{rows.length?rows.map((row,i)=><button type="button" key={i} onClick={()=>{onOpen();setQuery('')}}><span className="prst-search-icon">{row.type[0]}</span><span className="prst-search-copy"><b>{row.title}</b><small>{row.sub}</small></span><span className="prst-search-type">{row.type}</span></button>):<div className="prst-global-search-empty">Sin coincidencias.</div>}</div>}
 </div>
}

function Agenda(){return <>
 <section className="prst-investor-summary prst-agenda-summary"><article><span>Vencidos</span><strong>1</strong><small>fechas anteriores a hoy</small></article><article><span>Para hoy</span><strong>2</strong><small>seguimientos sin fecha límite</small></article><article><span>Próximos 7 días</span><strong>3</strong><small>agenda operativa</small></article><article><span>Total activos</span><strong>5</strong><small>eventos derivados del ERP</small></article></section>
 <Card title="Seguimiento diario y semanal" kicker="AGENDA OPERATIVA">
  <div className="prst-agenda-view-tabs"><button>Hoy / vencidos</button><button className="active">7 días</button><button>30 días</button></div>
  <div className="prst-agenda-list">
   <article className="overdue"><div className="prst-agenda-date"><b>10 sep</b><small>Vencido</small></div><div className="prst-agenda-copy"><div><span>Vencimiento</span><b>Crítica</b></div><strong>Vencimiento de inversión</strong><small>José Roberto Hernández · INVEST-20260310-G7H8I9</small></div><button>Abrir</button></article>
   <article className="high"><div className="prst-agenda-date"><b>Hoy</b><small>Seguimiento sin fecha límite</small></div><div className="prst-agenda-copy"><div><span>Contrato</span><b>Alta</b></div><strong>Contrato pendiente de firma</strong><small>María Elena López · CTR-20260815-EF34GH</small></div><button>Abrir</button></article>
   <article className="medium"><div className="prst-agenda-date"><b>Hoy</b><small>Seguimiento sin fecha límite</small></div><div className="prst-agenda-copy"><div><span>Documentación</span><b>Media</b></div><strong>Completar expediente</strong><small>José Roberto Hernández · falta DUI reverso</small></div><button>Abrir</button></article>
  </div>
 </Card>
 </>}

function Profile360(){return <>
 <Card title="Carlos Ernesto Mejía" kicker="PERFIL 360">
  <div className="prst-profile360-actions"><button><b>Estado de cuenta</b><small>Resumen y PDF</small></button><button><b>Contrato</b><small>INVEST-20260901-A1B2C3</small></button><button><b>Registrar pago</b><small>Rendimiento o capital</small></button><button><b>Renovación</b><small>Gestionar vencimiento</small></button><button><b>Documentos</b><small>Expediente privado</small></button></div>
 </Card>
 <section className="prst-investor-summary prst-profile360-summary"><article><span>Capital vigente</span><strong>{money(4000)}</strong><small>1 inversión vigente</small></article><article><span>Rendimientos pagados</span><strong>{money(150)}</strong><small>pagos vigentes</small></article><article><span>Capital devuelto</span><strong>{money(0)}</strong><small>histórico</small></article><article><span>Próximo vencimiento</span><strong>01 sep 2027</strong><small>INVEST-20260901-A1B2C3</small></article></section>
 <section className="prst-grid two">
  <Card title="Expediente del inversionista" kicker="DATOS PERSONALES"><div className="prst-profile-grid"><article><small>Nombre</small><b>Carlos Ernesto Mejía</b><span>DUI 01234567-8</span></article><article><small>Contacto</small><b>7788-1122</b><span>carlos@ejemplo.com</span></article><article><small>Documentación</small><b>Completa</b><span>Rostro + DUI frente/reverso</span></article><article><small>Estado</small><b>Activo</b><span>INV-2026-001284</span></article></div></Card>
  <Card title="Expediente relacionado" kicker="RESUMEN"><div className="prst-profile360-counters"><div><span>Solicitudes</span><strong>1</strong></div><div><span>Contratos</span><strong>1</strong></div><div><span>Beneficiarios</span><strong>2</strong></div><div><span>Documentos</span><strong>2</strong></div><div><span>Pagos</span><strong>1</strong></div><div><span>Renovaciones</span><strong>0</strong></div></div></Card>
 </section>
 <Card title="Capital y vigencias" kicker="INVERSIONES"><Table headers={['Inversión','Capital','Tasa anual','Inicio','Vence','Capital pendiente','Contrato','Estado']} rows={[<tr key="p360"><td><b>INVEST-20260901-A1B2C3</b></td><td>{money(4000)}</td><td>10% anual</td><td>01 sep 2026</td><td>01 sep 2027</td><td><b>{money(4000)}</b></td><td>Firmado</td><td><Status>Activa</Status></td></tr>]}/></Card>
 </>}


function EndToEndDemo(){const cases=[{amount:2000,rate:10,gain:200,name:'Ana Lucía Prueba',end:'Retiro finalizado'},{amount:7500,rate:12,gain:900,name:'Brenda Sofía Ejemplo',end:'Renovación ejecutada'},{amount:15000,rate:15,gain:2250,name:'Carlos Andrés Demostración',end:'No renovación y cierre'}];return <>
 <section className="prst-investor-summary prst-e2e-summary"><article><span>Casos ficticios</span><strong>3</strong><small>10%, 12% y 15% anual</small></article><article><span>Plazo</span><strong>12 meses</strong><small>sin asumir prorrateo</small></article><article><span>Recorrido</span><strong>Completo</strong><small>hasta cierre/renovación</small></article><article><span>Base real</span><strong>No usada</strong><small>prueba sin costo</small></article></section>
 <Card title="Recorrido integral con datos ficticios" kicker="PRUEBA SIN COSTO">
  <div className="prst-e2e-case-grid">{cases.map(row=><article key={row.rate}><span>{row.rate}% anual</span><strong>{row.name}</strong><b>{money(row.amount)} → {money(row.gain)} referencia anual</b><small>Expediente → Solicitud → Aprobación → Fondos → Inversión → Contrato → Pago → Vencimiento → {row.end} → Cierre mensual</small></article>)}</div>
  <div className="prst-note"><strong>Sin Supabase de pago:</strong> estos escenarios son locales y no modifican el proyecto principal.</div>
 </Card>
 </>}

function Readiness(){const rows=[['Listo','ERP funcional'],['Listo','Tasas 10%, 12% y 15% anual'],['Pendiente','Rangos reales por monto'],['Pendiente','Prorrateo para otros plazos'],['Pendiente','Contrato legal definitivo'],['Bloqueado','Base aislada de staging sin costo'],['Pendiente','CI heredado / móvil']];return <>
 <section className="prst-investor-summary prst-readiness-summary"><article><span>Listos</span><strong>2</strong><small>controles cerrados</small></article><article><span>Pendientes</span><strong>4</strong><small>requieren definición</small></article><article><span>Bloqueados</span><strong>1</strong><small>decisión externa</small></article><article><span>Producción</span><strong>No todavía</strong><small>rama protegida</small></article></section>
 <Card title="Checklist de liberación" kicker="CIERRE PARA PRODUCCIÓN"><div className="prst-readiness-list">{rows.map(([status,area])=><article key={area}><span className={'prst-readiness-status '+(status==='Listo'?'ready':status==='Bloqueado'?'blocked':'pending')}>{status}</span><div><strong>{area}</strong><small>{status==='Listo'?'Control cerrado.':'Debe resolverse antes de producción.'}</small></div></article>)}</div><div className="prst-note"><strong>Regla:</strong> mientras haya pendientes o bloqueos, no se considera lista para producción.</div></Card>
 </>}
