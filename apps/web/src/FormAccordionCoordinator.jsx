import { useEffect } from 'react'

const FORM_SCOPE = '.erp-modal-panel form, .workspace-main form, .panel form'
const SECTION_SELECTOR = 'fieldset.form-section'

const enhanceForm = (form) => {
  const sections = [...form.querySelectorAll(`:scope > ${SECTION_SELECTOR}, :scope > * > ${SECTION_SELECTOR}`)]
  if (sections.length < 3) return

  sections.forEach((section, index) => {
    if (section.dataset.erpAccordionReady === '1') return
    const legend = section.querySelector(':scope > legend')
    if (!legend) return

    section.dataset.erpAccordionReady = '1'
    section.classList.add('erp-form-accordion')
    const initiallyOpen = index < 2
    section.classList.toggle('erp-form-accordion-collapsed', !initiallyOpen)
    legend.setAttribute('role', 'button')
    legend.setAttribute('tabindex', '0')
    legend.setAttribute('aria-expanded', String(initiallyOpen))
    legend.title = 'Abrir o cerrar esta sección'

    const toggle = () => {
      const collapsed = section.classList.toggle('erp-form-accordion-collapsed')
      legend.setAttribute('aria-expanded', String(!collapsed))
    }

    legend.addEventListener('click', toggle)
    legend.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggle()
      }
    })
  })
}

export default function FormAccordionCoordinator() {
  useEffect(() => {
    const scan = () => document.querySelectorAll(FORM_SCOPE).forEach(enhanceForm)
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
