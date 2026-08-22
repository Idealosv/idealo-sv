import { useEffect, useMemo, useState } from 'react'
import './facturacion.css'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const PAYMENT_METHODS = [
  ['01', 'Efectivo / billetes y monedas'], ['02', 'Tarjeta de débito'], ['03', 'Tarjeta de crédito'],
  ['04', 'Cheque'], ['05', 'Transferencia bancaria'], ['08', 'Dinero electrónico'], ['99', 'Otro'],
]
const UNIT_OPTIONS = [['59', 'Unidad'], ['36', 'Servicio'], ['99', 'Otra']]
const ITEM_TYPES = [['1', 'Bien'], ['2', 'Servicio'], ['3', 'Bien y servicio'], ['4', 'Otro']]
const emptyItem = () => ({ tipoItem: '2', codigo: '', descripcion: '', cantidad: '1', uniMedida: '59', precioUni: '0.00', montoDescu: '0', tipoVenta: 'gravada' })

async function apiRequest(path, options) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${apiUrl}${path}`, { ...options, signal: controller.signal })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message || `La API respondió HTTP ${response.status}.`)
    return payload
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La API tardó demasiado en responder. Intenta nuevamente en unos segundos.')
    if (error.message === 'Failed to fetch') throw new Error('No se pudo conectar con la API de IDEALO SV. Verifica que Render haya terminado de desplegar y vuelve a intentar.')
    throw error
  } finally { window.clearTimeout(timer) }
}

export default function FacturacionDte({ session, supabase, company }) {
  const [clients, setClients] = useState([])
  const [documents, setDocuments] = useState([])
  const [clientId, setClientId] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [condicionOperacion, setCondicionOperacion] = useState('1')
  const [paymentCode, setPaymentCode] = useState('01')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentPeriod, setPaymentPeriod] = useState('')
  const [paymentTerm, setPaymentTerm] = useState('')
  const [numPagoElectronico, setNumPagoElectronico] = useState('')
  const [totalLetras, setTotalLetras] = useState('')
  const [ivaRete, setIvaRete] = useState('0')
  const [saldoFavor, setSaldoFavor] = useState('0')
  const [totalNoGravado, setTotalNoGravado] = useState('0')
  const [observaciones, setObservaciones] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [related, setRelated] = useState({ tipoDocumento: '', tipoGeneracion: '2', numeroDocumento: '', fechaEmision: '' })
  const [thirdParty, setThirdParty] = useState({ nit: '', nombre: '', codDomiciliado: '1' })
  const [appendix, setAppendix] = useState({ campo: '', etiqueta: '', valor: '' })
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('info')
  const [busy, setBusy] = useState('')

  const showMessage = (text, type = 'info', scroll = false) => {
    setMessage(text); setMessageType(type)
    if (scroll) window.setTimeout(() => document.querySelector('.invoice-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const load = async () => {
    const [{ data: clientRows, error: clientError }, { data: dteRows, error: dteError }] = await Promise.all([
      supabase.from('clients').select('*').eq('company_id', company.id).order('name'),
      supabase.from('dte_documents').select('id, client_id, control_number, generation_code, status, environment, created_at, dte_payload, mh_response').eq('company_id', company.id).eq('dte_type', '01').order('created_at', { ascending: false }).limit(30),
    ])
    if (clientError || dteError) showMessage(clientError?.message || dteError?.message, 'error')
    setClients(clientRows || []); setDocuments(dteRows || [])
  }
  useEffect(() => { load() }, [company.id])

  const selectedClient = clients.find((client) => client.id === clientId) || null
  const totals = useMemo(() => {
    const result = { gravada: 0, exenta: 0, noSujeta: 0, descuentos: 0, iva: 0 }
    items.forEach((item) => {
      const gross = Number(item.cantidad || 0) * Number(item.precioUni || 0)
      const discount = Math.max(0, Number(item.montoDescu || 0))
      const net = Math.max(0, gross - discount)
      result.descuentos += discount
      if (item.tipoVenta === 'exenta') result.exenta += net
      else if (item.tipoVenta === 'no_sujeta') result.noSujeta += net
      else { result.gravada += net; result.iva += net - net / 1.13 }
    })
    result.operacion = result.gravada + result.exenta + result.noSujeta + Number(totalNoGravado || 0)
    result.pagar = Math.max(0, result.operacion - Number(ivaRete || 0) - Number(saldoFavor || 0))
    return result
  }, [items, ivaRete, saldoFavor, totalNoGravado])

  const updateItem = (index, key, value) => setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item))
  const validateInvoiceForm = () => {
    const errors = []
    items.forEach((item, index) => {
      const n = index + 1
      if (!item.descripcion.trim()) errors.push(`Partida ${n}: falta descripción`)
      if (!(Number(item.cantidad) > 0)) errors.push(`Partida ${n}: cantidad inválida`)
      if (!(Number(item.precioUni) > 0)) errors.push(`Partida ${n}: precio inválido`)
      if (Number(item.montoDescu || 0) > Number(item.cantidad || 0) * Number(item.precioUni || 0)) errors.push(`Partida ${n}: descuento excesivo`)
    })
    if (!(totals.pagar > 0)) errors.push('el total a pagar debe ser mayor que cero')
    if (!totalLetras.trim()) errors.push('falta el total en letras')
    if (condicionOperacion === '2' && (!paymentPeriod || !paymentTerm)) errors.push('para crédito indica plazo y período')
    return errors
  }

  const createInvoice = async (event) => {
    event.preventDefault()
    const errors = validateInvoiceForm()
    if (errors.length) return showMessage(`No se puede guardar: ${errors.join(' · ')}.`, 'error', true)
    setBusy('create'); setMessage('')
    try {
      const payload = await apiRequest('/api/dte/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          companyId: company.id, clientId: clientId || null, items,
          condicionOperacion: Number(condicionOperacion), totalLetras, observaciones: observaciones || null,
          payment: { codigo: paymentCode, montoPago: totals.pagar, referencia: paymentReference || null, periodo: paymentPeriod || null, plazo: paymentTerm || null },
          numPagoElectronico: numPagoElectronico || null, ivaRete: Number(ivaRete || 0), saldoFavor: Number(saldoFavor || 0), totalNoGravado: Number(totalNoGravado || 0),
          documentoRelacionado: related.numeroDocumento ? [{ ...related, tipoDocumento: related.tipoDocumento || '01', tipoGeneracion: Number(related.tipoGeneracion) }] : null,
          ventaTercero: thirdParty.nit ? thirdParty : null,
          apendice: appendix.campo && appendix.valor ? [appendix] : null,
        }),
      })
      showMessage(`Factura ${payload.control_number} creada como DRAFT. Revisa la vista previa antes de firmar.`, 'success', true)
      setItems([emptyItem()]); setTotalLetras(''); setObservaciones(''); await load()
    } catch (error) { showMessage(error.message, 'error', true) } finally { setBusy('') }
  }

  const sign = async (document) => {
    setBusy(document.id); setMessage('')
    try {
      const payload = await apiRequest('/api/dte/sign-test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ documentId: document.id }) })
      showMessage(`DTE ${payload.control_number} firmado. Todavía no fue enviado a Hacienda.`, 'success', true); await load()
    } catch (error) { showMessage(error.message, 'error', true) } finally { setBusy('') }
  }

  const transmit = async (document) => {
    if (!window.confirm('Se enviará únicamente a Hacienda TEST. ¿Continuar?')) return
    setBusy(document.id); setMessage('')
    try {
      const payload = await apiRequest('/api/dte/transmit-test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ documentId: document.id }) })
      showMessage(`Resultado MH TEST: ${payload.status}. ${payload.control_number || ''}`, payload.status === 'PROCESSED' ? 'success' : 'error', true); await load()
    } catch (error) { showMessage(error.message, 'error', true) } finally { setBusy('') }
  }

  return (
    <section className="clients-module facturacion-dte">
      <div className="invoice-heading">
        <div><p className="form-kicker">DTE-01 · FACTURA ELECTRÓNICA v2</p><h2>Facturación electrónica</h2><p>Formulario estructurado conforme al esquema JSON de Factura v2 suministrado por Ministerio de Hacienda.</p></div>
        <div className="invoice-badges"><span>TEST 00</span><span>Modelo normal</span><span>USD</span></div>
      </div>
      {message && <p className={`feedback ${messageType === 'error' ? 'error' : 'success'}`} role="status">{message}</p>}

      <form className="panel client-form-full invoice-form" onSubmit={createInvoice} noValidate>
        <fieldset className="form-section"><legend>1. Identificación del DTE</legend>
          <div className="invoice-readonly-grid"><Info label="Tipo DTE" value="01 · Factura"/><Info label="Versión" value="2"/><Info label="Ambiente" value="00 · Pruebas"/><Info label="Moneda" value="USD"/><Info label="Modelo" value="1 · Facturación previa"/><Info label="Transmisión" value="1 · Normal"/></div>
        </fieldset>

        <fieldset className="form-section"><legend>2. Emisor</legend>
          <div className="issuer-card"><strong>{company.name}</strong><p>NIT {company.nit || 'pendiente'} · NRC {company.nrc || 'pendiente'} · {company.business_activity || 'Actividad pendiente'}</p><p>{company.address || 'Dirección pendiente'} · Tel. {company.phone || '—'} · {company.email || '—'}</p><small>Los datos se toman del expediente de Empresa. En TEST se usan M001/P001 temporalmente.</small></div>
        </fieldset>

        <fieldset className="form-section"><legend>3. Receptor</legend>
          <div className="form-grid three"><label className="field form-span-2"><span>Cliente / receptor</span><select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Consumidor final sin identificación</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Info label="Tipo" value={selectedClient ? 'Receptor identificado' : 'Consumidor final'}/></div>
          {selectedClient && <div className="receiver-grid"><Info label="Nombre" value={selectedClient.name}/><Info label="Documento" value={`${selectedClient.document_type || '—'} ${selectedClient.document_number || selectedClient.tax_id || '—'}`}/><Info label="NRC" value={selectedClient.nrc || 'No aplica'}/><Info label="Actividad" value={selectedClient.business_activity || '—'}/><Info label="Dirección" value={selectedClient.address || '—'}/><Info label="Contacto" value={`${selectedClient.phone || '—'} · ${selectedClient.email || '—'}`}/></div>}
        </fieldset>

        <fieldset className="form-section"><legend>4. Cuerpo del documento / partidas</legend>
          {items.map((item, index) => <article className="invoice-item" key={index}>
            <div className="invoice-item-title"><strong>Partida {index + 1}</strong>{items.length > 1 && <button type="button" className="secondary-button" onClick={() => setItems((x) => x.filter((_, i) => i !== index))}>Quitar</button>}</div>
            <div className="form-grid four">
              <label className="field"><span>Tipo de ítem *</span><select value={item.tipoItem} onChange={(e) => updateItem(index,'tipoItem',e.target.value)}>{ITEM_TYPES.map(([v,l]) => <option value={v} key={v}>{v} · {l}</option>)}</select></label>
              <label className="field"><span>Código interno</span><input value={item.codigo} onChange={(e) => updateItem(index,'codigo',e.target.value)} placeholder="SKU / código"/></label>
              <label className="field form-span-2"><span>Descripción *</span><input value={item.descripcion} onChange={(e) => updateItem(index,'descripcion',e.target.value)} placeholder="Descripción del bien o servicio"/></label>
              <label className="field"><span>Cantidad *</span><input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={(e) => updateItem(index,'cantidad',e.target.value)}/></label>
              <label className="field"><span>Unidad de medida *</span><select value={item.uniMedida} onChange={(e) => updateItem(index,'uniMedida',e.target.value)}>{UNIT_OPTIONS.map(([v,l]) => <option value={v} key={v}>{v} · {l}</option>)}</select></label>
              <label className="field"><span>Precio unitario *</span><input type="number" min="0.01" step="0.01" value={item.precioUni} onChange={(e) => updateItem(index,'precioUni',e.target.value)}/></label>
              <label className="field"><span>Descuento</span><input type="number" min="0" step="0.01" value={item.montoDescu} onChange={(e) => updateItem(index,'montoDescu',e.target.value)}/></label>
              <label className="field"><span>Clasificación de venta *</span><select value={item.tipoVenta} onChange={(e) => updateItem(index,'tipoVenta',e.target.value)}><option value="gravada">Venta gravada</option><option value="exenta">Venta exenta</option><option value="no_sujeta">Venta no sujeta</option></select></label>
            </div>
          </article>)}
          <button type="button" className="wide-action" onClick={() => setItems((x) => [...x, emptyItem()])}>+ Agregar partida</button>
        </fieldset>

        <fieldset className="form-section"><legend>5. Resumen fiscal</legend>
          <div className="invoice-totals"><Total label="Ventas no sujetas" value={totals.noSujeta}/><Total label="Ventas exentas" value={totals.exenta}/><Total label="Ventas gravadas" value={totals.gravada}/><Total label="Descuentos" value={totals.descuentos}/><Total label="IVA incluido" value={totals.iva}/><Total label="Total operación" value={totals.operacion}/><Total label="Total a pagar" value={totals.pagar} strong/></div>
          <div className="form-grid three" style={{marginTop:14}}><label className="field"><span>IVA retenido</span><input type="number" min="0" step="0.01" value={ivaRete} onChange={(e)=>setIvaRete(e.target.value)}/></label><label className="field"><span>Saldo a favor</span><input type="number" min="0" step="0.01" value={saldoFavor} onChange={(e)=>setSaldoFavor(e.target.value)}/></label><label className="field"><span>Total no gravado adicional</span><input type="number" min="0" step="0.01" value={totalNoGravado} onChange={(e)=>setTotalNoGravado(e.target.value)}/></label><label className="field form-span-3"><span>Total en letras *</span><input value={totalLetras} onChange={(e)=>setTotalLetras(e.target.value)} placeholder="Ej.: CIEN 00/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA"/></label></div>
        </fieldset>

        <fieldset className="form-section"><legend>6. Condición y forma de pago</legend>
          <div className="form-grid three"><label className="field"><span>Condición de operación *</span><select value={condicionOperacion} onChange={(e)=>setCondicionOperacion(e.target.value)}><option value="1">1 · Contado</option><option value="2">2 · Crédito</option><option value="3">3 · Otro</option></select></label><label className="field"><span>Forma de pago *</span><select value={paymentCode} onChange={(e)=>setPaymentCode(e.target.value)}>{PAYMENT_METHODS.map(([v,l])=><option key={v} value={v}>{v} · {l}</option>)}</select></label><label className="field"><span>Referencia</span><input value={paymentReference} onChange={(e)=>setPaymentReference(e.target.value)} placeholder="Voucher, transferencia, cheque..."/></label>{condicionOperacion === '2' && <><label className="field"><span>Plazo</span><select value={paymentTerm} onChange={(e)=>setPaymentTerm(e.target.value)}><option value="">Seleccionar</option><option value="01">Días</option><option value="02">Meses</option><option value="03">Años</option></select></label><label className="field"><span>Período</span><input type="number" min="1" value={paymentPeriod} onChange={(e)=>setPaymentPeriod(e.target.value)}/></label></>}<label className="field"><span>N.º pago electrónico</span><input value={numPagoElectronico} onChange={(e)=>setNumPagoElectronico(e.target.value)}/></label><label className="field form-span-3"><span>Observaciones</span><textarea rows="3" value={observaciones} onChange={(e)=>setObservaciones(e.target.value)} placeholder="Información complementaria de la operación"/></label></div>
        </fieldset>

        <fieldset className="form-section advanced-section"><legend>7. Información avanzada / opcional</legend>
          <button type="button" className="secondary-button" onClick={()=>setAdvanced(!advanced)}>{advanced ? 'Ocultar campos avanzados' : 'Mostrar documentos relacionados, tercero y apéndice'}</button>
          {advanced && <div className="advanced-content">
            <h4>Documento relacionado</h4><div className="form-grid four"><label className="field"><span>Tipo DTE</span><input value={related.tipoDocumento} onChange={(e)=>setRelated({...related,tipoDocumento:e.target.value})} placeholder="01, 03..."/></label><label className="field"><span>Tipo generación</span><select value={related.tipoGeneracion} onChange={(e)=>setRelated({...related,tipoGeneracion:e.target.value})}><option value="1">Físico</option><option value="2">Electrónico</option></select></label><label className="field"><span>Número / código generación</span><input value={related.numeroDocumento} onChange={(e)=>setRelated({...related,numeroDocumento:e.target.value})}/></label><label className="field"><span>Fecha emisión</span><input type="date" value={related.fechaEmision} onChange={(e)=>setRelated({...related,fechaEmision:e.target.value})}/></label></div>
            <h4>Venta a cuenta de terceros</h4><div className="form-grid three"><label className="field"><span>NIT tercero</span><input value={thirdParty.nit} onChange={(e)=>setThirdParty({...thirdParty,nit:e.target.value})}/></label><label className="field form-span-2"><span>Nombre tercero</span><input value={thirdParty.nombre} onChange={(e)=>setThirdParty({...thirdParty,nombre:e.target.value})}/></label></div>
            <h4>Apéndice</h4><div className="form-grid three"><label className="field"><span>Campo</span><input value={appendix.campo} onChange={(e)=>setAppendix({...appendix,campo:e.target.value})}/></label><label className="field"><span>Etiqueta</span><input value={appendix.etiqueta} onChange={(e)=>setAppendix({...appendix,etiqueta:e.target.value})}/></label><label className="field"><span>Valor</span><input value={appendix.valor} onChange={(e)=>setAppendix({...appendix,valor:e.target.value})}/></label></div>
          </div>}
        </fieldset>

        <div className="invoice-actions"><div><strong>Vista previa:</strong> ${totals.pagar.toFixed(2)} · {selectedClient?.name || 'Consumidor final'}</div><button type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Guardando…' : 'Guardar borrador DTE-01'}</button></div>
      </form>

      <section className="panel invoice-history"><div className="panel-heading"><div><p className="form-kicker">BITÁCORA DTE</p><h3>Facturas recientes</h3></div><button type="button" onClick={load}>Actualizar</button></div><div className="check-list">{documents.length === 0 ? <p>Todavía no hay facturas.</p> : documents.map((document) => <div key={document.id} className="check-item invoice-document"><div><strong>{document.control_number}</strong><small>{new Date(document.created_at).toLocaleString('es-SV')} · {document.status} · ${Number(document.dte_payload?.resumen?.totalPagar || 0).toFixed(2)}</small><small>Código de generación: {document.generation_code}</small></div><div className="form-actions">{document.status === 'DRAFT' && <button type="button" onClick={()=>sign(document)} disabled={busy===document.id}>Firmar TEST</button>}{document.status === 'SIGNED' && <button type="button" onClick={()=>transmit(document)} disabled={busy===document.id}>Enviar MH TEST</button>}</div></div>)}</div></section>
    </section>
  )
}

function Info({label,value}) { return <div className="invoice-info"><span>{label}</span><strong>{value || '—'}</strong></div> }
function Total({label,value,strong=false}) { return <div className={strong?'invoice-total strong':'invoice-total'}><span>{label}</span><strong>${Number(value||0).toFixed(2)}</strong></div> }
