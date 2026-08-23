import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const SEARCH_SELECTORS = [
  'tbody tr','.product360-row','.client-row','.inventory-row','.quote-row','.supplier-row','.purchase-row','.cash-row','.processed-dte-row','.dte-row','.timeline-item',
]

const SEARCHABLE_MODULES = new Set(['Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Agenda','Reportes'])

const RELATED = {
  Dashboard:['Clientes','Facturación','Caja','Reportes'],
  Clientes:['Cotizaciones','Facturación','Agenda'],
  Productos:['Cotizaciones','Inventario','Producción'],
  Cotizaciones:['Clientes','Productos','Producción','Facturación'],
  Producción:['Cotizaciones','Productos','Inventario'],
  Inventario:['Productos','Compras','Producción'],
  Facturación:['Clientes','Cotizaciones','Caja','Reportes'],
  Proveedores:['Compras','Inventario','Caja'],
  Compras:['Proveedores','Inventario','Caja'],
  Caja:['Facturación','Compras','Reportes'],
  Agenda:['Clientes','Cotizaciones'],
  Reportes:['Facturación','Caja','Dashboard'],
}

const uniqueCandidates=(panel)=>{const set=new Set();SEARCH_SELECTORS.forEach(selector=>panel.querySelectorAll(selector).forEach(node=>set.add(node)));return[...set].filter(node=>!node.closest('.erp-global-search'))}
const visiblePanel=()=>{const panels=[...document.querySelectorAll('.erp-modal-panel')].filter(item=>item.offsetParent!==null);return panels[panels.length-1]||null}

export default function ErpUxCoordinator(){
  const [activeModule,setActiveModule]=useState('Dashboard')
  const [panel,setPanel]=useState(null)
  const [query,setQuery]=useState('')
  const [candidateCount,setCandidateCount]=useState(0)

  useEffect(()=>{
    let timers=[]
    const detect=()=>{
      const nextPanel=visiblePanel()
      setPanel(current=>current===nextPanel?current:nextPanel)
      const nextCount=nextPanel?uniqueCandidates(nextPanel).length:0
      setCandidateCount(current=>current===nextCount?current:nextCount)
    }
    const schedule=()=>{
      timers.forEach(window.clearTimeout)
      timers=[0,80,250].map(delay=>window.setTimeout(detect,delay))
    }
    const onModule=(event)=>{setActiveModule(event.detail||'Dashboard');setQuery('');schedule()}
    const onClick=(event)=>{
      if(event.target.closest('.idealo-main-menu-item,.erp-modal-close,.billing-nav-item,.commercial-tabs button,.inventory-tabs button')) schedule()
    }
    schedule()
    window.addEventListener('idealo-module-change',onModule)
    document.addEventListener('click',onClick)
    return()=>{
      timers.forEach(window.clearTimeout)
      window.removeEventListener('idealo-module-change',onModule)
      document.removeEventListener('click',onClick)
    }
  },[])

  useEffect(()=>{
    if(!panel)return
    const candidates=uniqueCandidates(panel)
    const nextCount=candidates.length
    setCandidateCount(current=>current===nextCount?current:nextCount)
    const normalized=query.trim().toLowerCase()
    candidates.forEach(node=>{
      const matches=!normalized||node.textContent.toLowerCase().includes(normalized)
      node.dataset.erpFiltered=matches?'0':'1'
      node.style.display=matches?'':'none'
    })
    return()=>candidates.forEach(node=>{delete node.dataset.erpFiltered;node.style.display=''})
  },[panel,query])

  if(!panel)return null
  const head=panel.querySelector('.erp-modal-head')
  if(!head)return null
  const related=RELATED[activeModule]||[]
  const showSearch=SEARCHABLE_MODULES.has(activeModule)
  const openRelated=(name)=>{
    if(!name)return
    const button=[...document.querySelectorAll('.idealo-main-menu-item')].find(item=>item.textContent.trim()===name)
    if(!button)return
    panel.querySelector('.erp-modal-close')?.click()
    window.setTimeout(()=>button.click(),40)
  }

  return createPortal(<div className="erp-global-tools">
    {showSearch&&<label className="erp-global-search"><span>Buscar</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={`Buscar en ${activeModule.toLowerCase()}…`}/><small>{candidateCount?`${candidateCount} registro${candidateCount===1?'':'s'}`:'Buscador listo'}</small></label>}
    {related.length>0&&<select className="erp-related-select" value="" onChange={event=>openRelated(event.target.value)} aria-label="Ir a módulo relacionado"><option value="">Ir a módulo…</option>{related.map(name=><option value={name} key={name}>{name}</option>)}</select>}
  </div>,head)
}
