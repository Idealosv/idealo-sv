export const ERP_MODULES=['Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Asistente IA','Agenda','Reportes','Seguridad']

export const ROLE_LABEL={owner:'Propietario',admin:'Administrador',staff:'Empleado',viewer:'Solo lectura'}

const ACCESS={
 owner:new Set(ERP_MODULES),
 admin:new Set(ERP_MODULES),
 staff:new Set(['Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Asistente IA','Agenda']),
 viewer:new Set(['Dashboard','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Agenda','Reportes'])
}

const TARGET_MODULE={workspace:'Dashboard',commercial:'Productos',inventory:'Inventario',billing:'Facturación',procurement:'Compras',assistant:'Asistente IA',planning:'Agenda',financial:'Reportes',security:'Seguridad'}
const TAB_MODULE={
 'Resumen':'Dashboard','Clientes':'Clientes','Productos y trabajos':'Productos','Cotizaciones':'Cotizaciones','Producción':'Producción','Inventario':'Inventario','resumen':'Facturación','Proveedores':'Proveedores','Compras y gastos':'Compras','Caja':'Caja'
}

export function canAccessModule(role,module){return Boolean(ACCESS[String(role||'').toLowerCase()]?.has(module))}
export function moduleFromOpenDetail(detail={}){return TAB_MODULE[detail.tab]||TARGET_MODULE[detail.target]||null}
export function isReadOnlyRole(role){return String(role||'').toLowerCase()==='viewer'}
export function allowedModules(role){return ERP_MODULES.filter(module=>canAccessModule(role,module))}
