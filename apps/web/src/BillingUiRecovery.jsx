import { useEffect } from 'react'

const GENERIC_ERROR = 'Ocurrió un error inesperado.'

function normalizeText(node){
  return String(node?.textContent || '').replace(/\s+/g,' ').trim()
}

export default function BillingUiRecovery(){
  useEffect(()=>{
    const reconcile=()=>{
      document.querySelectorAll('.billing-classic-summary button[type="submit"]').forEach(button=>{
        const label=normalizeText(button)
        if(label.includes('Crédito Fiscal')) button.classList.add('billing-orange-submit')
        else button.classList.remove('billing-orange-submit')
      })

      document.querySelectorAll('.billing-modal .feedback.error, .facturacion-dte .feedback.error').forEach(banner=>{
        if(normalizeText(banner)!==GENERIC_ERROR) return
        const modal=banner.closest('.billing-modal') || document
        const hasLoadedSource=[...modal.querySelectorAll('.billing-context-banner')].some(node=>normalizeText(node).includes('Origen cargado:'))
        const ready=[...modal.querySelectorAll('.feedback.success')].some(node=>normalizeText(node).includes('Documento listo para guardar'))
        if(hasLoadedSource && ready){
          banner.hidden=true
          banner.setAttribute('aria-hidden','true')
        }
      })
    }

    reconcile()
    const observer=new MutationObserver(reconcile)
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']})
    window.addEventListener('idealo-module-change',reconcile)
    window.addEventListener('idealo-open-module',reconcile)
    return()=>{
      observer.disconnect()
      window.removeEventListener('idealo-module-change',reconcile)
      window.removeEventListener('idealo-open-module',reconcile)
    }
  },[])

  return null
}
