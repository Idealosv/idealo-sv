import { useEffect } from 'react'

const FORM_SELECTOR = '.erp-modal-panel form, .erp-content form, .clients-module form'
const SECTION_SELECTOR = 'fieldset.form-section'
const IMPORTANT_SECTION = /identificaci[oó]n|cliente|producto|partida|datos principales|general/i

function sectionList(form) {
  return [...form.querySelectorAll(SECTION_SELECTOR)].filter((section) => section.closest('form') === form)
}

function setCollapsed(section, collapsed) {
  const legend = section.querySelector(':scope > legend')
  if (!legend) return
  section.classList.toggle('erp-audit-section-collapsed', collapsed)
  legend.setAttribute('aria-expanded', String(!collapsed))
}

function prepareForm(form) {
  const sections = sectionList(form)
  if (sections.length < 3) return

  form.classList.add('erp-audit-accordion-form')

  sections.forEach((section, index) => {
    const legend = section.querySelector(':scope > legend')
    if (!legend) return

    section.classList.add('erp-audit-accordion-section')
    const shouldStartOpen = index === 0 || IMPORTANT_SECTION.test(legend.textContent || '')

    if (!section.dataset.erpAuditAccordion) {
      section.dataset.erpAuditAccordion = '1'
      legend.setAttribute('role', 'button')
      legend.setAttribute('tabindex', '0')
      legend.title = 'Abrir o cerrar sección'

      const toggle = () => setCollapsed(section, !section.classList.contains('erp-audit-section-collapsed'))
      legend.addEventListener('click', toggle)
      legend.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggle()
        }
      })
    }

    if (!section.dataset.erpAuditInitialized) {
      section.dataset.erpAuditInitialized = '1'
      setCollapsed(section, !shouldStartOpen)
    }
  })
}

function scanForms() {
  document.querySelectorAll(FORM_SELECTOR).forEach(prepareForm)
}

export default function FormAccordionManager() {
  useEffect(() => {
    const timers = []
    const schedule = () => {
      timers.push(window.setTimeout(scanForms, 0))
      timers.push(window.setTimeout(scanForms, 120))
      timers.push(window.setTimeout(scanForms, 450))
    }

    const onModuleChange = () => schedule()
    const onClick = (event) => {
      if (event.target.closest('button,[role="tab"],.nav-item,.idealo-main-menu-item')) schedule()
    }
    const onInvalid = (event) => {
      const section = event.target.closest('.erp-audit-accordion-section')
      if (section) setCollapsed(section, false)
    }

    schedule()
    window.addEventListener('idealo-module-change', onModuleChange)
    document.addEventListener('click', onClick)
    document.addEventListener('invalid', onInvalid, true)

    return () => {
      timers.forEach(window.clearTimeout)
      window.removeEventListener('idealo-module-change', onModuleChange)
      document.removeEventListener('click', onClick)
      document.removeEventListener('invalid', onInvalid, true)
    }
  }, [])

  return null
}
