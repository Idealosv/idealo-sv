import { readFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const mainPath = resolve(src, 'main.jsx')
const runtimePath = resolve(src, 'ModuleRuntime.jsx')
const menuPath = resolve(src, 'MainMenuController.jsx')
const menuCssPath = resolve(src, 'main-menu.css')
const clientsOrganizerPath = resolve(src, 'ClientModuleOrganizer.jsx')
const clientsCssPath = resolve(src, 'client-module-organizer.css')
const dashboardCssPath = resolve(src, 'executive-dashboard-main.css')
const commercialPath = resolve(src, 'CommercialLauncher.jsx')
const inventoryPath = resolve(src, 'InventoryCostLauncher.jsx')
const main = await readFile(mainPath, 'utf8')
const runtime = await readFile(runtimePath, 'utf8')
const menu = await readFile(menuPath, 'utf8')
const menuCss = await readFile(menuCssPath, 'utf8')
const clientsOrganizer = await readFile(clientsOrganizerPath, 'utf8')
const clientsCss = await readFile(clientsCssPath, 'utf8')
const dashboardCss = await readFile(dashboardCssPath, 'utf8')
const commercial = await readFile(commercialPath, 'utf8')
const inventory = await readFile(inventoryPath, 'utf8')

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

const moduleScopedHosts = ['ExecutiveDashboardHost','MobileFieldTools','MobileSalesFieldBlock','MobileClient360','Client360Enhancer','CommercialAutomationCenter','ClientCrmPipeline','ClientModuleOrganizer','Client360TimelineHost','ClientVatCardScannerHost']
const leakedHosts = moduleScopedHosts.filter((name) => main.includes(`<${name}`) || main.includes(`import ${name} `))
if (leakedHosts.length) failures.push(`Hosts de módulo cargados globalmente: ${leakedHosts.join(', ')}`)
if (!runtime.includes("activeModule === 'Dashboard'")) failures.push('Dashboard no está aislado por módulo')
if (!runtime.includes("activeModule === 'App móviles'")) failures.push('Extensiones móviles no están aisladas por módulo')
if (!runtime.includes("activeModule === 'Clientes'")) failures.push('Extensiones de Clientes no están aisladas por módulo')

const obsoleteGlobalSheets = ['premium.css','executive.css','idealo-brand.css','idealo-reference.css','global-contrast.css','erp-clean-system.css','erp-audit-clean.css','corporate-premium-global.css','corporate-gray-dark.css','orange-button-clean.css','solid-button-clean.css','less-orange-global.css','enterprise-theme-final.css','enterprise-ui-v2.css','enterprise-ui-v3-hotfix.css']
const stillLoaded = obsoleteGlobalSheets.filter((name) => main.includes(`'./${name}'`) || main.includes(`\"./${name}\"`))
if (stillLoaded.length) failures.push(`Capas CSS globales redundantes todavía cargadas: ${stillLoaded.join(', ')}`)
const masterCount = (main.match(/erp-corporate-master\.css/g) || []).length
if (masterCount !== 1) failures.push('Debe existir una sola capa visual maestra: erp-corporate-master.css')

if (clientsOrganizer.includes("['new', 'Nuevo cliente']") || clientsOrganizer.includes('client-view-tabs')) failures.push('Clientes volvió a duplicar la navegación Nuevo cliente/Directorio')
if (!clientsCss.includes('.client-form-open .client-stats,.client-form-open .clients-directory{display:none!important}')) failures.push('El formulario de Clientes debe ocultar resumen y directorio mientras se edita')
if (/\.erp-content:has\(\.executive-dashboard-host\)>:not\(\.executive-dashboard-host\)/.test(dashboardCss)) failures.push('Dashboard ejecutivo volvió a ocultar indiscriminadamente el encabezado del módulo')
if (!dashboardCss.includes('>.welcome-strip') || !dashboardCss.includes('>.metric-grid') || !dashboardCss.includes('>.dashboard-grid')) failures.push('Dashboard debe ocultar únicamente los bloques básicos duplicados cuando está activo el ejecutivo')

for (const [name,target,tab] of [['Productos','commercial','Productos y trabajos'],['Cotizaciones','commercial','Cotizaciones'],['Producción','commercial','Producción'],['Inventario','inventory','Inventario']]) {
  if (!menu.includes(`openDirectModule('${target}', '${tab}')`)) failures.push(`${name} debe abrirse por evento directo, no por clic simulado`)
}
if (!commercial.includes("window.addEventListener('idealo-open-module'")) failures.push('CommercialLauncher no escucha apertura directa desde el menú')
if (!inventory.includes("window.addEventListener('idealo-open-module'")) failures.push('InventoryCostLauncher no escucha apertura directa desde el menú')
if (!commercial.includes('mainModuleForTab')) failures.push('Las pestañas comerciales deben sincronizar el módulo activo del menú')

const expectedModules = ['Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Asistente IA','Agenda','Reportes','Seguridad']
const moduleBlock = menu.match(/const MODULES = \[([\s\S]*?)\]/)?.[1] || ''
const actualModules = [...moduleBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])
if (JSON.stringify(actualModules) !== JSON.stringify(expectedModules)) failures.push(`Orden del menú inconsistente. Esperado: ${expectedModules.join(' > ')}`)
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
console.log(`Auditoría frontend OK: ${relativeImports.length} imports verificados, navegación comercial directa, Dashboard y Clientes consistentes, runtime aislado, CSS consolidado y menú protegido.`)
