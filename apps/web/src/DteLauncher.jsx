import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } })
  : null

const initialForm = {
  description: 'Servicio publicitario de prueba',
  quantity: '1',
  unitPrice: '1.13',
  totalLetras: 'UNO 13/100 DÓLARES',
}

export default function DteLauncher() {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [signingId, setSigningId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) {
      setCompany(null)
      return
    }
    supabase.rpc('get_my_companies').then(({ data }) => {
      setCompany(data?.[0] || null)
    })
  }, [session])

  const loadDrafts = async () => {
    if (!company || !supabase) return
    const { data, error } = await supabase
      .from('dte_documents')
      .select('id, control_number, generation_code, status, environment, created_at, updated_at, dte_payload')
      .eq('company_id', company.id)
      .eq('dte_type', '01')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) setMessage(error.message)
    else setDrafts(data || [])
  }

  useEffect(() => {
    if (open && company) loadDrafts()
  }, [open, company])

  const total = useMemo(() => {
    const quantity = Number(form.quantity || 0)
    const price = Number(form.unitPrice || 0)
    return Number.isFinite(quantity * price) ? (quantity * price).toFixed(2) : '0.00'
  }, [form.quantity, form.unitPrice])

  const createDraft = async (event) => {
    event.preventDefault()
    if (!session || !company) return
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          companyId: company.id,
          description: form.description,
          quantity: Number(form.quantity),
          unitPrice: Number(form.unitPrice),
          totalLetras: form.totalLetras,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'No se pudo crear el borrador DTE.')
      setMessage(`Borrador creado: ${payload.control_number}. No fue transmitido a Hacienda.`)
      await loadDrafts()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const signDraft = async (draft) => {
    if (!session || draft.status !== 'DRAFT') return
    setSigningId(draft.id)
    setMessage('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/sign-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ documentId: draft.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'No se pudo firmar el DTE de prueba.')
      setMessage(`DTE firmado correctamente: ${payload.control_number}. Estado SIGNED. No fue transmitido a Hacienda.`)
      await loadDrafts()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSigningId('')
    }
  }

  if (!session || !company) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={styles.launcher}>
        DTE
      </button>
      {open && (
        <div style={styles.backdrop} role="presentation" onMouseDown={() => setOpen(false)}>
          <section style={styles.panel} role="dialog" aria-modal="true" aria-label="Facturación DTE" onMouseDown={(event) => event.stopPropagation()}>
            <header style={styles.header}>
              <div>
                <small style={styles.kicker}>FACTURACIÓN ELECTRÓNICA</small>
                <h2 style={styles.title}>DTE-01 · ambiente de prueba</h2>
                <p style={styles.muted}>Crea y firma documentos de prueba. La transmisión a Hacienda permanece bloqueada.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={styles.close}>×</button>
            </header>

            <div style={styles.alert}>
              <strong>Seguridad activa:</strong> ambiente 00, sin transmisión a Hacienda. M001/P001 se usan solo como códigos temporales de prueba y no se guardan en la empresa.
            </div>

            <form onSubmit={createDraft} style={styles.form}>
              <label style={styles.field}>
                <span>Descripción</span>
                <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required style={styles.input} />
              </label>
              <div style={styles.row}>
                <label style={styles.field}>
                  <span>Cantidad</span>
                  <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required style={styles.input} />
                </label>
                <label style={styles.field}>
                  <span>Precio unitario</span>
                  <input type="number" min="0.01" step="0.01" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} required style={styles.input} />
                </label>
              </div>
              <label style={styles.field}>
                <span>Total en letras</span>
                <input value={form.totalLetras} onChange={(event) => setForm({ ...form, totalLetras: event.target.value })} required style={styles.input} />
              </label>
              <div style={styles.total}>Total calculado: <strong>${total}</strong></div>
              <button type="submit" disabled={loading} style={styles.primary}>
                {loading ? 'Creando borrador…' : 'Crear DTE-01 de prueba'}
              </button>
            </form>

            {message && <p style={styles.message}>{message}</p>}

            <div style={styles.sectionHeader}>
              <h3 style={{ margin: 0 }}>Documentos recientes</h3>
              <button type="button" onClick={loadDrafts} style={styles.secondary}>Actualizar</button>
            </div>
            <div style={styles.list}>
              {drafts.length === 0 ? (
                <p style={styles.muted}>Todavía no hay documentos visibles.</p>
              ) : drafts.map((draft) => (
                <article key={draft.id} style={styles.card}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={styles.controlNumber}>{draft.control_number}</strong>
                    <small style={styles.block}>{new Date(draft.created_at).toLocaleString('es-SV')}</small>
                    {draft.status === 'DRAFT' && (
                      <button type="button" onClick={() => signDraft(draft)} disabled={Boolean(signingId)} style={styles.signButton}>
                        {signingId === draft.id ? 'Firmando…' : 'Firmar prueba'}
                      </button>
                    )}
                    {draft.status === 'SIGNED' && <small style={styles.signedNote}>✓ Firma JWS guardada</small>}
                  </div>
                  <div style={styles.tags}>
                    <span style={styles.tag}>{draft.environment}</span>
                    <span style={draft.status === 'SIGNED' ? styles.signedTag : styles.tag}>{draft.status}</span>
                  </div>
                </article>
              ))}
            </div>

            <footer style={styles.footer}>
              <strong>Firma de prueba habilitada.</strong> La firma cambia el documento de DRAFT a SIGNED y guarda el JWS. Este panel no contiene ninguna acción para transmitir a Hacienda.
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

const styles = {
  launcher: { position: 'fixed', right: 24, bottom: 24, zIndex: 70, width: 58, height: 58, borderRadius: 18, border: 0, background: '#111827', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 14px 35px rgba(15,23,42,.25)' },
  backdrop: { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.48)', display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 'min(620px, 100%)', height: '100%', overflowY: 'auto', background: '#f8fafc', padding: 24, boxSizing: 'border-box', boxShadow: '-20px 0 60px rgba(15,23,42,.18)' },
  header: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { fontWeight: 800, letterSpacing: '.08em', color: '#64748b' },
  title: { margin: '6px 0 6px', fontSize: 26 },
  muted: { color: '#64748b', margin: 0 },
  close: { border: 0, background: 'transparent', fontSize: 32, cursor: 'pointer', lineHeight: 1 },
  alert: { marginTop: 20, padding: 14, borderRadius: 14, background: '#fef3c7', color: '#78350f', lineHeight: 1.45 },
  form: { marginTop: 20, padding: 18, borderRadius: 18, background: 'white', display: 'grid', gap: 14, boxShadow: '0 8px 24px rgba(15,23,42,.06)' },
  field: { display: 'grid', gap: 7, fontWeight: 700, color: '#334155' },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', font: 'inherit', background: 'white' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  total: { padding: 12, borderRadius: 12, background: '#f1f5f9' },
  primary: { border: 0, borderRadius: 12, padding: '12px 16px', background: '#111827', color: 'white', fontWeight: 800, cursor: 'pointer' },
  secondary: { border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 12px', background: 'white', fontWeight: 700, cursor: 'pointer' },
  signButton: { marginTop: 10, border: 0, borderRadius: 9, padding: '8px 11px', background: '#0f766e', color: 'white', fontWeight: 800, cursor: 'pointer' },
  message: { padding: 12, borderRadius: 12, background: '#e0f2fe', color: '#0c4a6e' },
  sectionHeader: { marginTop: 24, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  list: { display: 'grid', gap: 10 },
  card: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: 14, borderRadius: 14, background: 'white', border: '1px solid #e2e8f0' },
  controlNumber: { overflowWrap: 'anywhere' },
  block: { display: 'block', marginTop: 5, color: '#64748b' },
  signedNote: { display: 'block', marginTop: 10, color: '#047857', fontWeight: 800 },
  tags: { display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start' },
  tag: { borderRadius: 999, padding: '5px 8px', background: '#e2e8f0', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' },
  signedTag: { borderRadius: 999, padding: '5px 8px', background: '#d1fae5', color: '#065f46', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' },
  footer: { marginTop: 20, paddingTop: 18, borderTop: '1px solid #e2e8f0', color: '#475569', lineHeight: 1.5 },
}
