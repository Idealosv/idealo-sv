export const ERP_MODULES=['Dashboard','Clientes','Comercial','Inventario','Facturación','Abastecimiento','Caja','Agenda','Reportes','Asistente IA','Seguridad']

export const ROLE_LABEL={owner:'Propietario',admin:'Administrador',staff:'Empleado',viewer:'Solo lectura'}

const MODULE_ALIAS={
 'Productos':'Comercial','Cotizaciones':'Comercial','Producción':'Comercial','Comercial':'Comercial',
 'Proveedores':'Abastecimiento','Compras':'Abastecimiento','Abastecimiento':'Abastecimiento',
 'App móviles':'Dashboard','Resumen':'Dashboard',
}

const ACCESS={
 owner:new Set(ERP_MODULES),
 admin:new Set(ERP_MODULES),
 staff:new Set(['Dashboard','Clientes','Comercial','Inventario','Facturación','Abastecimiento','Asistente IA','Agenda']),
 viewer:new Set(['Dashboard','Clientes','Comercial','Inventario','Facturación','Abastecimiento','Caja','Agenda','Reportes'])
}

const TARGET_MODULE={workspace:'Dashboard',commercial:'Comercial',inventory:'Inventario',billing:'Facturación',procurement:'Abastecimiento',assistant:'Asistente IA',planning:'Agenda',financial:'Reportes',security:'Seguridad'}
const TAB_MODULE={
 'Resumen':'Dashboard','Clientes':'Clientes',
 'Productos y trabajos':'Comercial','Cotizaciones':'Comercial','Operación':'Comercial','Órdenes de trabajo':'Comercial','Producción':'Comercial','Entregas':'Comercial','Cuentas por cobrar':'Comercial',
 'Inventario':'Inventario','resumen':'Facturación','emitir':'Facturación','documentos':'Facturación','cobros':'Facturación','hacienda':'Facturación',
 'Control':'Abastecimiento','Proveedores':'Abastecimiento','Compras':'Abastecimiento','Compras y gastos':'Abastecimiento','Reposición':'Abastecimiento','Recepción':'Abastecimiento','Cuentas por pagar':'Abastecimiento','Caja':'Caja'
}

export function normalizeModule(module){return MODULE_ALIAS[module]||module}
export function canAccessModule(role,module){return Boolean(ACCESS[String(role||'').toLowerCase()]?.has(normalizeModule(module)))}
export function moduleFromOpenDetail(detail={}){return TAB_MODULE[detail.tab]||TARGET_MODULE[detail.target]||null}
export function isReadOnlyRole(role){return String(role||'').toLowerCase()==='viewer'}
export function allowedModules(role){return ERP_MODULES.filter(module=>canAccessModule(role,module))}
