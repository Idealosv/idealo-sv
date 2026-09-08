import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const src=resolve(here,'../src')
const [launcher,center,main]=await Promise.all([
  readFile(resolve(src,'CommercialLauncher.jsx'),'utf8'),
  readFile(resolve(src,'ProductionControlCenter.jsx'),'utf8'),
  readFile(resolve(src,'main.jsx'),'utf8'),
])
const failures=[]
const need=(source,text,message)=>{if(!source.includes(text))failures.push(message)}
need(launcher,"import ProductionControlCenter from './ProductionControlCenter.jsx'",'Producción debe importar el centro de control')
need(launcher,'<ProductionControlCenter company={company} supabase={supabase}/>','Producción debe montar el centro de control')
need(main,"import './production-control-center.css'",'Debe cargar estilos del centro de producción')
for(const table of ['work_orders','production_material_requirements','quality_incidents','work_order_costs','inventory_movements','deliveries','production_tasks'])need(center,`.from('${table}')`,`Centro de producción debe consultar ${table}`)
for(const marker of ['Atrasadas','Bloqueadas material','Calidad pendiente','Trabajos con pérdida','Vencen en 72 h','Sin responsable','Carga pendiente'])need(center,marker,`Falta indicador operativo: ${marker}`)
need(center,".eq('company_id',company.id)",'Las consultas deben aislar por company_id')
need(center,"openModule('planning')",'Debe permitir abrir Agenda desde Producción')
if(failures.length){console.error('\nAuditoría de Producción falló:');failures.forEach(x=>console.error(`- ${x}`));process.exit(1)}
console.log('Auditoría Producción OK: control operativo, riesgos, costos, materiales, calidad y entregas conectados.')
