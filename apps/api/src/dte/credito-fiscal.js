import { randomUUID } from 'node:crypto'

const CONTROL_PATTERN = /^DTE-03-(M|B|S|P)\d{3}P\d{3}-\d{15}$/
const UUID_PATTERN = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/

const money = (value) => Number(Number(value || 0).toFixed(2))
const required = (value, name) => {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${name} es obligatorio para el DTE-03.`)
  return value
}

function dateParts(date) {
  const local = new Date(date)
  if (Number.isNaN(local.valueOf())) throw new Error('La fecha de emisión no es válida.')
  const pad = (value) => String(value).padStart(2, '0')
  return { date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`, time: `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}` }
}

function address(value, owner) {
  required(value, `dirección de ${owner}`)
  return {
    departamento: String(required(value.departamento, `departamento de ${owner}`)),
    municipio: String(required(value.municipio, `municipio de ${owner}`)),
    distrito: String(required(value.distrito, `distrito de ${owner}`)),
    complemento: String(required(value.complemento, `complemento de dirección de ${owner}`)),
  }
}

function buildItem(item, index) {
  const quantity = Number(required(item.cantidad, `cantidad del ítem ${index + 1}`))
  const unitPrice = Number(required(item.precioUni, `precio del ítem ${index + 1}`))
  const discount = money(item.montoDescu || 0)
  if (!(quantity > 0) || unitPrice < 0 || discount < 0) throw new Error(`Los importes del ítem ${index + 1} no son válidos.`)
  const net = money(quantity * unitPrice - discount)
  if (net < 0) throw new Error(`El descuento del ítem ${index + 1} excede su valor.`)
  const saleType = String(item.tipoVenta || 'gravada')
  const gravada = saleType === 'gravada' ? net : 0
  const exenta = saleType === 'exenta' ? net : 0
  const noSuj = saleType === 'no_sujeta' ? net : 0
  return {
    numItem: index + 1,
    tipoItem: Number(item.tipoItem || 2),
    numeroDocumento: item.numeroDocumento ? String(item.numeroDocumento) : null,
    cantidad: quantity,
    codigo: item.codigo ? String(item.codigo) : null,
    codTributo: item.codTributo ? String(item.codTributo) : null,
    uniMedida: Number(item.uniMedida || 59),
    descripcion: String(required(item.descripcion, `descripción del ítem ${index + 1}`)),
    precioUni: money(unitPrice),
    montoDescu: discount,
    ventaNoSuj: noSuj,
    ventaExenta: exenta,
    ventaGravada: gravada,
    tributos: gravada ? ['20'] : null,
    psv: money(item.psv || 0),
    noGravado: money(item.noGravado || 0),
  }
}

function normalizePayment(payment, totalPagar, condicionOperacion) {
  if (!payment?.codigo) {
    if (Number(condicionOperacion) === 1) return [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }]
    return null
  }
  return [{
    codigo: String(payment.codigo),
    montoPago: money(payment.montoPago ?? totalPagar),
    referencia: payment.referencia ? String(payment.referencia) : null,
    plazo: payment.plazo ? String(payment.plazo) : null,
    periodo: payment.periodo === '' || payment.periodo == null ? null : Number(payment.periodo),
  }]
}

export function validateCreditoFiscal(dte) {
  const errors = []
  const add = (condition, message) => { if (!condition) errors.push(message) }
  add(dte?.identificacion?.version === 3, 'identificacion.version debe ser 3')
  add(dte?.identificacion?.ambiente === '00', 'ambiente debe ser 00 para pruebas')
  add(dte?.identificacion?.tipoDte === '03', 'tipoDte debe ser 03')
  add(CONTROL_PATTERN.test(dte?.identificacion?.numeroControl || ''), 'numeroControl no cumple el formato oficial')
  add(UUID_PATTERN.test(dte?.identificacion?.codigoGeneracion || ''), 'codigoGeneracion no cumple el formato oficial')
  add(Boolean(dte?.receptor?.nit && dte?.receptor?.nrc && dte?.receptor?.nombre), 'DTE-03 requiere NIT, NRC y nombre del receptor')
  add(Array.isArray(dte?.cuerpoDocumento) && dte.cuerpoDocumento.length > 0, 'cuerpoDocumento debe contener partidas')
  add(typeof dte?.resumen?.totalPagar === 'number' && dte.resumen.totalPagar >= 0, 'totalPagar no es válido')
  if (errors.length) throw new Error(`DTE-03 inválido: ${errors.join('; ')}.`)
  return true
}

