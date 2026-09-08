export const DTE_TEST_SCENARIO_LABELS = {
  consumer_no_id: 'Consumidor final sin identificación',
  consumer_identified: 'Receptor identificado',
  cash: 'Operación al contado',
  credit: 'Operación a crédito',
  transfer: 'Pago por transferencia',
  electronic_payment: 'Pago electrónico',
  discount: 'Factura con descuento',
  multi_item: 'Factura con varias partidas',
  goods: 'Venta de bienes',
  services: 'Venta de servicios',
  exempt: 'Venta exenta',
  non_subject: 'Venta no sujeta',
}

export function readPendingDteTestScenario(storage = window.sessionStorage) {
  const code = storage.getItem('idealo:dte-test-scenario') || ''
  storage.removeItem('idealo:dte-test-scenario')
  return DTE_TEST_SCENARIO_LABELS[code] ? code : ''
}

export function applyDteTestScenarioPreset(code, setters) {
  const {
    setDteType, setClientId, setCondicionOperacion, setPaymentCode,
    setPaymentPeriod, setPaymentTerm, setNumPagoElectronico, setItems,
    emptyItem,
  } = setters

  setDteType('01')

  switch (code) {
    case 'consumer_no_id':
      setClientId('')
      break
    case 'consumer_identified':
      // El cliente debe elegir un receptor real; nunca seleccionamos uno arbitrariamente.
      setClientId('')
      break
    case 'cash':
      setCondicionOperacion('1')
      setPaymentCode('01')
      break
    case 'credit':
      setCondicionOperacion('2')
      setPaymentTerm('01')
      setPaymentPeriod('30')
      setPaymentCode('05')
      break
    case 'transfer':
      setCondicionOperacion('1')
      setPaymentCode('05')
      break
    case 'electronic_payment':
      setCondicionOperacion('1')
      setPaymentCode('08')
      break
    case 'discount':
      setItems((current) => current.map((item, index) => index === 0 ? { ...item, montoDescu: '' } : item))
      break
    case 'multi_item':
      setItems((current) => current.length >= 2 ? current : [...current, emptyItem()])
      break
    case 'goods':
      setItems((current) => current.map((item, index) => index === 0 ? { ...item, tipoItem: '1', uniMedida: '59' } : item))
      break
    case 'services':
      setItems((current) => current.map((item, index) => index === 0 ? { ...item, tipoItem: '2', uniMedida: '36' } : item))
      break
    case 'exempt':
      setItems((current) => current.map((item, index) => index === 0 ? { ...item, tipoVenta: 'exenta' } : item))
      break
    case 'non_subject':
      setItems((current) => current.map((item, index) => index === 0 ? { ...item, tipoVenta: 'no_sujeta' } : item))
      break
    default:
      return false
  }

  if (code !== 'electronic_payment') setNumPagoElectronico('')
  return true
}

export function scenarioInstruction(code) {
  switch (code) {
    case 'consumer_identified': return 'Seleccioná un cliente real del módulo Clientes antes de guardar.'
    case 'discount': return 'Ingresá un descuento real mayor que cero en una partida; el ERP no inventa importes.'
    case 'exempt': return 'La partida quedó clasificada como exenta. Usala únicamente si la operación es legalmente exenta.'
    case 'non_subject': return 'La partida quedó clasificada como no sujeta. Usala únicamente si legalmente corresponde.'
    case 'multi_item': return 'Se prepararon dos partidas; completá descripción, cantidad y precio reales.'
    default: return 'El ERP preparó la estructura del caso. Completá únicamente los datos reales que falten.'
  }
}
