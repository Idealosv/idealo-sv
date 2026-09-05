import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const read = (name) => readFile(resolve(src, name), 'utf8')

const [menu, billing, commercial, inventory, procurement, planning, financial, assistant, security, bridge, access] = await Promise.all([
  read('MainMenuController.jsx'), read('FacturacionLauncher.jsx'), read('CommercialLauncher.jsx'), read('InventoryCostLauncher.jsx'),
  read('OperationsFinanceLauncher.jsx'), read('ProductionCalendarLauncher.jsx'), read('FinancialDashboardLauncher.jsx'), read('AssistantLauncher.jsx'),
  read('SecurityLauncher.jsx'), read('WorkspaceNavigationBridge.jsx'), read('erp-access-control.js'),
])

const failures = []
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const routes = [
  ['Dashboard','workspace','Resumen'],
  ['Clientes','workspace','Clientes'],
  ['Comercial','commercial','Cotizaciones'],
  ['Inventario','inventory','Inventario'],
  ['Facturación','billing','resumen'],
  ['Abastecimiento','procurement','Control'],
  ['Caja','procurement','Caja'],
  ['Agenda','planning',null],
  ['Reportes','financial',null],
  ['Asistente IA','assistant',null],
  ['Seguridad','security',null],
]
for (const [name,target,tab] of routes) {
  const pattern = tab
    ? new RegExp(`openDirectModule\\(\\s*['\"]${escapeRegExp(target)}['\"]\\s*,\\s*['\"]${escapeRegExp(tab)}['\"]\\s*\\)`)
    : new RegExp(`openDirectModule\\(\\s*['\"]${escapeRegExp(target)}['\"]\\s*\\)`)
  if (!pattern.test(menu)) failures.push(`${name} no tiene ruta funcional directa`)
}

for (const [name, source] of [
  ['Facturación', billing], ['Comercial', commercial], ['Inventario', inventory], ['Abastecimiento/Caja', procurement],
  ['Agenda', planning], ['Reportes', financial], ['Asistente IA', assistant], ['Seguridad', security],
]) {
  if (!source.includes("window.addEventListener('idealo-open-module'")) failures.push(`${name} no escucha apertura desde menú`)
  if (!source.includes('setOpen(true)')) failures.push(`${name} no abre su vista principal`)
  if (!source.includes('setOpen(false)')) failures.push(`${name} no tiene cierre funcional`)
}

if (!bridge.includes("detail.target !== 'workspace'")) failures.push('El adaptador de Dashboard/Clientes no está aislado a workspace')
if (menu.includes('new MutationObserver')) failures.push('El menú principal mantiene un MutationObserver global')
if (!menu.includes('normalizeModule')) failures.push('El menú no normaliza módulos legados hacia las áreas agrupadas')
if (!access.includes("'Productos':'Comercial'") || !access.includes("'Producción':'Comercial'") || !access.includes("'Proveedores':'Abastecimiento'")) failures.push('Faltan alias de compatibilidad para módulos agrupados')
if (!billing.includes("onClick={() => openSection(section.id)}")) failures.push('Las secciones internas de Facturación no tienen navegación local')
if (!billing.includes("activeSection === 'emitir'")) failures.push('Facturación no monta Nueva factura por estado')
if (!billing.includes("activeSection === 'documentos'")) failures.push('Facturación no monta Documentos por estado')
if (!billing.includes("activeSection === 'hacienda'")) failures.push('Facturación no monta Hacienda por estado')
if (!commercial.includes("step==='quote'") || !commercial.includes("step==='work-order'") || !commercial.includes("step==='collection'")) failures.push('Comercial no conserva el recorrido Cotización → OT → Cobro')

if (failures.length) {
  console.error('\nAuditoría funcional de navegación falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Auditoría funcional de navegación OK: menú agrupado, compatibilidad, cierre y secciones internas protegidos.')
