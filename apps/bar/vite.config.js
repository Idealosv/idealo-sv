import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function standaloneBarMenuNavigation(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'
  const replacements=[
    {
      label:'classification import',
      from:"import './idealo-bar-role-permissions.css'\n",
      to:"import './idealo-bar-role-permissions.css'\nimport {TOP_LEVEL_GROUPS,getSubgroupsForGroup,filterStandaloneMenu} from '../../bar/src/menuNavigation.js'\nimport '../../bar/src/menu-navigation.css'\n",
    },
    {
      label:'two-level state',
      from:" const [category,setCategory]=useState('Todos')\n const [query,setQuery]=useState('')",
      to:" const [category,setCategory]=useState('Todos')\n const [subcategory,setSubcategory]=useState('Todos')\n const [query,setQuery]=useState('')",
    },
    {
      label:'menu filtering',
      from:" const categories=useMemo(()=>['Todos',...new Set(menu.map(row=>row.category).filter(Boolean))],[menu])\n const filteredMenu=menu.filter(row=>{const label=(row.display_name||row.product?.name||'').toLowerCase();return(category==='Todos'||row.category===category)&&(!query.trim()||label.includes(query.trim().toLowerCase()))})",
      to:" const categories=TOP_LEVEL_GROUPS\n const subcategories=getSubgroupsForGroup(category)\n const filteredMenu=useMemo(()=>filterStandaloneMenu(menu,category,subcategory,query),[menu,category,subcategory,query])",
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
  plugins: [standaloneBarMenuNavigation(),react()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
})
