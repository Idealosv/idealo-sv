import { readFile } from 'node:fs/promises'

const quotes = await readFile(new URL('../src/Quotes360Module.jsx', import.meta.url), 'utf8')
const products = await readFile(new URL('../src/Products360Module.jsx', import.meta.url), 'utf8')
const clients = await readFile(new URL('../src/ClientModuleOrganizer.jsx', import.meta.url), 'utf8')

const failures = []

if (!quotes.includes("supabase.from('clients').select('*').eq('company_id',company.id)")) failures.push('Cotizaciones debe cargar clientes de la empresa')
if (!quotes.includes("supabase.from('finished_products').select('*').eq('company_id',company.id).eq('active',true)")) failures.push('Cotizaciones debe cargar productos activos de la empresa')
if (!quotes.includes('const chooseClient=id=>')) failures.push('Cotizaciones debe importar datos del cliente seleccionado')
for (const field of ['contact_name','contact_phone','contact_email','delivery_address']) if (!quotes.includes(field)) failures.push(`Cotizaciones no conserva ${field} del cliente`)
if (!quotes.includes('const chooseProduct=(idx,id)=>')) failures.push('Cotizaciones debe importar datos del producto seleccionado')
for (const field of ['unit_price','minimum_price','taxable','tax_rate','unit_cost','labor_unit_cost','installation_unit_cost','requires_production']) if (!quotes.includes(field)) failures.push(`Cotizaciones no conserva ${field} del producto`)
if (!products.includes("supabase.from('finished_products').insert(payload)")) failures.push('Productos debe permitir creación persistente')
if (!products.includes("'Producto creado correctamente. Ya puede usarse en cotizaciones.'")) failures.push('Productos debe confirmar disponibilidad para cotizaciones')
if (clients.includes('new MutationObserver')) failures.push('ClientModuleOrganizer no debe observar document.body continuamente')

if (failures.length) {
  console.error('\nAuditoría comercial falló:')
  failures.forEach(f => console.error(`- ${f}`))
  process.exit(1)
}
console.log('Auditoría comercial OK: Clientes → Productos → Cotizaciones conectado y sin observador global en Clientes.')