export function buildCreditoFiscal({
  emisor, receptor, items, numeroControl, codigoGeneracion = randomUUID(), emittedAt = new Date(),
  condicionOperacion = 1, totalLetras, observaciones = null, payment = null, numPagoElectronico = null,
  documentoRelacionado = null, otrosDocumentos = null, ventaTercero = null, apendice = null,
  ivaRete = 0, ivaPerci = 0, reteRenta = 0, saldoFavor = 0, totalNoGravado = 0,
}) {
  if (!receptor) throw new Error('El Comprobante de Crédito Fiscal requiere un cliente contribuyente.')
  if (!Array.isArray(items) || items.length === 0 || items.length > 2000) throw new Error('El DTE-03 debe incluir entre 1 y 2000 partidas.')
  const issued = dateParts(emittedAt)
  const cuerpoDocumento = items.map(buildItem)
  const totalNoSuj = money(cuerpoDocumento.reduce((sum, item) => sum + item.ventaNoSuj, 0))
  const totalExenta = money(cuerpoDocumento.reduce((sum, item) => sum + item.ventaExenta, 0))
  const totalGravada = money(cuerpoDocumento.reduce((sum, item) => sum + item.ventaGravada, 0))
  const totalDescu = money(cuerpoDocumento.reduce((sum, item) => sum + item.montoDescu, 0))
  const iva = money(totalGravada * 0.13)
  const subTotalVentas = money(totalNoSuj + totalExenta + totalGravada)
  const subTotal = subTotalVentas
  const montoTotalOperacion = money(subTotal + iva + Number(totalNoGravado || 0))
  const totalPagar = money(montoTotalOperacion + Number(ivaPerci || 0) - Number(ivaRete || 0) - Number(reteRenta || 0) - Number(saldoFavor || 0))
  const generationCode = String(codigoGeneracion).toUpperCase()

  const dte = {
    identificacion: { version: 3, ambiente: '00', tipoDte: '03', numeroControl: String(required(numeroControl, 'numeroControl')), codigoGeneracion: generationCode, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: issued.date, horEmi: issued.time, tipoMoneda: 'USD' },
    documentoRelacionado: Array.isArray(documentoRelacionado) && documentoRelacionado.length ? documentoRelacionado : null,
    emisor: {
      nit: String(required(emisor?.nit, 'NIT del emisor')), nrc: String(required(emisor?.nrc, 'NRC del emisor')), nombre: String(required(emisor?.nombre, 'nombre del emisor')),
      codActividad: String(required(emisor?.codActividad, 'actividad del emisor')), descActividad: String(required(emisor?.descActividad, 'descripción de actividad del emisor')),
      nombreComercial: emisor.nombreComercial || null, tipoEstablecimiento: '02', direccion: address(emisor.direccion, 'emisor'), telefono: String(required(emisor?.telefono, 'teléfono del emisor')),
      correo: String(required(emisor?.correo, 'correo del emisor')), codEstableMH: null, codEstable: emisor.codEstable || null, codPuntoVentaMH: null, codPuntoVenta: emisor.codPuntoVenta || null,
    },
    receptor: {
      nit: String(required(receptor?.nit, 'NIT del receptor')), nrc: String(required(receptor?.nrc, 'NRC del receptor')), nombre: String(required(receptor?.nombre, 'nombre del receptor')),
      codActividad: String(required(receptor?.codActividad, 'actividad del receptor')), descActividad: String(required(receptor?.descActividad, 'descripción de actividad del receptor')),
      nombreComercial: receptor.nombreComercial || null, direccion: address(receptor.direccion, 'receptor'), telefono: receptor.telefono || null, correo: receptor.correo || null,
    },
    otrosDocumentos: Array.isArray(otrosDocumentos) && otrosDocumentos.length ? otrosDocumentos : null,
    ventaTercero: ventaTercero?.nit ? ventaTercero : null,
    cuerpoDocumento,
    resumen: {
      totalNoSuj, totalExenta, totalGravada, subTotalVentas,
      descuNoSuj: 0, descuExenta: 0, descuGravada: 0,
      porcentajeDescuento: subTotalVentas > 0 ? money(totalDescu * 100 / (subTotalVentas + totalDescu)) : 0,
      totalDescu,
      tributos: totalGravada > 0 ? [{ codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: iva }] : null,
      subTotal, ivaPerci1: money(ivaPerci), ivaRete1: money(ivaRete), reteRenta: money(reteRenta), montoTotalOperacion,
      totalNoGravado: money(totalNoGravado), totalPagar, totalLetras: String(required(totalLetras, 'total en letras')), saldoFavor: money(saldoFavor), condicionOperacion: Number(condicionOperacion),
      pagos: normalizePayment(payment, totalPagar, condicionOperacion), numPagoElectronico: numPagoElectronico || null,
    },
    extension: observaciones ? { nombEntrega: null, docuEntrega: null, nombRecibe: null, docuRecibe: null, observaciones: String(observaciones), placaVehiculo: null } : null,
    apendice: Array.isArray(apendice) && apendice.length ? apendice : null,
  }
  validateCreditoFiscal(dte)
  return dte
}
