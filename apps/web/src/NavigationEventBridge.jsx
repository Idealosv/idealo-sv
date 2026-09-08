import { useEffect } from 'react'
import { confirmModule, failModule, getNavigationState, requestFromTargetDetail, subscribeNavigation } from './erp-navigation.js'

const LEGACY_TARGETS = {
  assistant: { selector: '.erp-modal-panel[aria-label="Asistente Inteligente"]' },
  security: { selector: '.erp-modal-panel[aria-label="Usuarios y Administración"]' },
}
const RETRIES=[0,80,180,350,700,1200,2000,3500,5200]

export default function NavigationEventBridge() {
  useEffect(() => {
    const onOpen = (event) => {
      const detail = event.detail || {}
      if (!detail.target || detail.source === 'navigation-kernel') return
      requestFromTargetDetail(detail)
    }
    window.addEventListener('idealo-open-module', onOpen)
    return () => window.removeEventListener('idealo-open-module', onOpen)
  }, [])

  useEffect(() => subscribeNavigation((navigation) => {
    if (navigation.status !== 'requested') return
    const { requestId, requestedModule, target, tab, context = {} } = navigation

    if (target === 'mobile') {
      RETRIES.forEach((delay) => window.setTimeout(() => {
        const current=getNavigationState()
        if(current.requestId!==requestId||current.status!=='requested')return
        window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'App móviles'}))
        window.requestAnimationFrame(()=>{
          if(document.querySelector('.mobile-app-shell'))confirmModule(requestId,requestedModule)
        })
      },delay))
      return
    }

    const legacy = LEGACY_TARGETS[target]
    if (!legacy) return
    RETRIES.forEach((delay) => window.setTimeout(() => {
      const current=getNavigationState()
      if(current.requestId!==requestId||current.status!=='requested')return
      window.dispatchEvent(new CustomEvent('idealo-open-module', {
        detail: { target, tab, ...context, source: 'navigation-kernel' },
      }))
      window.requestAnimationFrame(()=>{
        if(document.querySelector(legacy.selector))confirmModule(requestId,requestedModule)
      })
    },delay))
  }), [])

  useEffect(() => {
    const onNavigationError = (event) => showNavigationError(event.detail?.message || 'No se pudo abrir el módulo solicitado.')
    const onRuntimeError = (event) => {
      const navigation=getNavigationState()
      const message=event.detail?.message||`Falló ${event.detail?.label||'un módulo del ERP'}.`
      if(navigation.status==='requested')failModule(navigation.requestId,navigation.requestedModule,message)
      else showNavigationError(message)
    }
    window.addEventListener('idealo-navigation-error',onNavigationError)
    window.addEventListener('idealo-runtime-error',onRuntimeError)
    return()=>{
      window.removeEventListener('idealo-navigation-error',onNavigationError)
      window.removeEventListener('idealo-runtime-error',onRuntimeError)
    }
  },[])

  return null
}

function showNavigationError(message){
  let box=document.getElementById('idealo-navigation-toast')
  if(!box){box=document.createElement('div');box.id='idealo-navigation-toast';box.setAttribute('role','alert');document.body.appendChild(box)}
  box.textContent=message
  box.classList.add('show')
  window.clearTimeout(box._timer)
  box._timer=window.setTimeout(()=>box.classList.remove('show'),6000)
}
