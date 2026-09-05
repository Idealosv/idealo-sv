import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const need=(s,t)=>{if(!s.includes(t))throw new Error(`Falta: ${t}`)}
const center=read('apps/web/src/ProductIntegrityCenter.jsx')
;[
  'finished_products','product_variants','product_price_tiers','company_id',
  "if(num(p.sale_price)<=0)push('price','critical','Sin precio de venta')",
  "if(cost<=0)push('cost','warning','Sin costo estimado; el margen no es confiable')",
  "if(margin<0)push('margin','critical'",
  "if(t.max_quantity!=null&&num(t.max_quantity)<num(t.min_quantity))push('tier-range','critical','Rango invertido')",
].forEach(t=>need(center,t))
if(center.includes('setInterval('))throw new Error('Polling continuo no permitido en Productos')
const launcher=read('apps/web/src/CommercialLauncher.jsx')
need(launcher,'ProductIntegrityCenter')
need(launcher,'Products360Module')
const quotes=read('apps/web/src/Quotes360Module.jsx')
need(quotes,".eq('active',true)")
need(quotes,'tierPrice(')
const products=read('apps/web/src/Products360Module.jsx')
;['minimum_price','cost_estimate','labor_cost','installation_cost','requires_production','product_variants','product_price_tiers'].forEach(t=>need(products,t))
console.log('OK Productos 360: integridad y flujo comercial protegidos.')
