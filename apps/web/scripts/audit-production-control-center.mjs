import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const src=resolve(here,'../src')
const [launcher,production,engine]=await Promise.all([
  readFile(resolve(src,'CommercialLauncher.jsx'),'utf8'),
  readFile(resolve(src,'Production360Module.jsx'),'utf8'),
  readFile(resolve(src,'productionEngine.js'),'utf8'),
])
const failures=[]
const need=(source,text,message)=>{if(!source.includes(text))failures.push(message)}

need(launcher,"import Production360Module from './Production360Module.jsx'",'Producción debe importar el módulo 360 simplificado')
need(launcher,"tab==='Producción'&&<Production360Module",'Producción debe montar el módulo 360 simplificado')
need(production,"supabase.from('work_orders').select('*,clients(name,phone),work_order_items(*)')",'Producción debe cargar órdenes con cliente y partidas')
need(production,"supabase.from('employees')",'Producción debe cargar responsables activos')
need(production,"supabase.rpc('transition_work_order_status'",'Producción debe cambiar estados mediante RPC controlado')
need(production,".eq('company_id',company.id)",'Las consultas de Producción deben aislarse por company_id')
for(const marker of ['activas','atrasadas','listas','Responsable','Fecha de entrega','Qué hay que producir','Más detalles'])need(production,marker,`Falta control operativo de Producción: ${marker}`)
for(const marker of ['PRODUCTION_STAGES','NEXT_STAGE','productionMetrics','visibleProductionStatus'])need(engine,marker,`El motor de Producción no conserva ${marker}`)
need(production,'Al iniciar producción, los materiales reservados se consumen automáticamente','Producción debe advertir el consumo automático de materiales')

if(failures.length){console.error('\nAuditoría de Producción falló:');failures.forEach(x=>console.error(`- ${x}`));process.exit(1)}
console.log('Auditoría Producción OK: órdenes, responsables, estados, fechas, materiales y flujo simplificado conectados.')
