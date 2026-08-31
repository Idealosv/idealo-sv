import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const isLegalRoute = () => window.location.pathname === '/legal' || window.location.pathname.startsWith('/legal/')

export default function LegalAppHost() {
  const [active, setActive] = useState(isLegalRoute())
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [cases, setCases] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('dashboard')
  const [feedback, setFeedback] = useState('')
  const [form, setForm] = useState({ title: '', practice_area: 'Civil', priority: 'NORMAL', description: '' })

  useEffect(() => {
    const onPop = () => setActive(isLegalRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!active || !supabase) return
    let mounted = true
    setLoading(true)
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const nextSession = data.session || null
      setSession(nextSession)
      if (!nextSession) { setLoading(false); return }
      const { data: companies, error } = await supabase.rpc('get_my_companies')
      if (!mounted) return
      if (error || !companies?.length) { setFeedback('No se encontró una empresa disponible para este usuario.'); setLoading(false); return }
      const selected = companies[0]
      setCompany(selected)
      await loadLegalData(selected.id, mounted)
      setLoading(false)
    })
    return () => { mounted = false }
  }, [active])

  const loadLegalData = async (companyId, mounted = true) => {
    const [{ data: caseRows, error: caseError }, { data: deadlineRows, error: deadlineError }] = await Promise.all([
      supabase.from('legal_cases').select('*').eq('company_id', companyId).order('opened_at', { ascending: false }).limit(100),
      supabase.from('legal_deadlines').select('*,legal_cases(case_number,title)').eq('company_id', companyId).neq('status', 'CANCELLED').order('due_at', { ascending: true }).limit(100),
    ])
    if (!mounted) return
    if (caseError || deadlineError) setFeedback('Falta aplicar la migración del módulo Jurídico o no hay acceso suficiente.')
    setCases(caseRows || [])
    setDeadlines(deadlineRows || [])
  }

  const metrics = useMemo(() => {
    const now = Date.now()
    const sevenDays = now + 7 * 86400000
    return {
      open: cases.filter((item) => ['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(item.status)).length,
      urgent: cases.filter((item) => item.priority === 'URGENT' && item.status !== 'CLOSED').length,
      dueSoon: deadlines.filter((item) => item.status === 'PENDING' && new Date(item.due_at).getTime() <= sevenDays).length,
      closed: cases.filter((item) => item.status === 'CLOSED').length,
    }
  }, [cases, deadlines])

  const createCase = async (event) => {
    event.preventDefault()
    if (!company) return
    setFeedback('')
    const nextNumber = `EXP-${new Date().getFullYear()}-${String(cases.length + 1).padStart(4, '0')}`
    const { error } = await supabase.from('legal_cases').insert({
      company_id: company.id,
      case_number: nextNumber,
      title: form.title.trim(),
      practice_area: form.practice_area,
      priority: form.priority,
      description: form.description.trim(),
      responsible_user_id: session?.user?.id || null,
      status: 'OPEN',
    })
    if (error) { setFeedback(error.message); return }
    setForm({ title: '', practice_area: 'Civil', priority: 'NORMAL', description: '' })
    setFeedback('Expediente creado correctamente.')
    await loadLegalData(company.id)
  }

  const addDeadline = async (caseId) => {
    const title = window.prompt('Título del plazo o audiencia')
    if (!title) return
    const due = window.prompt('Fecha y hora (AAAA-MM-DD HH:MM)')
    if (!due) return
    const dueAt = new Date(due.replace(' ', 'T'))
    if (Number.isNaN(dueAt.getTime())) { setFeedback('Fecha inválida.'); return }
    const { error } = await supabase.from('legal_deadlines').insert({ company_id: company.id, case_id: caseId, title, due_at: dueAt.toISOString(), assigned_user_id: session?.user?.id || null })
    setFeedback(error ? error.message : 'Plazo registrado correctamente.')
    if (!error) await loadLegalData(company.id)
  }

  if (!active) return null

  if (loading) return <div className="legal-overlay"><div className="legal-loading">Preparando IDEALO Jurídico…</div></div>
  if (!session) return <div className="legal-overlay"><div className="legal-login"><h1>IDEALO Jurídico</h1><p>Iniciá sesión primero en IDEALO SV para entrar al sistema jurídico.</p><a href="/">Ir al acceso</a></div></div>

  return (
    <div className="legal-overlay">
      <aside className="legal-sidebar">
        <div className="legal-brand"><strong>IDEALO</strong><span>JURÍDICO</span></div>
        <div className="legal-company">{company?.name}</div>
        <nav>
          {[['dashboard','Dashboard'],['cases','Expedientes'],['deadlines','Agenda y plazos'],['clients','Clientes'],['documents','Documentos']].map(([key,label]) => (
            <button key={key} className={section===key?'active':''} onClick={()=>setSection(key)}>{label}</button>
          ))}
        </nav>
        <a className="legal-back" href="/">← Volver a IDEALO SV</a>
      </aside>
      <main className="legal-main">
        <header><div><small>SISTEMA JURÍDICO</small><h1>{sectionTitle(section)}</h1></div><div className="legal-user">{session.user.email}</div></header>
        {feedback && <div className="legal-feedback">{feedback}</div>}
        {section === 'dashboard' && <Dashboard metrics={metrics} cases={cases} deadlines={deadlines} />}
        {section === 'cases' && <Cases cases={cases} form={form} setForm={setForm} createCase={createCase} addDeadline={addDeadline} />}
        {section === 'deadlines' && <Deadlines deadlines={deadlines} />}
        {section === 'clients' && <Placeholder title="Clientes jurídicos" text="Esta sección reutilizará el Cliente 360 del núcleo SaaS y lo ampliará con relación a expedientes." />}
        {section === 'documents' && <Placeholder title="Documentos jurídicos" text="Preparado para escritos, contratos, poderes, anexos y control de versiones por expediente." />}
      </main>
    </div>
  )
}

function Dashboard({ metrics, cases, deadlines }) {
  return <>
    <section className="legal-metrics">
      <Metric label="Expedientes activos" value={metrics.open} />
      <Metric label="Urgentes" value={metrics.urgent} />
      <Metric label="Plazos próximos" value={metrics.dueSoon} />
      <Metric label="Cerrados" value={metrics.closed} />
    </section>
    <section className="legal-grid">
      <article className="legal-card"><h2>Expedientes recientes</h2>{cases.slice(0,6).map(item=><div className="legal-row" key={item.id}><div><strong>{item.case_number}</strong><span>{item.title}</span></div><em>{statusLabel(item.status)}</em></div>)}{!cases.length&&<p className="legal-empty">Aún no hay expedientes.</p>}</article>
      <article className="legal-card"><h2>Próximos plazos</h2>{deadlines.slice(0,6).map(item=><div className="legal-row" key={item.id}><div><strong>{formatDate(item.due_at)}</strong><span>{item.title}</span></div><em>{item.legal_cases?.case_number||'Expediente'}</em></div>)}{!deadlines.length&&<p className="legal-empty">No hay plazos pendientes.</p>}</article>
    </section>
  </>
}

function Cases({ cases, form, setForm, createCase, addDeadline }) {
  const update=(e)=>setForm(current=>({...current,[e.target.name]:e.target.value}))
  return <section className="legal-grid legal-cases-layout">
    <form className="legal-card legal-form" onSubmit={createCase}><h2>Nuevo expediente</h2><label>Nombre del asunto<input name="title" value={form.title} onChange={update} required /></label><label>Área<select name="practice_area" value={form.practice_area} onChange={update}><option>Civil</option><option>Mercantil</option><option>Laboral</option><option>Familia</option><option>Penal</option><option>Administrativo</option><option>Notarial</option><option>Otro</option></select></label><label>Prioridad<select name="priority" value={form.priority} onChange={update}><option value="LOW">Baja</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label><label>Descripción<textarea name="description" value={form.description} onChange={update} rows="5" /></label><button type="submit">Crear expediente</button></form>
    <article className="legal-card"><h2>Expedientes</h2>{cases.map(item=><div className="legal-case" key={item.id}><div className="legal-case-top"><div><strong>{item.case_number}</strong><h3>{item.title}</h3></div><span className={`legal-priority ${item.priority.toLowerCase()}`}>{item.priority}</span></div><p>{item.practice_area} · {statusLabel(item.status)}</p><div className="legal-case-actions"><button onClick={()=>addDeadline(item.id)}>+ Agregar plazo</button></div></div>)}{!cases.length&&<p className="legal-empty">Creá el primer expediente del bufete.</p>}</article>
  </section>
}

function Deadlines({ deadlines }) { return <article className="legal-card"><h2>Agenda y plazos</h2>{deadlines.map(item=><div className="legal-row" key={item.id}><div><strong>{formatDate(item.due_at)}</strong><span>{item.title} · {item.legal_cases?.title||''}</span></div><em>{item.status}</em></div>)}{!deadlines.length&&<p className="legal-empty">Sin vencimientos pendientes.</p>}</article> }
function Placeholder({title,text}) { return <article className="legal-card legal-placeholder"><h2>{title}</h2><p>{text}</p></article> }
function Metric({label,value}) { return <article><span>{label}</span><strong>{value}</strong></article> }
function sectionTitle(value){return({dashboard:'Dashboard',cases:'Expedientes',deadlines:'Agenda y plazos',clients:'Clientes',documents:'Documentos'}[value]||'IDEALO Jurídico')}
function statusLabel(value){return({OPEN:'Abierto',IN_PROGRESS:'En proceso',ON_HOLD:'En espera',CLOSED:'Cerrado',ARCHIVED:'Archivado'}[value]||value)}
function formatDate(value){try{return new Intl.DateTimeFormat('es-SV',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return value}}
