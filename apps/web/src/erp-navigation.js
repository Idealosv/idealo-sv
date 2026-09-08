import { ERP_MODULES, moduleFromOpenDetail } from './erp-access-control.js'

export const ERP_ROUTES = Object.freeze({
  Dashboard: { target: 'workspace', tab: 'Resumen' },
  'App móviles': { target: 'mobile', tab: 'Inicio' },
  Clientes: { target: 'workspace', tab: 'Clientes' },
  Productos: { target: 'commercial', tab: 'Productos y trabajos' },
  Cotizaciones: { target: 'commercial', tab: 'Cotizaciones' },
  Producción: { target: 'commercial', tab: 'Producción' },
  Inventario: { target: 'inventory', tab: 'Inventario' },
  Facturación: { target: 'billing', tab: 'resumen' },
  'Cuentas por cobrar': { target: 'billing', tab: 'cobros' },
  Proveedores: { target: 'procurement', tab: 'Proveedores' },
  Compras: { target: 'procurement', tab: 'Compras y gastos' },
  Caja: { target: 'procurement', tab: 'Caja' },
  'Asistente IA': { target: 'assistant' },
  Agenda: { target: 'planning' },
  Reportes: { target: 'financial' },
  Seguridad: { target: 'security' },
})

let sequence = 0
let state = {
  requestId: 0,
  requestedModule: 'Dashboard',
  activeModule: 'Dashboard',
  target: 'workspace',
  tab: 'Resumen',
  status: 'active',
  error: '',
  context: {},
}

const listeners = new Set()

const publish = () => {
  const snapshot = { ...state, context: { ...(state.context || {}) } }
  listeners.forEach((listener) => {
    try { listener(snapshot) } catch (error) { console.error('[IDEALO SV] navigation listener', error) }
  })
  if (typeof window !== 'undefined') {
    window.__IDEALO_NAVIGATION__ = snapshot
    window.dispatchEvent(new CustomEvent('idealo-navigation-state', { detail: snapshot }))
  }
}

const dispatchLegacyActive = (moduleName) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: moduleName }))
  }
}

export const getNavigationState = () => ({ ...state, context: { ...(state.context || {}) } })

export function subscribeNavigation(listener, { replay = true } = {}) {
  listeners.add(listener)
  if (replay) queueMicrotask(() => {
    if (listeners.has(listener)) listener(getNavigationState())
  })
  return () => listeners.delete(listener)
}

export function requestModule(moduleName, context = {}) {
  const route = ERP_ROUTES[moduleName]
  if (!route || !ERP_MODULES.includes(moduleName)) return 0
  const requestId = ++sequence
  state = {
    requestId,
    requestedModule: moduleName,
    activeModule: state.activeModule,
    target: route.target,
    tab: route.tab,
    status: 'requested',
    error: '',
    context: { ...context },
  }
  publish()
  return requestId
}

export function confirmModule(requestId, moduleName) {
  if (!requestId || state.requestId !== requestId || state.requestedModule !== moduleName) return false
  if (state.status === 'active' && state.activeModule === moduleName) return true
  state = { ...state, activeModule: moduleName, status: 'active', error: '' }
  publish()
  dispatchLegacyActive(moduleName)
  return true
}

export function activateModule(moduleName, context = {}) {
  const route = ERP_ROUTES[moduleName]
  if (!route || !ERP_MODULES.includes(moduleName)) return false
  const requestId = ++sequence
  state = {
    requestId,
    requestedModule: moduleName,
    activeModule: moduleName,
    target: route.target,
    tab: route.tab,
    status: 'active',
    error: '',
    context: { ...context },
  }
  publish()
  dispatchLegacyActive(moduleName)
  return true
}

export function failModule(requestId, moduleName, error) {
  if (!requestId || state.requestId !== requestId || state.requestedModule !== moduleName) return false
  const message = String(error?.message || error || `No se pudo abrir ${moduleName}.`)
  state = { ...state, status: 'error', error: message }
  publish()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('idealo-navigation-error', {
      detail: { requestId, module: moduleName, message },
    }))
  }
  return true
}

export function moduleForTargetDetail(detail = {}) {
  if (detail.target === 'mobile') return 'App móviles'
  return moduleFromOpenDetail(detail)
}

export function requestFromTargetDetail(detail = {}) {
  const moduleName = moduleForTargetDetail(detail)
  if (!moduleName) return 0
  const { target, tab, source, ...context } = detail
  return requestModule(moduleName, context)
}
