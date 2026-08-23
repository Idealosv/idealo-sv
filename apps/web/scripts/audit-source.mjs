import { readFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const mainPath = resolve(src, 'main.jsx')
const runtimePath = resolve(src, 'ModuleRuntime.jsx')
const menuPath = resolve(src, 'MainMenuController.jsx')
const menuCssPath = resolve(src, 'main-menu.css')
const main = await readFile(mainPath, 'utf8')
const runtime = await readFile(runtimePath, 'utf8')
const menu = await readFile(menuPath, 'utf8')
const menuCss = await readFile(menuCssPath, 'utf8')

const importsFrom = (source) => [...source.matchAll(/import\s+(?:[^'\"]+from\s+)?['\"](\.\/[^'\"]+)['\"]/g)].map((match) => match[1])
const relativeImports = [...new Set([...importsFrom(main), ...importsFrom(runtime)])]
const missing = []
for (const specifier of relativeImports) {
  try { await access(resolve(src, specifier.replace(/^\.\//, ''))) } catch { missing.push(specifier) }
}

const failures = []
if (missing.length) failures.push(`Imports inexistentes: ${missing.join(', ')}`)
if (!main.includes('RuntimeBoundary')) failures.push('Falta RuntimeBoundary en el arranque')
if (!main.includes('FormAccordionManager')) failures.push('Falta el gestor seguro de formularios')
if (main.includes('FormAccordionCoordinator')) failures.push('El coordinador global inestable volvió al arranque')
if (!main.includes('ModuleRuntime')) failures.push('Falta el runtime aislado por módulo')

const moduleScopedHosts = [
  'ExecutiveDashboardHost',
  'MobileFieldTools',
  'MobileSalesFieldBlock',
  'MobileClient360',
  'Client360Enhancer',
  'CommercialAutomationCenter',
  'ClientCrmPipeline',
  'ClientModuleOrganizer',
  'Client360TimelineHost',
  'ClientVatCardScannerHost',
]
const leakedHosts = moduleScopedHosts.filter((name) => main.includes(`<${name}`) || main.includes(`import ${name} `))
if (leakedHosts.length) failures.push(`Hosts de módulo cargados globalmente: ${leakedHosts.join(', ')}`)
if (!runtime.includes("activeModule === 'Dashboard'")) failures.push('Dashboard no está aislado por módulo')
if (!runtime.includes("activeModule === 'App móviles'")) failures.push('Extensiones móviles no están aisladas por módulo')
if (!runtime.includes("activeModule === 'Clientes'")) failures.push('Extensiones de Clientes no están aisladas por módulo')

const obsoleteGlobalSheets = [
  'corporate-premium-global.css',
  'corporate-gray-dark.css',
  'orange-button-clean.css',
  'solid-button-clean.css',
  'less-orange-global.css',
  'enterprise-theme-final.css',
  'enterprise-ui-v2.css',
  'enterprise-ui-v3-hotfix.css',
]
const stillLoaded = obsoleteGlobalSheets.filter((name) => main.includes(name))
if (stillLoaded.length) failures.push(`Capas CSS globales obsoletas todavía cargadas: ${stillLoaded.join(', ')}`)

const expectedModules = [
  'Dashboard', 'App móviles', 'Clientes', 'Productos', 'Cotizaciones',
  'Producción', 'Inventario', 'Facturación', 'Proveedores', 'Compras', 'Caja',
  'Asistente IA', 'Agenda', 'Reportes', 'Seguridad',
]

const moduleBlock = menu.match(/const MODULES = \[([\s\S]*?)\]/)?.[1] || ''
const actualModules = [...moduleBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])
if (JSON.stringify(actualModules) !== JSON.stringify(expectedModules)) {
  failures.push(`Orden del menú inconsistente. Esperado: ${expectedModules.join(' > ')}`)
}
if (new Set(actualModules).size !== actualModules.length) failures.push('Hay módulos duplicados en el menú principal')
if (menu.includes('MODULE_GROUPS') || menu.includes('idealo-menu-group-label')) failures.push('El menú principal volvió a mostrar categorías o rótulos extra')
if (!menuCss.includes('.erp-sidebar > nav:not(.idealo-main-menu){display:none!important}')) failures.push('El menú legado puede volver a mostrarse junto al menú principal')
if (/\.idealo-main-menu-item\.active\s*\{[^}]*background\s*:\s*#f36c21/i.test(menuCss)) failures.push('El módulo activo volvió a usar fondo naranja')
if (!/\.idealo-main-menu-item\.active\s*\{[^}]*color\s*:\s*#f36c21/i.test(menuCss)) failures.push('El módulo activo debe marcarse con texto naranja')

if (failures.length) {
  console.error('\nAuditoría frontend falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Auditoría frontend OK: ${relativeImports.length} imports verificados, runtime aislado, menú consistente y arranque protegido.`)
