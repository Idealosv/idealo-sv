import { useMemo, useState } from 'react'
import './prestaditos-investors.css'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const TABS=['Dashboard','Inversionistas','Solicitudes','Inversiones','Beneficiarios','Rendimientos','Vencimientos','Renovaciones','Tesorería','Documentos','Reportes','Auditoría']

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
  {code:'INVEST-20260901-A1B2C3',name:'Carlos Ernesto Mejía',capital:15000,term:12,granted:'01 sep 2026',maturity:'01 sep 2027',gain:1800,status:'Activa'},
  {code:'INVEST-20260815-D4E5F6',name:'María Elena López',capital:10000,term:6,granted:'15 ago 2026',maturity:'15 feb 2027',gain:720,status:'Activa'},
  {code:'INVEST-20260310-G7H8I9',name:'José Roberto Hernández',capital:12000,term:6,granted:'10 mar 2026',maturity:'10 sep 2026',gain:900,status:'Vencida'},
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
 const capital=useMemo(()=>demo.investments.filter(x=>x.status==='Activa').reduce((s,x)=>s+x.capital,0),[])
 const projected=useMemo(()=>demo.investments.filter(x=>x.status==='Activa').reduce((s,x)=>s+x.gain,0),[])
 const yieldPaid=useMemo(()=>demo.payments.filter(x=>x.type==='Rendimiento').reduce((s,x)=>s+x.amount,0),[])

 return <div className="prst-app">
  <aside className="prst-sidebar">
   <div className="prst-brand"><span className="prst-mark">$</span><div><strong>PRESTADITO$</strong><small>El Préstamo a tu Crecimiento</small></div></div>
   <div className="prst-company"><span>IDEALO SV · VISTA PREVIA</span><strong>Prestadito$ El Salvador</strong><small>ERP de inversionistas</small></div>
   <nav>{TABS.map(name=><button key={name} type="button" className={tab===name?'active':''} onClick={()=>setTab(name)}><strong>{name}</strong><small>{({
    Dashboard:'Resumen ejecutivo',Inversionistas:'Expedientes y documentos',Solicitudes:'Solicitudes de inversión',Inversiones:'Capital y vigencias',Beneficiarios:'Designaciones',Rendimientos:'Pagos al inversionista',Vencimientos:'Fechas críticas',Renovaciones:'Decisiones al vencimiento',Tesorería:'Entradas y salidas',Documentos:'Expediente privado',Reportes:'Indicadores gerenciales',Auditoría:'Trazabilidad'
   })[name]}</small></button>)}</nav>
  </aside>

  <main className="prst-main">
   <header className="prst-topbar"><div><span>IDEALO SV · FINANCIERA / INVERSIONISTAS</span><h1>{tab}</h1><p>Vista previa con datos demostrativos. No modifica información real.</p></div><div className="prst-top-actions"><button type="button" onClick={()=>setTab('Dashboard')}>Inicio</button></div></header>
   <div className="prst-alert success">VISTA PREVIA · Esta pantalla sirve para revisar diseño, orden y funcionamiento visual antes de integrar Prestadito$ a producción.</div>
   <section className="prst-content">
    {tab==='Dashboard'&&<Dashboard capital={capital} projected={projected} yieldPaid={yieldPaid}/>}
    {tab==='Inversionistas'&&<Investors/>}
    {tab==='Solicitudes'&&<Applications/>}
    {tab==='Inversiones'&&<Investments/>}
    {tab==='Beneficiarios'&&<Beneficiaries/>}
    {tab==='Rendimientos'&&<Payments/>}
    {tab==='Vencimientos'&&<Maturities/>}
    {tab==='Renovaciones'&&<Renewals/>}
    {tab==='Tesorería'&&<Treasury capital={capital} yieldPaid={yieldPaid}/>} 
    {tab==='Documentos'&&<Documents/>}
    {tab==='Reportes'&&<Reports/>}
    {tab==='Auditoría'&&<Audit/>}
   </section>
  </main>
 </div>
}

