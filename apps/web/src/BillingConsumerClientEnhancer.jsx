import { useEffect } from 'react'

export default function BillingConsumerClientEnhancer() {
  useEffect(() => {
    const apply = () => {
      const root = document.querySelector('.facturacion-dte')
      if (!root) return
      const pickerButtons = [...root.querySelectorAll('.billing-document-picker button')]
      const isCredit = pickerButtons.some((button) => button.classList.contains('active') && button.textContent.includes('Crédito Fiscal'))
      const clientSelect = root.querySelector('.billing-classic-main fieldset:first-of-type select')
      if (!clientSelect) return

      const first = clientSelect.options?.[0]
      if (first) first.textContent = isCredit ? 'Seleccionar cliente contribuyente' : 'Consumidor final sin registrar'

      const field = clientSelect.closest('.field')
      if (!field) return
      let helper = field.parentElement?.querySelector('.billing-client-import-note')
      if (!helper) {
        helper = document.createElement('small')
        helper.className = 'billing-auto-note billing-client-import-note'
        field.insertAdjacentElement('afterend', helper)
      }
      helper.textContent = isCredit
        ? 'Los clientes contribuyentes se cargan automáticamente desde el módulo Clientes.'
        : 'Podés dejar Consumidor final sin registrar o seleccionar un cliente importado automáticamente desde el módulo Clientes.'
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('idealo-module-change', apply)
    return () => {
      observer.disconnect()
      window.removeEventListener('idealo-module-change', apply)
    }
  }, [])

  return null
}
