import { useEffect, useMemo, useState } from 'react'

const TYPES = [
  ['04', 'Nota de Remisión'], ['05', 'Nota de Crédito'], ['06', 'Nota de Débito'],
  ['07', 'Comprobante de Retención'], ['08', 'Comprobante de Liquidación'],
  ['09', 'Documento Contable de Liquidación'], ['11', 'Factura de Exportación'],
  ['14', 'Factura de Sujeto Excluido'], ['15', 'Comprobante de Donación'],
]
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const box = { padding: 15, background: '#fff', border: '1px solid #d6dce5', borderRadius: 12 }
const field = { width: '100%', padding: 10, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, background: 'white', color: '#0f172a', font: 'inherit' }
const button = { background: '#0f172a', color: '#fff', fontWeight: 700, border: 0, borderRadius: 9, padding: '10px 14px', cursor: 'pointer' }
const help = { display: 'block', color: '#64748b', fontSize: 12, marginTop: 4 }
const labels = {
  identificacion: 'Identificación (generada y protegida por ERP)',
  documentoRelacionado: 'Documento anterior relacionado',
  emisor: 'Empresa emisora (desde expediente fiscal)',
  receptor: 'Cliente / receptor',
  cuerpoDocumento: 'Detalle real de bienes, servicios y tributos',
  resumen: 'Resumen fiscal y totales',
  extension: 'Extensión de la operación',
  apendice: 'Apéndice',
  ventaTercero: 'Venta a cuenta de terceros',
  compraTercero: 'Compra a terceros',
  otrosDocumentos: 'Otros documentos',
}
const relationTypes = ['04','05','06']

async function call(path, token, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || payload.error || 'HTTP ' + response.status)
  return payload
}

