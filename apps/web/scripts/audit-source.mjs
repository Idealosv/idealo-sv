import { readFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const paths = {
  main: resolve(src, 'main.jsx'),
  runtime: resolve(src, 'ModuleRuntime.jsx'),
  menu: resolve(src, 'MainMenuController.jsx'),
  menuCss: resolve(src, 'main-menu.css'),
  clientsOrganizer: resolve(src, 'ClientModuleOrganizer.jsx'),
  clientsCss: resolve(src, 'client-module-organizer.css'),
  dashboardCss: resolve(src, 'executive-dashboard-main.css'),
  commercial: resolve(src, 'CommercialLauncher.jsx'),
  inventory: resolve(src, 'InventoryCostLauncher.jsx'),
  billing: resolve(src, 'FacturacionLauncher.jsx'),
  procurement: resolve(src, 'OperationsFinanceLauncher.jsx'),
}
const source = {}
for (const [key,path] of Object.entries(paths)) source[key] = await readFile(path, 'utf8')

const importsFrom = (text) => [...text.matchAll(/import\s+(?:[^'\"]+from\s+)?['\"](\.\/[^'\"]+)['\"]/g)].map((match) => match[1])
const relativeImports = [...new Set([...importsFrom(source.main), ...importsFrom(source.runtime)])]
const missing = []
for (const specifier of relativeImports) {
  try { await access(resolve(src, specifier.replace(/^\.\//, ''))) } catch { missing.push(specifier) }
}

const failures = []
if (missing.length) failures.push(`Imports inexistentes: ${missing.join(', ')}`)
if (!source.main.includes('RuntimeBoundary')) failures.push('Falta RuntimeBoundary en el arranque')
if (!source.main.includes('FormAccordionManager')) failures.push('Falta el gestor seguro de formularios')
if (source.main.includes('FormAccordionCoordinator')) failures.push('El coordinador global inestable volvió al arranque')
if (!source.main.includes('ModuleRuntime')) failures.push('Falta el runtime aislado por módulo')

const moduleScopedHosts = ['ExecutiveDashboardHost','MobileFieldTools','MobileSalesFieldBlock','MobileClient360','Client360Enhancer','CommercialAutomationCenter','ClientCrmPipeline','ClientModuleOrganizer','Client360TimelineHost','ClientVatCardScannerHost']
const leakedHosts = moduleScopedHosts.filter((name) => source.main.includes(`<${name}`) || source.main.includes(`import ${name} `))
if (leakedHosts.length) failures.push(`Hosts de módulo cargados globalmente: ${leakedHosts.join(', ')}`)
if (!source.runtime.includes("activeModule === 'Dashboard'")) failures.push('Dashboard no está aislado por módulo')
if (!source.runtime.includes("activeModule === 'App móviles'")) failures.push('Extensiones móviles no están aisladas por módulo')
if (!source.runtime.includes("activeModule === 'Clientes'")) failures.push('Extensiones de Clientes no están aisladas por módulo')

const obsoleteGlobalSheets = ['premium.css','executive.css','idealo-brand.css','idealo-reference.css','global-contrast.css','erp-clean-system.css','erp-audit-clean.css','corporate-premium-global.css','corporate-gray-dark.css','orange-button-clean.css','solid-button-clean.css','less-orange-global.css','enterprise-theme-final.css','enterprise-ui-v2.css','enterprise-ui-v3-hotfix.css']
const stillLoaded = obsoleteGlobalSheets.filter((name) => source.main.includes(`'./${name}'`) || source.main.includes(`\"./${name}\"`))
if (stillLoaded.length) failures.push(`Capas CSS globales redundantes todavía cargadas: ${stillLoaded.join(', ')}`)
if ((source.main.match(/erp-corporate-master\.css/g) || []).length !== 1) failures.push('Debe existir una sola capa visual maestra: erp-corporate-master.css')

if (source.clientsOrganizer.includes("['new', 'Nuevo cliente']") || source.clientsOrganizer.includes('client-view-tabs')) failures.push('Clientes volvió a duplicar la navegación Nuevo cliente/Directorio')
if (!source.clientsCss.includes('.client-form-open .client-stats,.client-form-open .clients-directory{display:none!important}')) failures.push('El formulario de Clientes debe ocultar resumen y directorio mientras se edita')
if (/\.erp-content:has\(\.executive-dashboard-host\)>:not\(\.executive-dashboard-host\)/.test(source.dashboardCss)) failures.push('Dashboard ejecutivo volvió a ocultar indiscriminadamente el encabezado del módulo')
if (!source.dashboardCss.includes('>.welcome-strip') || !source.dashboardCss.includes('>.metric-grid') || !source.dashboardCss.includes('>.dashboard-grid')) failures.push('Dashboard debe ocultar únicamente los bloques básicos duplicados cuando está activo el ejecutivo')

for (const [name,target,tab] of [['Productos','commercial','Productos y trabajos'],['Cotizaciones','commercial','Cotizaciones'],['Producción','commercial','Producción'],['Inventario','inventory','Inventario'],['Facturación','billing','resumen'],['Proveedores','procurement','Proveedores'],['Compras','procurement','Compras y gastos'],['Caja','procurement','Caja']]) {
  if (!source.menu.includes(`openDirectModule('${target}', '${tab}')`)) failures.push(`${name} debe abrirse por evento directo, no por clic simulado`)
}
if (!source.commercial.includes("window.addEventListener('idealo-open-module'")) failures.push('CommercialLauncher no escucha apertura directa desde el menú')
if (!source.inventory.includes("window.addEventListener('idealo-open-module'")) failures.push('InventoryCostLauncher no escucha apertura directa desde el menú')
if (!source.billing.includes("window.addEventListener('idealo-open-module'")) failures.push('FacturacionLauncher no escucha apertura directa desde el menú')
if (!source.procurement.includes("window.addEventListener('idealo-open-module'")) failures.push('OperationsFinanceLauncher no escucha apertura directa desde el menú')
if (!source.commercial.includes('mainModuleForTab')) failures.push('Las pestañas comerciales deben sincronizar el módulo activo del menú')
if (!source.procurement.includes('menuForTab')) failures.push('Proveedores, Compras y Caja deben sincronizar el módulo activo del menú')

const forbiddenLegacy = [
  "openLauncher('.sidebar-module-access.billing')",
  "openLauncher('.sidebar-module-access.procurement', 'Proveedores')",
  "openLauncher('.sidebar-module-access.procurement', 'Compras y gastos')",
  "openLauncher('.sidebar-module-access.procurement', 'Caja')",
]
const legacyFound = forbiddenLegacy.filter((entry) => source.menu.includes(entry))
if (legacyFound.length) failures.push(`Navegación heredada todavía activa: ${legacyFound.join(', ')}`)

const expectedModules = ['Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Asistente IA','Agenda','Reportes','Seguridad']
const moduleBlock = source.menu.match(/const MODULES = \[([\s\S]*?)\]/)?.[1] || ''
const actualModules = [...moduleBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])
if (JSON.stringify(actualModules) !== JSON.stringify(expectedModules)) failures.push(`Orden del menú inconsistente. Esperado: ${expectedModules.join(' > ')}`)
if (new Set(actualModules).size !== actualModules.length) failures.push('Hay módulos duplicados en el menú principal')
if (source.menu.includes('MODULE_GROUPS') || source.menu.includes('idealo-menu-group-label')) failures.push('El menú principal volvió a mostrar categorías o rótulos extra')
if (!source.menuCss.includes('.erp-sidebar > nav:not(.idealo-main-menu){display:none!important}')) failures.push('El menú legado puede volver a mostrarse junto al menú principal')
if (/\.idealo-main-menu-item\.active\s*\{[^}]*background\s*:\s*#f36c21/i.test(source.menuCss)) failures.push('El módulo activo volvió a usar fondo naranja')
if (!/\.idealo-main-menu-item\.active\s*\{[^}]*color\s*:\s*#f36c21/i.test(source.menuCss)) failures.push('El módulo activo debe marcarse con texto naranja')

if (failures.length) {
  console.error('\nAuditoría frontend falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log(`Auditoría frontend OK: ${relativeImports.length} imports verificados, navegación directa en comercial/facturación/abastecimiento, Dashboard y Clientes consistentes, runtime aislado y menú protegido.`)
