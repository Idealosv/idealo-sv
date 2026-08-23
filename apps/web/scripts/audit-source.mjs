import { readFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const paths = {
  main: resolve(src, 'main.jsx'), runtime: resolve(src, 'ModuleRuntime.jsx'), menu: resolve(src, 'MainMenuController.jsx'), menuCss: resolve(src, 'main-menu.css'),
  clientsOrganizer: resolve(src, 'ClientModuleOrganizer.jsx'), clientsCss: resolve(src, 'client-module-organizer.css'), dashboardCss: resolve(src, 'executive-dashboard-main.css'),
  commercial: resolve(src, 'CommercialLauncher.jsx'), inventory: resolve(src, 'InventoryCostLauncher.jsx'), billing: resolve(src, 'FacturacionLauncher.jsx'), procurement: resolve(src, 'OperationsFinanceLauncher.jsx'),
  planning: resolve(src, 'ProductionCalendarLauncher.jsx'), financial: resolve(src, 'FinancialDashboardLauncher.jsx'), assistant: resolve(src, 'AssistantLauncher.jsx'), security: resolve(src, 'SecurityLauncher.jsx'), workspaceBridge: resolve(src, 'WorkspaceNavigationBridge.jsx'),
  actionHierarchy: resolve(src, 'module-action-hierarchy.css'),
}
const source = {}
for (const [key,path] of Object.entries(paths)) source[key] = await readFile(path, 'utf8')

const importsFrom = (text) => [...text.matchAll(/import\s+(?:[^'\"]+from\s+)?['\"](\.\/[^'\"]+)['\"]/g)].map((match) => match[1])
const relativeImports = [...new Set([...importsFrom(source.main), ...importsFrom(source.runtime)])]
const missing = []
for (const specifier of relativeImports) { try { await access(resolve(src, specifier.replace(/^\.\//, ''))) } catch { missing.push(specifier) } }

const failures = []
if (missing.length) failures.push(`Imports inexistentes: ${missing.join(', ')}`)
if (!source.main.includes('RuntimeBoundary')) failures.push('Falta RuntimeBoundary en el arranque')
if (!source.main.includes('FormAccordionManager')) failures.push('Falta el gestor seguro de formularios')
if (source.main.includes('FormAccordionCoordinator')) failures.push('El coordinador global inestable volvió al arranque')
if (!source.main.includes('ModuleRuntime')) failures.push('Falta el runtime aislado por módulo')
if (!source.main.includes('AssistantLauncher')) failures.push('Asistente IA no tiene vista principal propia')
if (!source.main.includes('SecurityLauncher')) failures.push('Seguridad no tiene vista principal propia')
if (!source.main.includes('WorkspaceNavigationBridge')) failures.push('Falta el adaptador aislado para módulos legados de Workspace')
if (!source.main.includes("'./module-action-hierarchy.css'")) failures.push('Falta la capa final de jerarquía visual de acciones')
if (!source.actionHierarchy.includes('.products360-savebar') || !source.actionHierarchy.includes('.production-detail-actions')) failures.push('La jerarquía visual no cubre Productos y Producción')
if (!source.actionHierarchy.includes("button[type='submit']")) failures.push('La acción primaria debe quedar diferenciada de las secundarias')
if (!source.actionHierarchy.includes('.danger-action')) failures.push('Las acciones destructivas necesitan tratamiento visual propio')

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

const directRoutes = [
  ['Dashboard','workspace','Resumen'],['Clientes','workspace','Clientes'],['Productos','commercial','Productos y trabajos'],['Cotizaciones','commercial','Cotizaciones'],['Producción','commercial','Producción'],['Inventario','inventory','Inventario'],['Facturación','billing','resumen'],['Proveedores','procurement','Proveedores'],['Compras','procurement','Compras y gastos'],['Caja','procurement','Caja'],['Asistente IA','assistant',null],['Agenda','planning',null],['Reportes','financial',null],['Seguridad','security',null],
]
for (const [name,target,tab] of directRoutes) { const expected = tab ? `openDirectModule('${target}', '${tab}')` : `openDirectModule('${target}')`; if (!source.menu.includes(expected)) failures.push(`${name} debe abrirse por evento directo`) }
for (const [key,label] of [['commercial','CommercialLauncher'],['inventory','InventoryCostLauncher'],['billing','FacturacionLauncher'],['procurement','OperationsFinanceLauncher'],['planning','ProductionCalendarLauncher'],['financial','FinancialDashboardLauncher'],['assistant','AssistantLauncher'],['security','SecurityLauncher']]) { if (!source[key].includes("window.addEventListener('idealo-open-module'")) failures.push(`${label} no escucha apertura directa desde el menú`) }
if (!source.workspaceBridge.includes("detail.target !== 'workspace'")) failures.push('WorkspaceNavigationBridge no está limitado al target workspace')
if (!source.commercial.includes('mainModuleForTab')) failures.push('Las pestañas comerciales deben sincronizar el módulo activo del menú')
if (!source.procurement.includes('menuForTab')) failures.push('Proveedores, Compras y Caja deben sincronizar el módulo activo del menú')
if (source.menu.includes('openLauncher(') || source.menu.includes('clickWorkspaceModule(')) failures.push('El menú principal volvió a usar navegación por clic simulado')
if (source.menu.includes('MÓDULO EN ESTRUCTURA') || source.menu.includes('module-placeholder-card')) failures.push('El menú principal no debe renderizar placeholders genéricos')

const expectedModules = ['Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Asistente IA','Agenda','Reportes','Seguridad']
const moduleBlock = source.menu.match(/const MODULES = \[([\s\S]*?)\]/)?.[1] || ''
const actualModules = [...moduleBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])
if (JSON.stringify(actualModules) !== JSON.stringify(expectedModules)) failures.push(`Orden del menú inconsistente. Esperado: ${expectedModules.join(' > ')}`)
if (new Set(actualModules).size !== actualModules.length) failures.push('Hay módulos duplicados en el menú principal')
if (source.menu.includes('MODULE_GROUPS') || source.menu.includes('idealo-menu-group-label')) failures.push('El menú principal volvió a mostrar categorías o rótulos extra')
if (!source.menuCss.includes('.erp-sidebar > nav:not(.idealo-main-menu){display:none!important}')) failures.push('El menú legado puede volver a mostrarse junto al menú principal')
if (/\.idealo-main-menu-item\.active\s*\{[^}]*background\s*:\s*#f36c21/i.test(source.menuCss)) failures.push('El módulo activo volvió a usar fondo naranja')
if (!/\.idealo-main-menu-item\.active\s*\{[^}]*color\s*:\s*#f36c21/i.test(source.menuCss)) failures.push('El módulo activo debe marcarse con texto naranja')

if (failures.length) { console.error('\nAuditoría frontend falló:'); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1) }
console.log(`Auditoría frontend OK: ${relativeImports.length} imports verificados, jerarquía visual protegida, navegación directa consolidada, runtime aislado y menú protegido.`)
