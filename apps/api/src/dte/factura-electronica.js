import { randomUUID } from 'node:crypto'

const CONTROL_PATTERN = /^DTE-01-(M|B|S|P)\d{3}P\d{3}-\d{15}$/
const UUID_PATTERN = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/

function money(value) {
  return Number(Number(value || 0).toFixed(2))
}

function required(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${name} es obligatorio para el DTE-01.`)
  return value
}

function address(value, owner) {
  required(value, `direccion de ${owner}`)
  return {
    departamento: String(required(value.departamento, `departamento de ${owner}`)),
    municipio: String(required(value.municipio, `municipio de ${owner}`)),
    distrito: String(required(value.distrito, `distrito de ${owner}`)),
    complemento: String(required(value.complemento, `complemento de dirección de ${owner}`)),
  }
}

function dateParts(date) {
  const local = new Date(date)
  if (Number.isNaN(local.valueOf())) throw new Error('La fecha de emisión no es válida.')
  const pad = (value) => String(value).padStart(2, '0')
  return { date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`, time: `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}` }
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
    codigo: item.codigo ? String(item.codigo) : null,
    codTributo: item.codTributo ? String(item.codTributo) : null,
    descripcion: String(required(item.descripcion, `descripción del ítem ${index + 1}`)),
    cantidad: quantity,
    uniMedida: Number(item.uniMedida || 59),
    precioUni: money(unitPrice),
    montoDescu: discount,
    ventaNoSuj: noSuj,
    ventaExenta: exenta,
    ventaGravada: gravada,
    tributos: Array.isArray(item.tributos) && item.tributos.length ? item.tributos : null,
    psv: money(item.psv || 0),
    noGravado: money(item.noGravado || 0),
    ivaItem: gravada ? money(gravada - gravada / 1.13) : 0,
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

export function validateFacturaElectronica(dte) {
  const errors = []
  const add = (condition, message) => { if (!condition) errors.push(message) }
  add(dte?.identificacion?.version === 2, 'identificacion.version debe ser 2')
  add(dte?.identificacion?.ambiente === '00', 'ambiente debe ser 00 para pruebas')
  add(dte?.identificacion?.tipoDte === '01', 'tipoDte debe ser 01')
  add(CONTROL_PATTERN.test(dte?.identificacion?.numeroControl || ''), 'numeroControl no cumple el formato oficial')
  add(UUID_PATTERN.test(dte?.identificacion?.codigoGeneracion || ''), 'codigoGeneracion no cumple el formato oficial')
  add(Boolean(dte?.emisor?.nit && dte?.emisor?.nrc && dte?.emisor?.nombre), 'faltan datos obligatorios del emisor')
  add(Boolean(dte?.emisor?.direccion?.departamento && dte?.emisor?.direccion?.municipio && dte?.emisor?.direccion?.distrito), 'falta la dirección fiscal del emisor')
  add(Array.isArray(dte?.cuerpoDocumento) && dte.cuerpoDocumento.length > 0, 'cuerpoDocumento debe contener partidas')
  add(typeof dte?.resumen?.totalPagar === 'number' && dte.resumen.totalPagar >= 0, 'totalPagar no es válido')
  if (errors.length) throw new Error(`DTE-01 inválido: ${errors.join('; ')}.`)
  return true
}

export function buildFacturaElectronica({
  emisor, receptor = null, items, numeroControl, codigoGeneracion = randomUUID(), emittedAt = new Date(),
  condicionOperacion = 1, totalLetras, observaciones = null, payment = null, numPagoElectronico = null,
  documentoRelacionado = null, otrosDocumentos = null, ventaTercero = null, apendice = null,
  ivaRete = 0, saldoFavor = 0, totalNoGravado = 0,
}) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 2000) throw new Error('El DTE-01 debe incluir entre 1 y 2000 partidas.')
  const issued = dateParts(emittedAt)
  const cuerpoDocumento = items.map(buildItem)
  const totalNoSuj = money(cuerpoDocumento.reduce((sum, item) => sum + item.ventaNoSuj, 0))
  const totalExenta = money(cuerpoDocumento.reduce((sum, item) => sum + item.ventaExenta, 0))
  const totalGravada = money(cuerpoDocumento.reduce((sum, item) => sum + item.ventaGravada, 0))
  const totalDescu = money(cuerpoDocumento.reduce((sum, item) => sum + item.montoDescu, 0))
  const totalIva = money(cuerpoDocumento.reduce((sum, item) => sum + item.ivaItem, 0))
  const subTotalVentas = money(totalNoSuj + totalExenta + totalGravada)
  const subTotal = subTotalVentas
  const montoTotalOperacion = money(subTotal + Number(totalNoGravado || 0))
  const totalPagar = money(montoTotalOperacion - Number(ivaRete || 0) - Number(saldoFavor || 0))
  const generationCode = String(codigoGeneracion).toUpperCase()

  const dte = {
    identificacion: { version: 2, ambiente: '00', tipoDte: '01', numeroControl: String(required(numeroControl, 'numeroControl')), codigoGeneracion: generationCode, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: issued.date, horEmi: issued.time, tipoMoneda: 'USD' },
    documentoRelacionado: Array.isArray(documentoRelacionado) && documentoRelacionado.length ? documentoRelacionado : null,
    emisor: {
      nit: String(required(emisor?.nit, 'NIT del emisor')), nrc: String(required(emisor?.nrc, 'NRC del emisor')), nombre: String(required(emisor?.nombre, 'nombre del emisor')),
      codActividad: String(required(emisor?.codActividad, 'actividad del emisor')), descActividad: String(required(emisor?.descActividad, 'descripción de actividad del emisor')),
      nombreComercial: emisor.nombreComercial || null, direccion: address(emisor.direccion, 'emisor'), telefono: String(required(emisor?.telefono, 'teléfono del emisor')),
      correo: String(required(emisor?.correo, 'correo del emisor')), codEstable: emisor.codEstable || null, codPuntoVenta: emisor.codPuntoVenta || null,
    },
    receptor: receptor ? { tipoDocumento: receptor.tipoDocumento || null, numDocumento: receptor.numDocumento || null, nrc: receptor.nrc || null, nombre: receptor.nombre || null, codActividad: receptor.codActividad || null, descActividad: receptor.descActividad || null, direccion: receptor.direccion ? address(receptor.direccion, 'receptor') : null, telefono: receptor.telefono || null, correo: receptor.correo || null } : null,
    otrosDocumentos: Array.isArray(otrosDocumentos) && otrosDocumentos.length ? otrosDocumentos : null,
    ventaTercero: ventaTercero?.nit ? ventaTercero : null,
    cuerpoDocumento,
    resumen: {
      totalNoSuj, totalExenta, totalGravada, subTotalVentas,
      descuNoSuj: 0, descuExenta: 0, descuGravada: 0,
      porcentajeDescuento: subTotalVentas > 0 ? money(totalDescu * 100 / (subTotalVentas + totalDescu)) : 0,
      totalDescu, tributos: null, subTotal,
      ivaRete: money(ivaRete), montoTotalOperacion, totalNoGravado: money(totalNoGravado), totalPagar,
      totalLetras: String(required(totalLetras, 'total en letras')), totalIva, saldoFavor: money(saldoFavor), condicionOperacion: Number(condicionOperacion),
      pagos: normalizePayment(payment, totalPagar, condicionOperacion), numPagoElectronico: numPagoElectronico || null, observaciones,
    },
    apendice: Array.isArray(apendice) && apendice.length ? apendice : null,
  }
  validateFacturaElectronica(dte)
  return dte
}
