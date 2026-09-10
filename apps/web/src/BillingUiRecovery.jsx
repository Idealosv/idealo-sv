import { useEffect } from 'react'

const GENERIC_ERROR = 'Ocurrió un error inesperado.'

function normalizeText(node){
  return String(node?.textContent || '').replace(/\s+/g,' ').trim()
}

function reconcileModal(modal){
  if(!modal?.isConnected) return

  modal.querySelectorAll('.billing-classic-summary button[type="submit"]').forEach(button=>{
    const label=normalizeText(button)
    if(label.includes('Crédito Fiscal')) button.classList.add('billing-orange-submit')
    else button.classList.remove('billing-orange-submit')
  })

  modal.querySelectorAll('.feedback.error').forEach(banner=>{
    if(normalizeText(banner)!==GENERIC_ERROR) return
    const hasLoadedSource=[...modal.querySelectorAll('.billing-context-banner')]
      .some(node=>normalizeText(node).includes('Origen cargado:'))
    const ready=[...modal.querySelectorAll('.feedback.success')]
      .some(node=>normalizeText(node).includes('Documento listo para guardar'))
    const shouldHide=hasLoadedSource&&ready

    banner.hidden=shouldHide
    if(shouldHide) banner.setAttribute('aria-hidden','true')
    else banner.removeAttribute('aria-hidden')
  })
}

export default function BillingUiRecovery(){
  useEffect(()=>{
    let frame=null

    const reconcile=()=>{
      frame=null
      document.querySelectorAll('.billing-modal').forEach(reconcileModal)
    }

    const schedule=()=>{
      if(frame!==null) return
      frame=window.requestAnimationFrame(reconcile)
    }

    const onBillingInteraction=(event)=>{
      const target=event.target
      if(!(target instanceof Element)||!target.closest('.billing-modal')) return
      schedule()
    }

    schedule()
    window.addEventListener('idealo-module-change',schedule)
    window.addEventListener('idealo-open-module',schedule)
    window.addEventListener('idealo-billing-view-change',schedule)
    document.addEventListener('click',onBillingInteraction,true)
    document.addEventListener('change',onBillingInteraction,true)

    return()=>{
      if(frame!==null) window.cancelAnimationFrame(frame)
      window.removeEventListener('idealo-module-change',schedule)
      window.removeEventListener('idealo-open-module',schedule)
      window.removeEventListener('idealo-billing-view-change',schedule)
      document.removeEventListener('click',onBillingInteraction,true)
      document.removeEventListener('change',onBillingInteraction,true)
    }
  },[])

  return null
}
