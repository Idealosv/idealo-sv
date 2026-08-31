import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const read=(relative)=>fs.readFileSync(path.resolve(here,relative),'utf8')
const files={
 workspace:read('../src/Workspace.jsx'),
 quotes:read('../src/QuotesQuickModule.jsx'),
 production:read('../src/ProductionControlCenter.jsx'),
 clients:read('../src/Client360CrudPanel.jsx'),
 products:read('../src/Products360Module.jsx'),
 inventory:read('../src/InventoryControlCenter.jsx'),
 billing:read('../src/Billing360Dashboard.jsx'),
 cash:read('../src/CashControlCenter.jsx'),
 reports:read('../src/FinancialReportsCenter.jsx'),
 demo:read('../src/AgencyDemoGuard.jsx'),
 migration:read('../../../supabase/migrations/20260831200500_work_order_quote_uniqueness.sql'),
}

const checks=[
 ['cotizaciones usa cliente y productos reales por empresa',files.quotes.includes("from('clients')")&&files.quotes.includes("from('finished_products')")&&files.quotes.includes("eq('company_id',company.id)")],
 ['cotización aprobada se convierte en orden de trabajo',files.quotes.includes("form.status!=='APPROVED'")&&files.quotes.includes("from('work_orders').insert")],
 ['base impide más de una orden por cotización',files.migration.includes('create unique index if not exists work_orders_one_per_quote_idx')&&files.migration.includes('on public.work_orders(quote_id)')],
 ['producción muestra atrasos materiales calidad pérdida y carga', ['Atrasadas','Bloqueadas material','Calidad pendiente','Trabajos con pérdida','Carga pendiente'].every(x=>files.production.includes(x))],
 ['clientes 360 está disponible',files.clients.includes("from('clients')")||files.clients.includes('clients')],
 ['productos 360 está disponible',files.products.includes('finished_products')],
 ['inventario expone control operativo',files.inventory.includes('Inventario')||files.inventory.includes('inventory')],
 ['facturación 360 está disponible',files.billing.includes('Facturación')||files.billing.includes('Billing')||files.billing.includes('DTE')],
 ['caja expone control operativo',files.cash.includes('Caja')||files.cash.includes('cash')],
 ['reportes financieros están disponibles',files.reports.includes('Report')||files.reports.includes('reporte')||files.reports.includes('Flujo')],
 ['workspace conserva empresa autenticada y selección de módulo',files.workspace.includes("rpc('get_my_companies')")&&files.workspace.includes("useState('Resumen')")],
 ['demo guía recorrido comercial completo', ['Clientes','Productos','Cotizaciones','Producción','Facturación'].every(x=>files.demo.includes(x))],
 ['demo mantiene DTE producción bloqueado',files.demo.includes('DTE PRODUCCIÓN BLOQUEADO')],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('FALLA auditoría comercial:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log(`OK preparación comercial: ${checks.length} controles PASS.`)