export default function DteCertificationEditor({ company, supabase, session, initialType = '06' }) {
  const [type, setType] = useState(initialType)
  const [template, setTemplate] = useState(null)
  const [document, setDocument] = useState(null)
  const [sectionText, setSectionText] = useState({})
  const [invalidFields, setInvalidFields] = useState({})
  const [related, setRelated] = useState([])
  const [relatedId, setRelatedId] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [validationOk, setValidationOk] = useState(false)
  const [saved, setSaved] = useState(null)
  const [history, setHistory] = useState([])

  const token = session?.access_token
  const reload = async () => {
    if (!supabase || !company?.id) return
    const { data, error: sourceError } = await supabase.from('dte_documents')
      .select('id,control_number,generation_code,dte_type,environment,status,dte_payload,mh_response,created_at')
      .eq('company_id', company.id).eq('environment', 'test')
      .order('created_at', { ascending: false }).limit(100)
    if (sourceError) throw sourceError
    setRelated((data || []).filter(row => ['PROCESSED','INVALIDATED'].includes(row.status)))
    setHistory((data || []).filter(row => TYPES.some(([t]) => t === row.dte_type)))
  }
  useEffect(() => { reload().catch(e => setError(e.message)) }, [company?.id, supabase])

  const makeText = doc => Object.fromEntries(Object.entries(doc || {}).map(([key, val]) => [key, JSON.stringify(val, null, 2)]))
  useEffect(() => {
    if (!token || !company?.id) return
    let cancelled = false
    setBusy('template')
    setError('')
    setMessage('')
    setSaved(null)
    setRelatedId('')
    call('/api/dte/certification/template?companyId=' + encodeURIComponent(company.id) + '&type=' + encodeURIComponent(type), token)
      .then(result => {
        if (cancelled) return
        setTemplate(result.document)
        setDocument(result.document)
        setSectionText(makeText(result.document))
        setInvalidFields({})
        setValidationOk(false)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setBusy('') })
    return () => { cancelled = true }
  }, [token, company?.id, type])

  const sectionNames = useMemo(() => Object.keys(template || {}), [template])
  function changeSection(key, raw) {
    setSectionText(current => ({ ...current, [key]: raw }))
    setValidationOk(false)
    setSaved(null)
    try {
      const parsed = JSON.parse(raw)
      setDocument(current => ({ ...current, [key]: parsed }))
      setInvalidFields(current => { const copy = { ...current }; delete copy[key]; return copy })
    } catch {
      setInvalidFields(current => ({ ...current, [key]: 'JSON incorrecto en esta sección.' }))
    }
  }
  function takeRelated() {
    const source = related.find(row => row.id === relatedId)
    if (!source || !document) return
    const identification = source.dte_payload?.identificacion || {}
    const reference = {
      tipoDocumento: String(source.dte_type),
      tipoGeneracion: 2,
      numeroDocumento: String(source.generation_code).toUpperCase(),
      fechaEmision: identification.fecEmi || '',
    }
    const next = structuredClone(document)
    if (Object.hasOwn(next, 'documentoRelacionado')) next.documentoRelacionado = [reference]
    // Respetar estrictamente las propiedades del esquema del DTE elegido.
    const originReceiver = source.dte_payload?.receptor || {}
    if (next.receptor && typeof next.receptor === 'object') {
      Object.keys(next.receptor).forEach(key => {
        if (Object.hasOwn(originReceiver, key)) next.receptor[key] = originReceiver[key]
      })
    }
    setDocument(next)
    setSectionText(makeText(next))
    setValidationOk(false)
    setSaved(null)
    setMessage('Referencia vinculada. Revisa importes, tipo de ajuste y datos del receptor antes de validar.')
  }
  const invalid = Object.keys(invalidFields).length > 0
  async function validate() {
    if (invalid || !document) return setError('Corrige las secciones JSON señaladas.')
    setBusy('validate'); setError(''); setMessage('')
    try {
      await call('/api/dte/certification/validate', token, {
        method: 'POST', body: JSON.stringify({ companyId:company.id,dteType:type,document }),
      })
      setValidationOk(true)
      setMessage('Esquema validado. Aún NO se creó, firmó ni transmitió un documento.')
    } catch (e) { setValidationOk(false); setError(e.message) }
    finally { setBusy('') }
  }
  async function save() {
    if (!validationOk || !document || invalid) return setError('Primero valida un documento completo.')
    setBusy('save'); setError(''); setMessage('')
    try {
      const result = await call('/api/dte/certification/drafts', token, {
        method:'POST', body:JSON.stringify({ companyId:company.id, dteType:type, document }),
      })
      setSaved(result)
      setValidationOk(false)
      setMessage('Borrador ' + result.control_number + ' creado. Todavía NO está firmado ni enviado.')
      await reload()
    } catch(e) { setError(e.message) }
    finally { setBusy('') }
  }
  async function sign() {
    if (!saved || saved.status !== 'DRAFT') return
    if (!window.confirm('Vas a FIRMAR un borrador de PRUEBA ' + saved.control_number + '. No se transmitirá todavía. ¿Continuar?')) return
    setBusy('sign'); setError(''); setMessage('')
    try {
      const result = await call('/api/dte/sign-test', token, { method:'POST',body:JSON.stringify({ documentId:saved.id }) })
      setSaved(current => ({ ...current, ...result }))
      setMessage('DTE firmado correctamente. Aún NO enviado a Hacienda.')
      await reload()
    } catch(e) { setError(e.message) }
    finally { setBusy('') }
  }
  async function send() {
    if (!saved || saved.status !== 'SIGNED') return
    if (!window.confirm('Enviar ' + saved.control_number + ' al ambiente de PRUEBAS TEST 00 de Hacienda. Esta acción es REAL dentro del ambiente TEST y puede afectar tus contadores oficiales. ¿Confirmas?')) return
    setBusy('send'); setError(''); setMessage('')
    try {
      const result = await call('/api/dte/transmit-test',token,{ method:'POST',body:JSON.stringify({documentId:saved.id}) })
      setSaved(current => ({ ...current, ...result }))
      setMessage(result.status === 'PROCESSED'
        ? 'Hacienda TEST aceptó el documento. Consulta el contador oficial en el portal.'
        : 'Hacienda devolvió estado ' + (result.status || 'desconocido') + '. Revisa su respuesta.')
      await reload()
    } catch(e) { setError(e.message); await reload().catch(() => {}) }
    finally { setBusy('') }
  }
  const current = saved || null

  return <section style={{ ...box, display:'grid', gap:14, marginTop:14 }} aria-label="Emisión DTE avanzada TEST">
    <div>
      <strong style={{ fontSize:18 }}>Generar y transmitir los DTE pendientes desde IDEALO SV</strong>
      <p style={{ ...help, fontSize:13 }}>Editor fiscal guiado por secciones. Los campos e importes deben corresponder a operaciones reales; Hacienda puede rechazar documentos aunque cumplan el esquema JSON.</p>
    </div>
    <div style={{ padding:10,background:'#eff6ff',color:'#1e3a8a',borderRadius:8,fontSize:13 }}>
      <strong>Solo ambiente TEST (00).</strong> Validar, guardar, firmar y enviar son pasos independientes. No hay envío automático en lote ni acceso a producción desde este editor. Los formatos 2.0 deben estar habilitados para tu emisor por Hacienda.
    </div>
    <label style={{ fontWeight:700 }}>Tipo de documento
      <select value={type} onChange={e => setType(e.target.value)} disabled={Boolean(busy)} style={{ ...field,marginTop:5 }}>
        {TYPES.map(([code,name]) => <option key={code} value={code}>DTE-{code} · {name}</option>)}
      </select>
    </label>
    {relationTypes.includes(type) && <div style={{ ...box,background:'#f8fafc' }}>
      <label style={{fontWeight:700}}>Documento anterior de Hacienda TEST
        <select value={relatedId} onChange={e => setRelatedId(e.target.value)} style={{ ...field,marginTop:6 }}>
          <option value="">Selecciona documento aceptado dentro del ERP</option>
          {related.map(row => <option key={row.id} value={row.id}>{row.dte_type} · {row.control_number}</option>)}
        </select>
      </label>
      <button type="button" style={{ ...button,marginTop:8 }} onClick={takeRelated} disabled={!relatedId||Boolean(busy)}>Utilizar este DTE como referencia</button>
      <small style={help}>Nota de crédito/débito: el documento relacionado debe ser fiscalmente válido. Si el comprobante anterior no aparece, completa su información real en la sección Documento Relacionado.</small>
    </div>}
    {document && sectionNames.map(key => (
      <details key={key} style={{ ...box, padding:10, borderColor:invalidFields[key]?'#ef4444':'#cbd5e1' }} open={key==='receptor'||key==='documentoRelacionado'||key==='cuerpoDocumento'||key==='resumen'}>
        <summary style={{ cursor:'pointer',fontWeight:750 }}>{labels[key] || key}</summary>
        <textarea aria-label={'JSON ' + (labels[key] || key)} spellCheck={false} value={sectionText[key] || ''} onChange={e => changeSection(key,e.target.value)}
          rows={Math.min(13,Math.max(4,(sectionText[key]||'').split('\n').length+1))} style={{...field,marginTop:8,fontFamily:'ui-monospace, Consolas, monospace',fontSize:12,resize:'vertical'}} />
        {invalidFields[key] && <small style={{...help,color:'#b91c1c'}} role="alert">{invalidFields[key]}</small>}
        {key==='identificacion' && <small style={help}>El número de control, código de generación y fecha de emisión definitivos los asigna el ERP al guardar.</small>}
        {key==='emisor' && <small style={help}>La empresa emisora se precarga desde tu expediente fiscal. Completa cualquier dato requerido que falte.</small>}
      </details>
    ))}
    {error && <p role="alert" style={{...box,borderColor:'#fca5a5',color:'#b91c1c',fontSize:13,whiteSpace:'pre-wrap'}}>{error}</p>}
    {message && <p role="status" style={{...box,color:'#065f46',fontSize:13}}>{message}</p>}
    <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
      <button type="button" style={button} onClick={validate} disabled={Boolean(busy)||!document||invalid||Boolean(saved)}>1 · {busy==='validate'?'Validando…':'Validar esquema MH'}</button>
      <button type="button" style={{...button,background:'#0f766e'}} onClick={save} disabled={Boolean(busy)||!validationOk||Boolean(saved)}>2 · {busy==='save'?'Guardando…':'Crear borrador TEST'}</button>
      <button type="button" style={{...button,background:'#1d4ed8'}} onClick={sign} disabled={Boolean(busy)||current?.status!=='DRAFT'}>3 · {busy==='sign'?'Firmando…':'Firmar DTE TEST'}</button>
      <button type="button" style={{...button,background:'#7c3aed'}} onClick={send} disabled={Boolean(busy)||current?.status!=='SIGNED'}>4 · {busy==='send'?'Enviando…':'Enviar a Hacienda TEST'}</button>
    </div>
    {current && <div style={{...box,background:'#f8fafc'}}>
      <strong>{current.control_number}</strong>
      <small style={{...help}}>Estado: {current.status} · DTE-{current.dte_type}</small>
      {current.mh_response && <details><summary>Ver respuesta de Hacienda</summary><pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(current.mh_response,null,2)}</pre></details>}
    </div>}
    <div>
      <strong>Historial de pruebas desde este ERP</strong>
      {!history.length ? <small style={help}>No hay DTE adicionales registrados todavía.</small> : <div style={{maxHeight:260,overflowY:'auto',marginTop:8}}>
        {history.slice(0,30).map(row => <button type="button" key={row.id} style={{...field,textAlign:'left',marginBottom:5,cursor:'pointer'}} onClick={() => setSaved({ ...row })}>
          <strong>DTE-{row.dte_type} · {row.control_number}</strong><small style={help}>{row.status} · {new Date(row.created_at).toLocaleString('es-SV')}</small>
        </button>)}
      </div>}
    </div>
  </section>
}
