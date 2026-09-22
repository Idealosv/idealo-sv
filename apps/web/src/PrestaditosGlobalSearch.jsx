import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPrestaditosSearchResults } from './prestaditos-search.js'

const ICONS={Inversionista:'I',Solicitud:'S',Inversión:'$',Contrato:'C',Pago:'P',Documento:'D',Beneficiario:'B'}

export default function PrestaditosGlobalSearch({
 investors,
 applications,
 investments,
 contracts,
 payments,
 documents,
 beneficiaries,
 onChoose,
}){
 const [query,setQuery]=useState('')
 const [open,setOpen]=useState(false)
 const [active,setActive]=useState(0)
 const root=useRef(null)

 const results=useMemo(()=>buildPrestaditosSearchResults({
  query,investors,applications,investments,contracts,payments,documents,beneficiaries,
 }),[query,investors,applications,investments,contracts,payments,documents,beneficiaries])

 useEffect(()=>{setActive(0);setOpen(query.trim().length>=2)},[query])
 useEffect(()=>{
  const handler=e=>{if(root.current&&!root.current.contains(e.target))setOpen(false)}
  document.addEventListener('mousedown',handler)
  return()=>document.removeEventListener('mousedown',handler)
 },[])

 const choose=row=>{
  if(!row)return
  onChoose?.(row)
  setQuery('')
  setOpen(false)
 }

 const keyDown=e=>{
  if(e.key==='Escape'){setOpen(false);return}
  if(!open||!results.length)return
  if(e.key==='ArrowDown'){e.preventDefault();setActive(value=>(value+1)%results.length)}
  if(e.key==='ArrowUp'){e.preventDefault();setActive(value=>(value-1+results.length)%results.length)}
  if(e.key==='Enter'){e.preventDefault();choose(results[active])}
 }

 return <div className="prst-global-search" ref={root}>
  <div className="prst-global-search-input">
   <span aria-hidden="true">⌕</span>
   <input
    value={query}
    onChange={e=>setQuery(e.target.value)}
    onFocus={()=>query.trim().length>=2&&setOpen(true)}
    onKeyDown={keyDown}
    placeholder="Buscar nombre, DUI, inversión, contrato, pago o documento"
    aria-label="Buscar en Prestadito$"
   />
   {query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpiar búsqueda">×</button>}
  </div>
  {open&&<div className="prst-global-search-results">
   <div className="prst-global-search-head"><b>{results.length} resultado{results.length===1?'':'s'}</b><span>Enter para abrir · ↑↓ para navegar</span></div>
   {!results.length?<div className="prst-global-search-empty">No encontramos coincidencias con “{query}”.</div>:results.map((row,index)=><button
    type="button"
    key={row.type+'-'+row.id}
    className={index===active?'active':''}
    onClick={()=>choose(row)}
    onMouseEnter={()=>setActive(index)}
   >
    <span className="prst-search-icon">{ICONS[row.type]||'•'}</span>
    <span className="prst-search-copy"><b>{row.title}</b><small>{row.subtitle}</small></span>
    <span className="prst-search-type">{row.type}</span>
   </button>)}
  </div>}
 </div>
}
