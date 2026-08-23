import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const read = (name) => readFile(resolve(src, name), 'utf8')

const [menu, billing, commercial, inventory, procurement, planning, financial, assistant, security, bridge] = await Promise.all([
  read('MainMenuController.jsx'), read('FacturacionLauncher.jsx'), read('CommercialLauncher.jsx'), read('InventoryCostLauncher.jsx'),
  read('OperationsFinanceLauncher.jsx'), read('ProductionCalendarLauncher.jsx'), read('FinancialDashboardLauncher.jsx'), read('AssistantLauncher.jsx'),
  read('SecurityLauncher.jsx'), read('WorkspaceNavigationBridge.jsx'),
])

const failures = []
const routes = [
  ['Dashboard', "openDirectModule('workspace', 'Resumen')"],
  ['Clientes', "openDirectModule('workspace', 'Clientes')"],
  ['Productos', "openDirectModule('commercial', 'Productos y trabajos')"],
  ['Cotizaciones', "openDirectModule('commercial', 'Cotizaciones')"],
  ['Producción', "openDirectModule('commercial', 'Producción')"],
  ['Inventario', "openDirectModule('inventory', 'Inventario')"],
  ['Facturación', "openDirectModule('billing', 'resumen')"],
  ['Proveedores', "openDirectModule('procurement', 'Proveedores')"],
  ['Compras', "openDirectModule('procurement', 'Compras y gastos')"],
  ['Caja', "openDirectModule('procurement', 'Caja')"],
  ['Asistente IA', "openDirectModule('assistant')"],
  ['Agenda', "openDirectModule('planning')"],
  ['Reportes', "openDirectModule('financial')"],
  ['Seguridad', "openDirectModule('security')"],
]
for (const [name, token] of routes) if (!menu.includes(token)) failures.push(`${name} no tiene ruta funcional directa`)

for (const [name, source] of [
  ['Facturación', billing], ['Comercial', commercial], ['Inventario', inventory], ['Compras/Finanzas', procurement],
  ['Agenda', planning], ['Reportes', financial], ['Asistente IA', assistant], ['Seguridad', security],
]) {
  if (!source.includes("window.addEventListener('idealo-open-module'")) failures.push(`${name} no escucha apertura desde menú`)
  if (!source.includes('setOpen(true)')) failures.push(`${name} no abre su vista principal`)
  if (!source.includes('setOpen(false)')) failures.push(`${name} no tiene cierre funcional`)
}

if (!bridge.includes("detail.target !== 'workspace'")) failures.push('El adaptador de Dashboard/Clientes no está aislado a workspace')
if (menu.includes('new MutationObserver')) failures.push('El menú principal mantiene un MutationObserver global')
if (!billing.includes("onClick={() => openSection(section.id)}")) failures.push('Las secciones internas de Facturación no tienen navegación local')
if (!billing.includes("activeSection === 'emitir'")) failures.push('Facturación no monta Nueva factura por estado')
if (!billing.includes("activeSection === 'documentos'")) failures.push('Facturación no monta Facturas por estado')
if (!billing.includes("activeSection === 'hacienda'")) failures.push('Facturación no monta Hacienda por estado')

if (failures.length) {
  console.error('\nAuditoría funcional de navegación falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Auditoría funcional de navegación OK: módulos, cierre y secciones internas protegidos.')