function Dashboard({capital,projected,yieldPaid}){
 return <>
  <section className="prst-metrics">
   <Metric label="Inversionistas" value="3" hint="expedientes registrados"/>
   <Metric label="Capital activo" value={money(capital)} hint="2 inversiones activas" tone="money"/>
   <Metric label="Solicitudes pendientes" value="2" hint="por revisar o formalizar" tone="warn"/>
   <Metric label="Ganancia proyectada" value={money(projected)} hint="proyección demostrativa" tone="money"/>
   <Metric label="Rendimientos pagados" value={money(yieldPaid)} hint="pagos registrados"/>
   <Metric label="Próximo vencimiento" value="15 feb 2027" hint="seguimiento automático"/>
  </section>
  <section className="prst-grid two">
   <Card title="Flujo principal" kicker="OPERACIÓN DE INVERSIONISTAS">
    <div className="prst-flow">
     {[
      ['1','Registrar inversionista','Datos, rostro y DUI'],
      ['2','Recibir solicitud','Monto, plazo y lugar de pago'],
      ['3','Aprobar y formalizar','Contrato, capital y vencimiento'],
      ['4','Registrar pagos','Rendimientos y devolución de capital'],
      ['5','Gestionar vencimiento','Renovar o retirar'],
     ].map(([n,t,s])=><button key={n} type="button"><b>{n}</b><span><strong>{t}</strong><small>{s}</small></span></button>)}
    </div>
   </Card>
   <Card title="Solicitudes recientes" kicker="ACTIVIDAD">
    <div className="prst-list">{demo.applications.map(x=><article key={x.code}><div><b>{x.name}</b><small>{money(x.amount)} · {x.term} meses</small></div><Status tone={x.status==='Aprobada'?'active':x.status==='Pendiente'?'pending':'review'}>{x.status}</Status></article>)}</div>
   </Card>
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
 <section className="prst-investor-summary"><article><span>Inversiones activas</span><strong>2</strong><small>vigentes</small></article><article><span>Capital activo</span><strong>{money(25000)}</strong><small>formalizado</small></article><article><span>Ganancia proyectada</span><strong>{money(2520)}</strong><small>demostrativa</small></article><article><span>Vencidas</span><strong>1</strong><small>requiere gestión</small></article></section>
 <Card title="Portafolio de inversiones" kicker="INVERSIONES">
  <Table headers={['Inversión','Inversionista','Capital','Plazo','Otorgada','Vence','Ganancia','Estado']} rows={demo.investments.map(x=><tr key={x.code}><td><b>{x.code}</b></td><td>{x.name}</td><td><b>{money(x.capital)}</b></td><td>{x.term} meses</td><td>{x.granted}</td><td>{x.maturity}</td><td>{money(x.gain)}</td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status}</Status></td></tr>)}/>
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
 <section className="prst-investor-summary"><article><span>Capital recibido</span><strong>{money(37000)}</strong><small>formalizado</small></article><article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong><small>salidas vigentes</small></article><article><span>Capital devuelto</span><strong>{money(12000)}</strong><small>devoluciones</small></article><article><span>Posición neta</span><strong>{money(24730)}</strong><small>entradas menos salidas</small></article></section>
 <Card title="Libro consolidado de tesorería" kicker="MOVIMIENTOS">
  <Table headers={['Fecha','Movimiento','Inversionista','Inversión','Entrada','Salida','Estado']} rows={[
   <tr key="t1"><td>01 sep 2026</td><td>Entrada de capital</td><td>Carlos Ernesto Mejía</td><td>INVEST-20260901-A1B2C3</td><td><b className="prst-money-in">{money(15000)}</b></td><td>—</td><td><Status>Vigente</Status></td></tr>,
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
  <Metric label="Capital activo" value={money(25000)} hint="inversiones vigentes" tone="money"/>
  <Metric label="Ganancia proyectada" value={money(2520)} hint="según datos formalizados" tone="money"/>
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
