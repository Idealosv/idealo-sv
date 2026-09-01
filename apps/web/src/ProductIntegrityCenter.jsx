import { useEffect, useMemo, useState } from 'react'
import './product-integrity-center.css'

const num = value => Number(value || 0)
const money = value => new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(num(value))
const statusOf = row => row.status || (row.active ? 'ACTIVE' : 'INACTIVE')

export default function ProductIntegrityCenter({ company, supabase }) {
  const [products,setProducts]=useState([])
  const [variants,setVariants]=useState([])
  const [tiers,setTiers]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=async()=>{
    setLoading(true);setError('')
    const [p,v,t]=await Promise.all([
      supabase.from('finished_products').select('id,sku,name,status,active,sale_price,minimum_price,cost_estimate,labor_cost,installation_cost,price_per_m2,width,height,taxable,tax_rate,requires_production,estimated_minutes,lead_time_days').eq('company_id',company.id).order('name'),
      supabase.from('product_variants').select('id,product_id,name,sku,sale_price,cost_estimate,active').eq('company_id',company.id),
      supabase.from('product_price_tiers').select('id,product_id,min_quantity,max_quantity,unit_price,active').eq('company_id',company.id),
    ])
    const firstError=p.error||v.error||t.error
    if(firstError)setError(firstError.message)
    setProducts(p.data||[]);setVariants(v.data||[]);setTiers(t.data||[]);setLoading(false)
  }
  useEffect(()=>{load()},[company.id])

  const issues=useMemo(()=>{
    const rows=[]
    for(const p of products){
      if(statusOf(p)!=='ACTIVE')continue
      const cost=num(p.cost_estimate)+num(p.labor_cost)+num(p.installation_cost)
      const margin=num(p.sale_price)>0?((num(p.sale_price)-cost)/num(p.sale_price))*100:0
      const push=(code,level,text)=>rows.push({id:`${code}-${p.id}`,group:`product-${p.id}`,level,product:p.name,text})
      if(num(p.sale_price)<=0)push('price','critical','Sin precio de venta')
      if(cost<=0)push('cost','warning','Sin costo estimado; el margen no es confiable')
      if(num(p.minimum_price)>num(p.sale_price)&&num(p.sale_price)>0)push('min','critical','El precio mínimo supera el precio de venta')
      if(margin<0)push('margin','critical',`Margen negativo (${margin.toFixed(1)}%)`)
      if(p.taxable!==false&&num(p.tax_rate)<=0)push('tax','warning','Gravado pero sin tasa de impuesto válida')
      if(num(p.price_per_m2)>0&&!(num(p.width)>0&&num(p.height)>0))push('area','warning','Precio por m² sin ancho o alto')
      if(p.requires_production&&!(num(p.estimated_minutes)>0))push('time','warning','Falta tiempo estimado de producción')
      if(p.requires_production&&p.lead_time_days==null)push('lead','warning','Falta plazo estimado de entrega')
    }
    for(const v of variants.filter(x=>x.active!==false)){
      const push=(code,level,text)=>rows.push({id:`${code}-${v.id}`,group:`variant-${v.id}`,level,product:v.name||'Variante',text})
      if(!String(v.name||'').trim())push('variant-name','critical','Variante activa sin nombre')
      if(v.sale_price!=null&&num(v.sale_price)<0)push('variant-price','critical','Precio de variante negativo')
      if(v.cost_estimate!=null&&num(v.cost_estimate)<0)push('variant-cost','critical','Costo de variante negativo')
    }
    for(const t of tiers.filter(x=>x.active!==false)){
      const push=(code,level,text)=>rows.push({id:`${code}-${t.id}`,group:`tier-${t.id}`,level,product:'Escala de precio',text})
      if(!(num(t.min_quantity)>0))push('tier-min','critical','Cantidad mínima inválida')
      if(t.max_quantity!=null&&num(t.max_quantity)<num(t.min_quantity))push('tier-range','critical','Rango invertido')
      if(!(num(t.unit_price)>0))push('tier-price','critical','Sin precio unitario válido')
    }
    return rows
  },[products,variants,tiers])

  const groupedIssues=useMemo(()=>{
    const groups=new Map()
    for(const issue of issues){
      const current=groups.get(issue.group)
      if(!current){
        groups.set(issue.group,{id:issue.group,product:issue.product,level:issue.level,texts:[issue.text]})
        continue
      }
      current.texts.push(issue.text)
      if(issue.level==='critical')current.level='critical'
    }
    return [...groups.values()].map(group=>({...group,text:group.texts.join(' · ')}))
  },[issues])

  const stats=useMemo(()=>{
    const active=products.filter(p=>statusOf(p)==='ACTIVE')
    const costed=active.filter(p=>num(p.cost_estimate)+num(p.labor_cost)+num(p.installation_cost)>0)
    const avgMargin=costed.length?costed.reduce((sum,p)=>{const cost=num(p.cost_estimate)+num(p.labor_cost)+num(p.installation_cost);return sum+((num(p.sale_price)-cost)/Math.max(num(p.sale_price),.01))*100},0)/costed.length:0
    return {total:products.length,active:active.length,variants:variants.length,tiers:tiers.length,issues:groupedIssues.length,avgMargin}
  },[products,variants,tiers,groupedIssues])

  if(loading)return <section className="product-integrity"><span>Revisando integridad del catálogo…</span></section>
  return <section className="product-integrity" aria-label="Control de integridad de productos">
    <div className="product-integrity-head"><div><small>CONTROL DE CATÁLOGO</small><h3>Integridad de Productos 360</h3><p>Detecta precios, costos, márgenes y configuraciones que pueden afectar cotizaciones o producción.</p></div><button type="button" onClick={load}>Actualizar</button></div>
    {error&&<p className="product-integrity-error">{error}</p>}
    <div className="product-integrity-kpis"><b>{stats.active}<small>Activos</small></b><b>{stats.variants}<small>Variantes</small></b><b>{stats.tiers}<small>Escalas</small></b><b>{stats.avgMargin.toFixed(1)}%<small>Margen medio</small></b><b className={stats.issues?'attention':''}>{stats.issues}<small>Productos con alertas</small></b></div>
    {!groupedIssues.length?<div className="product-integrity-ok"><strong>Catálogo consistente</strong><span>No se detectaron problemas críticos en productos activos, variantes ni escalas.</span></div>:<div className="product-integrity-list">{groupedIssues.slice(0,12).map(issue=><article key={issue.id} className={issue.level}><div><strong>{issue.product}</strong><span>{issue.text}</span></div></article>)}</div>}
    <div className="product-integrity-foot">Valor de catálogo activo: {money(products.filter(p=>statusOf(p)==='ACTIVE').reduce((s,p)=>s+num(p.sale_price),0))} · {stats.total} producto(s) registrados.</div>
  </section>
}
