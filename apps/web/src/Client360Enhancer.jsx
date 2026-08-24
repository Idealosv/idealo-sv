import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase as s } from './lib/supabase.js'
import Client360CrudPanel from './Client360CrudPanel.jsx'

const usd = n => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(Number(n || 0))
const days = d => d ? Math.floor((Date.now() - new Date(d)) / 86400000) : null
const pct = n => `${Number(n || 0).toFixed(1)}%`
const actionLabel = value => ({
  COBRAR_SALDO_VENCIDO: 'Cobrar saldo vencido', DAR_SEGUIMIENTO_HOY: 'Dar seguimiento hoy', SEGUIR_COTIZACION: 'Mover cotización a cierre',
  REACTIVAR_CLIENTE: 'Reactivar cliente', FIDELIZAR_Y_PEDIR_REFERIDOS: 'Fidelizar y pedir referidos', GENERAR_PRIMERA_VENTA: 'Convertir primera venta', PROPONER_RECOMPRA: 'Proponer recompra'
}[value] || 'Mantener seguimiento')

export default function Client360Enhancer() {
  const [show, setShow] = useState(false)
  const [company, setCompany] = useState(null)
  const [clients, setClients] = useState([])
  const [selected, setSelected] = useState('')
  const [data, setData] = useState({})
  const [q, setQ] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const sync = value => setShow((typeof value === 'string' ? value : document.querySelector('.erp-header h1')?.textContent?.trim()) === 'Clientes')
    sync()
    const onModule = event => sync(event.detail)
    window.addEventListener('idealo-module-change', onModule)
    return () => window.removeEventListener('idealo-module-change', onModule)
  }, [])

  useEffect(() => {
    if (!show) return
    ;(async () => {
      const { data: companies } = await s.rpc('get_my_companies')
      const id = companies?.[0]?.id
      if (!id) return
      setCompany(id)
      const { data: rows } = await s.from('clients').select('*').eq('company_id', id).order('name')
      setClients(rows || [])
    })()
  }, [show, refresh])

  useEffect(() => {
    if (!selected || !company) return
    ;(async () => {
      const specs = [
        ['quotes', 'id,number,status,total,created_at'],
        ['work_orders', 'id,number,title,status,total,due_at,created_at'],
        ['deliveries', 'id,status,scheduled_at,received_at'],
        ['accounts_receivable', 'id,amount_total,amount_paid,due_date,status'],
        ['customer_payments', 'id,amount,paid_at,payment_method'],
        ['dte_documents', 'id,dte_type,status,generation_code,mh_receipt_seal,created_at'],
        ['quality_incidents', 'id,status,material_cost,labor_cost,outsourced_cost,other_cost,created_at'],
        ['client_contacts', 'id,name,position,email,phone,whatsapp,is_primary,notes,created_at,updated_at'],
        ['client_addresses', 'id,address_type,label,department,municipality,address,is_primary,latitude,longitude,created_at,updated_at'],
        ['client_interactions', 'id,interaction_type,channel,subject,details,occurred_at,next_follow_up_at,outcome,created_at'],
        ['client_credit_profiles', 'client_id,credit_enabled,credit_limit,credit_days,risk_level,blocked,blocked_reason,last_review_at,updated_at'],
        ['client_audit_log', 'id,action,field_name,created_at'],
        ['client_commercial_intelligence', 'client_id,commercial_score,commercial_segment,lifetime_sales,avg_ticket,estimated_profit,estimated_margin_pct,conversion_rate,order_count,quote_count,outstanding_balance,overdue_balance,overdue_count,avg_payment_delay_days,avg_days_between_orders,quality_incident_count,last_order_at,next_follow_up_at,next_best_action,recommendation']
      ]
      const out = {}
      await Promise.all(specs.map(async ([t, cols]) => {
        const r = await s.from(t).select(cols).eq('company_id', company).eq('client_id', selected).limit(100)
        out[t] = r.error ? [] : (r.data || [])
      }))
      const dup = await s.rpc('client_duplicate_candidates', { p_company_id: company, p_client_id: selected })
      out.duplicates = dup.error ? [] : (dup.data || [])
      setData(out)
    })()
  }, [selected, company, refresh])

  const c = clients.find(x => x.id === selected)
  const intel = data.client_commercial_intelligence?.[0] || null
  const filtered = clients.filter(x => [x.name, x.trade_name, x.tax_id, x.nrc, x.phone, x.email, x.whatsapp].join(' ').toLowerCase().includes(q.toLowerCase()))
  const k = useMemo(() => {
    if (!c) return {}
    const qs = data.quotes || [], os = data.work_orders || [], ar = data.accounts_receivable || [], ps = data.customer_payments || [], qi = data.quality_incidents || []
    const sales = os.reduce((a, x) => a + Number(x.total || 0), 0)
    const debt = ar.reduce((a, x) => a + Math.max(0, Number(x.amount_total || 0) - Number(x.amount_paid || 0)), 0)
    const paid = ps.reduce((a, x) => a + Number(x.amount || 0), 0)
    const approved = qs.filter(x => ['APPROVED', 'CONVERTED'].includes(x.status)).length
    return { sales, debt, paid, conversion: qs.length ? Math.round(approved / qs.length * 100) : 0, late: ar.filter(x => Number(x.amount_total || 0) > Number(x.amount_paid || 0) && x.due_date && new Date(x.due_date) < new Date()).length, quality: qi.length, last: os.map(x => x.created_at).filter(Boolean).sort().at(-1) }
  }, [c, data])

  if (!show) return null
  return createPortal(<section className="client360">
    <header><div><small>EXPEDIENTE 360°</small><strong>Control profesional del cliente</strong></div><input placeholder="Buscar nombre, NIT, NRC, teléfono, correo…" value={q} onChange={e => setQ(e.target.value)} /><select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Abrir ficha 360…</option>{filtered.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></header>
    {c && <><div className="c360hero"><div><h2>{c.name}</h2><p>{c.trade_name || 'Sin nombre comercial'} · {c.client_code || 'Sin código'}</p></div><div className="c360badges"><span>{c.status || 'active'}</span><span>{c.preferred_dte_type === '03' ? 'CCF DTE-03' : 'Factura DTE-01'}</span>{intel && <><span>{intel.commercial_segment}</span><span>SCORE {intel.commercial_score}/100</span></>}<span>{c.blocked_for_debt ? 'BLOQUEADO POR MORA' : 'CRÉDITO HABILITADO'}</span></div></div>
      <div className="c360metrics"><b>{usd(k.sales)}<small>Ventas/OT</small></b><b>{usd(k.paid)}<small>Cobrado</small></b><b>{usd(k.debt)}<small>Por cobrar</small></b><b>{k.conversion}%<small>Conversión</small></b><b>{k.late}<small>Vencidas</small></b><b>{days(k.last) ?? '—'}<small>Días última OT</small></b></div>
      {intel && <section className="c360intel"><div className="c360score"><strong>{intel.commercial_score}</strong><small>Score comercial / 100</small><span>{intel.commercial_segment}</span></div><div className="c360intelmetrics"><b>{usd(intel.lifetime_sales)}<small>Valor de vida</small></b><b>{usd(intel.avg_ticket)}<small>Ticket promedio</small></b><b>{usd(intel.estimated_profit)}<small>Utilidad estimada</small></b><b>{pct(intel.estimated_margin_pct)}<small>Margen estimado</small></b><b>{intel.avg_days_between_orders == null ? '—' : `${Math.round(Number(intel.avg_days_between_orders))} días`}<small>Frecuencia compra</small></b><b>{Math.round(Number(intel.avg_payment_delay_days || 0))} días<small>Retraso promedio pago</small></b></div><div className="c360recommend"><small>PRÓXIMA MEJOR ACCIÓN</small><strong>{actionLabel(intel.next_best_action)}</strong><p>{intel.recommendation}</p></div></section>}
      <div className="c360grid">
        <Card t="Datos fiscales / DTE"><p><b>NIT:</b> {c.tax_id || '—'} · <b>NRC:</b> {c.nrc || '—'}</p><p>{c.activity_code || '—'} · {c.business_activity || 'Sin actividad'}</p><p>{c.department || ''} {c.municipality || ''} · {c.address || 'Sin dirección'}</p><Dte client={c} /></Card>
        <Card t="Crédito y cobranza"><p>Límite: {usd(data.client_credit_profiles?.[0]?.credit_limit ?? c.credit_limit)} · Plazo: {data.client_credit_profiles?.[0]?.credit_days ?? c.credit_days ?? 0} días</p><p>Saldo: <b>{usd(intel?.outstanding_balance ?? k.debt)}</b> · Vencido: {usd(intel?.overdue_balance || 0)}</p><p>Riesgo: {data.client_credit_profiles?.[0]?.risk_level || 'normal'}</p></Card>
        <Card t="Contactos"><p>{(data.client_contacts || []).length} contacto(s)</p>{(data.client_contacts || []).slice(0, 3).map(x => <p key={x.id}><b>{x.name}</b>{x.position ? ` · ${x.position}` : ''}<br />{x.whatsapp || x.phone || x.email || 'Sin canal'}</p>)}</Card>
        <Card t="Direcciones"><p>{(data.client_addresses || []).length} ubicación(es)</p>{(data.client_addresses || []).slice(0, 3).map(x => <p key={x.id}><b>{x.label || x.address_type}</b><br />{x.address}</p>)}</Card>
        <Card t="Seguimiento comercial"><p>{(data.client_interactions || []).length} interacción(es)</p>{(data.client_interactions || []).slice(0, 3).map(x => <p key={x.id}><b>{x.subject || x.interaction_type}</b><br />{new Date(x.occurred_at).toLocaleDateString('es-SV')} {x.channel ? `· ${x.channel}` : ''}</p>)}</Card>
        <Card t="Integración total"><p>{(data.quotes || []).length} cotizaciones · {(data.work_orders || []).length} órdenes</p><p>{(data.deliveries || []).length} entregas · {(data.dte_documents || []).length} DTE</p><p>{(data.accounts_receivable || []).length} cuentas por cobrar · {(data.customer_payments || []).length} cobros</p></Card>
        <Card t="Duplicados y auditoría"><p>{data.duplicates?.length ? `⚠ ${data.duplicates.length} posible(s) duplicado(s)` : '✓ Sin duplicados fuertes detectados'}</p>{(data.duplicates || []).slice(0, 2).map(x => <p key={x.client_id}>{x.name} · {x.reason} · {x.score}%</p>)}<p>{(data.client_audit_log || []).length} evento(s) de auditoría</p></Card>
        <Card t="Alertas inteligentes"><p>{intel?.overdue_balance > 0 ? `⚠ Mora: ${usd(intel.overdue_balance)}` : '✓ Sin deuda vencida'}</p><p>{intel?.quality_incident_count ? `⚠ ${intel.quality_incident_count} incidencia(s) de calidad` : '✓ Sin incidencias registradas'}</p><p>{intel?.last_order_at && days(intel.last_order_at) > 90 ? `⚠ ${days(intel.last_order_at)} días sin comprar` : '✓ Relación comercial activa'}</p></Card>
      </div>
      <Client360CrudPanel supabase={s} companyId={company} client={c} data={data} onChanged={() => setRefresh(value => value + 1)} />
    </>}
  </section>, document.querySelector('.erp-content') || document.body)
}

function Card({ t, children }) { return <article className="c360card"><h3>{t}</h3>{children}</article> }
function Dte({ client: c }) {
  const required = c.preferred_dte_type === '03'
    ? [['nombre', c.name], ['NIT', c.tax_id], ['NRC', c.nrc], ['actividad', c.activity_code], ['descripción actividad', c.business_activity], ['departamento', c.department_code], ['municipio', c.municipality_code], ['dirección fiscal', c.address]]
    : [['nombre', c.name]]
  const missing = required.filter(([, v]) => !String(v || '').trim()).map(([k]) => k)
  return <div className={missing.length ? 'c360warn' : 'c360ready'}>{missing.length ? `⚠ Faltan para ${c.preferred_dte_type === '03' ? 'CCF DTE-03' : 'DTE-01'}: ${missing.join(', ')}` : '✓ Datos mínimos del tipo DTE completos'}{c.preferred_dte_type !== '03' && <small> DUI, correo, teléfono y dirección no se exigen indiscriminadamente al consumidor final.</small>}</div>
}
