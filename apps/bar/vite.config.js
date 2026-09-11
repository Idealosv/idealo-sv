import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import standaloneBarHomeDashboard from './homeDashboardPluginV2.js'
import standaloneBarOrdersDashboard from './ordersDashboardPlugin.js'
import standaloneBarReservationsDashboard from './reservationsDashboardPluginV2.js'
import standaloneBarOperationLoadSafety from './operationLoadSafetyPlugin.js'

function standaloneBarReservationStyles(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'
  return{
    name:'idealo-bar-standalone-reservations-styles',
    enforce:'pre',
    transform(code,id){
      const normalized=id.split('?')[0].replace(/\\/g,'/')
      if(!normalized.endsWith(target))return null
      return{code:"import '../../bar/src/reservations-dashboard.css'\n"+code,map:null}
    },
  }
}

function standaloneBarMenuNavigation(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'
  const replacements=[
    {
      label:'classification import',
      from:"import './idealo-bar-role-permissions.css'\n",
      to:"import './idealo-bar-role-permissions.css'\nimport {TOP_LEVEL_GROUPS,getSubgroupsForGroup,filterStandaloneMenu,buildMenuPopularity} from '../../bar/src/menuNavigation.js'\nimport '../../bar/src/menu-navigation.css'\n",
    },
    {
      label:'two-level state',
      from:" const [category,setCategory]=useState('Todos')\n const [query,setQuery]=useState('')",
      to:" const [category,setCategory]=useState('Todos')\n const [subcategory,setSubcategory]=useState('Todos')\n const [query,setQuery]=useState('')",
    },
    {
      label:'batched product loading',
      from:"    let products=[]\n    if(productIds.length){const productRes=await supabase.from('finished_products').select('id,name,sale_price,sku,active').in('id',productIds);if(productRes.error)throw productRes.error;products=productRes.data||[]}",
      to:"    let products=[]\n    if(productIds.length){\n     const batchSize=120\n     for(let start=0;start<productIds.length;start+=batchSize){\n      const batch=productIds.slice(start,start+batchSize)\n      const productRes=await supabase.from('finished_products').select('id,name,sale_price,sku,active').in('id',batch)\n      if(productRes.error)throw productRes.error\n      products.push(...(productRes.data||[]))\n     }\n    }",
    },
    {
      label:'twenty table fallback',
      from:"  const payload=Array.from({length:12},(_,i)=>({company_id:companyId,name:`Mesa ${String(i+1).padStart(2,'0')}`,area:'Salón',capacity:4,sort_order:i+1,status:'available'}))",
      to:"  const payload=Array.from({length:20},(_,i)=>({company_id:companyId,name:`Mesa ${i+1}`,area:'Salón',capacity:4,sort_order:i+1,status:'available'}))",
    },
    {
      label:'table count badge',
      from:'<small>Salón</small><strong>Mesas</strong>',
      to:'<small>Salón</small><strong>Mesas <span className="barops-table-count">{tables.length}</span></strong>',
    },
    {
      label:'menu filtering',
      from:" const categories=useMemo(()=>['Todos',...new Set(menu.map(row=>row.category).filter(Boolean))],[menu])\n const filteredMenu=menu.filter(row=>{const label=(row.display_name||row.product?.name||'').toLowerCase();return(category==='Todos'||row.category===category)&&(!query.trim()||label.includes(query.trim().toLowerCase()))})",
      to:" const categories=TOP_LEVEL_GROUPS\n const subcategories=getSubgroupsForGroup(category)\n const menuPopularity=useMemo(()=>buildMenuPopularity(items,orders),[items,orders])\n const filteredMenu=useMemo(()=>filterStandaloneMenu(menu,category,subcategory,query,menuPopularity),[menu,category,subcategory,query,menuPopularity])",
    },
    {
      label:'global search',
      from:'<div className="barops-search"><input placeholder="Buscar cerveza, comida, combo…" value={query} onChange={e=>setQuery(e.target.value)}/></div>',
      to:'<div className="barops-search barops-search-global"><input placeholder="Buscar en toda la carta…" value={query} onChange={e=>setQuery(e.target.value)}/>{query.trim()&&<span>Búsqueda global</span>}</div>',
    },
    {
      label:'two-level navigation',
      from:'<div className="barops-categories">{categories.map(c=><button key={c} className={category===c?\'active\':\'\'} onClick={()=>setCategory(c)}>{c}</button>)}</div>',
      to:'<div className="barops-categories barops-categories-primary" aria-label="Grupos de productos">{categories.map(c=><button key={c} className={category===c?\'active\':\'\'} onClick={()=>{setCategory(c);setSubcategory(\'Todos\')}}>{c}</button>)}</div>{subcategories.length>0&&<div className="barops-subcategory-wrap"><small>{category}</small><div className="barops-categories barops-categories-secondary" aria-label={`Subcategorías de ${category}`}>{subcategories.map(c=><button key={c} className={subcategory===c?\'active\':\'\'} onClick={()=>setSubcategory(c)}>{c}</button>)}</div></div>}',
    },
  ]

  return{
    name:'idealo-bar-standalone-menu-navigation',
    enforce:'pre',
    transform(code,id){
      const normalized=id.split('?')[0].replace(/\\/g,'/')
      if(!normalized.endsWith(target))return null
      let next=code
      for(const patch of replacements){
        if(!next.includes(patch.from))throw new Error(`[IDEALO BAR] No se encontró el punto de integración: ${patch.label}`)
        next=next.replace(patch.from,patch.to)
      }
      return{code:next,map:null}
    },
  }
}

export default defineConfig({
  plugins: [standaloneBarReservationStyles(),standaloneBarMenuNavigation(),standaloneBarOrdersDashboard(),standaloneBarHomeDashboard(),standaloneBarReservationsDashboard(),standaloneBarOperationLoadSafety(),react()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
})
