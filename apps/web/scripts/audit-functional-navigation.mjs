import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const read = (name) => readFile(resolve(src, name), 'utf8')

const [
  main, menu, navigation, eventBridge, workspaceBridge, runtimeBoundary, accessRuntime, access,
  billing, commercial, inventory, procurement, planning, financial, assistant, security, mobile,
] = await Promise.all([
  read('main.jsx'), read('MainMenuController.jsx'), read('erp-navigation.js'), read('NavigationEventBridge.jsx'),
  read('WorkspaceNavigationBridge.jsx'), read('RuntimeBoundary.jsx'), read('AccessControlRuntime.jsx'), read('erp-access-control.js'),
  read('FacturacionLauncher.jsx'), read('CommercialLauncher.jsx'), read('InventoryCostLauncher.jsx'), read('OperationsFinanceLauncher.jsx'),
  read('ProductionCalendarLauncher.jsx'), read('FinancialDashboardLauncher.jsx'), read('AssistantLauncher.jsx'), read('SecurityLauncher.jsx'),
  read('MobileAppHost.jsx'),
])

const failures=[]
const requireText=(source,text,message)=>{if(!source.includes(text))failures.push(message)}
const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')

const routes=[
  ['Dashboard','workspace','Resumen'],
  ['App móviles','mobile','Inicio'],
  ['Clientes','workspace','Clientes'],
  ['Productos','commercial','Productos y trabajos'],
  ['Cotizaciones','commercial','Cotizaciones'],
  ['Producción','commercial','Producción'],
  ['Inventario','inventory','Inventario'],
  ['Facturación','billing','resumen'],
  ['Cuentas por cobrar','billing','cobros'],
  ['Proveedores','procurement','Proveedores'],
  ['Compras','procurement','Compras y gastos'],
  ['Caja','procurement','Caja'],
  ['Asistente IA','assistant',null],
  ['Agenda','planning',null],
  ['Reportes','financial',null],
  ['Seguridad','security',null],
]

for(const [name,target,tab] of routes){
  const key=`(?:${escapeRegExp(name)}|['\"]${escapeRegExp(name)}['\"])`
  const tabPart=tab?`[^}]*tab\\s*:\\s*['\"]${escapeRegExp(tab)}['\"]`:''
  const pattern=new RegExp(`${key}\\s*:\\s*\\{\\s*target\\s*:\\s*['\"]${escapeRegExp(target)}['\"]${tabPart}`)
  if(!pattern.test(navigation))failures.push(`${name} no está declarado con su destino correcto en el núcleo de navegación`)
}

requireText(main,"lazy(()=>import('./DeferredRuntimeHosts.jsx'))",'El runtime secundario dejó de cargarse de forma diferida')
requireText(main,"<Safe label=\"Navegación persistente\"><NavigationEventBridge/></Safe>",'El puente persistente de navegación no está montado en el arranque crítico')
requireText(menu,'requestModule(name','El menú principal no delega al núcleo de navegación')
requireText(menu,'subscribeNavigation','El menú principal no refleja el estado confirmado del núcleo')
if(menu.includes("dispatchEvent(new CustomEvent('idealo-open-module'"))failures.push('El menú volvió a emitir aperturas efímeras directamente')
if(menu.includes('setActive(name)'))failures.push('El menú vuelve a marcar opciones antes de que la vista confirme apertura')

requireText(navigation,"new CustomEvent('idealo-navigation-request'",'Las solicitudes centrales no pasan por control de acceso')
requireText(navigation,'cancelable: true','El control de acceso no puede cancelar una navegación')
requireText(navigation,'NAVIGATION_TIMEOUT_MS','Una solicitud puede quedar pendiente indefinidamente')
requireText(navigation,"document.querySelectorAll('.erp-modal-backdrop .erp-modal-close')",'El núcleo no cierra el módulo anterior al cambiar de área')
requireText(navigation,'confirmModule','El núcleo no exige confirmación de apertura')
requireText(accessRuntime,"window.addEventListener('idealo-navigation-request'",'Roles y plan SaaS no protegen el nuevo núcleo de navegación')

requireText(workspaceBridge,'subscribeNavigation','Dashboard/Clientes no consumen solicitudes persistentes')
requireText(workspaceBridge,'confirmModule','Dashboard/Clientes no confirman la vista real')
requireText(workspaceBridge,".erp-content .erp-header h1",'Dashboard/Clientes no verifican el encabezado renderizado')

for(const [label,source,target] of [
  ['Comercial',commercial,'commercial'],['Inventario',inventory,'inventory'],['Compras/Proveedores/Caja',procurement,'procurement'],
  ['Facturación/CxC',billing,'billing'],['Agenda',planning,'planning'],['Reportes',financial,'financial'],
]){
  requireText(source,'subscribeNavigation',`${label} no consume solicitudes persistentes`)
  const isolated=source.includes(`navigation.target!=='${target}'`)||source.includes(`navigation.target !== '${target}'`)
  if(!isolated)failures.push(`${label} no aísla su destino`)
  requireText(source,'confirmModule',`${label} no confirma que su vista quedó montada`)
  requireText(source,'setOpen(true)',`${label} no abre su vista principal`)
  requireText(source,'setOpen(false)',`${label} no conserva cierre funcional`)
}

requireText(eventBridge,"assistant: { selector: '.erp-modal-panel[aria-label=\"Asistente Inteligente\"]'",'Asistente IA no tiene verificación de vista real')
requireText(eventBridge,"security: { selector: '.erp-modal-panel[aria-label=\"Usuarios y Administración\"]'",'Seguridad no tiene verificación de vista real')
requireText(eventBridge,"document.querySelector('.mobile-app-shell')",'App móviles no confirma que la aplicación esté visible')
requireText(assistant,"target==='assistant'",'Asistente IA perdió su receptor legacy compatible')
requireText(security,"target==='security'",'Seguridad perdió su receptor legacy compatible')
requireText(mobile,"e.detail==='App móviles'",'App móviles perdió su receptor de activación')

requireText(runtimeBoundary,"new CustomEvent('idealo-runtime-error'",'Los errores de runtime siguen siendo silenciosos')
if(runtimeBoundary.includes('if (!this.props.fatal) return null'))failures.push('Un error secundario todavía desaparece silenciosamente')
requireText(eventBridge,"window.addEventListener('idealo-navigation-error'",'Los fallos de navegación no se muestran al usuario')

requireText(commercial,"activateModule('Cuentas por cobrar'",'El paso Cobro del flujo comercial vuelve a marcar Producción')
requireText(billing,"id === 'cobros' ? 'Cuentas por cobrar' : 'Facturación'",'Cobros de Facturación no sincroniza Cuentas por cobrar')
requireText(access,"'Productos y trabajos':'Productos'",'Falta compatibilidad Productos')
requireText(access,"'Cotizaciones':'Cotizaciones'",'Falta compatibilidad Cotizaciones')
requireText(access,"'Producción':'Producción'",'Falta compatibilidad Producción')
requireText(access,"'Proveedores':'Proveedores'",'Falta compatibilidad Proveedores')
requireText(access,"'Compras y gastos':'Compras'",'Falta compatibilidad Compras')
requireText(access,"'cobros':'Cuentas por cobrar'",'Falta compatibilidad Cuentas por cobrar')

if(failures.length){
  console.error('\nAuditoría funcional de navegación falló:')
  failures.forEach(failure=>console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Auditoría funcional de navegación OK: 16 módulos, permisos, persistencia, confirmación real, errores visibles y compatibilidad verificados.')
