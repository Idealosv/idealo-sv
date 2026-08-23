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

function prepareFieldsets(form) {
  const sections = sectionList(form)
  if (sections.length < 3) return false

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
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle() }
      })
    }

    if (!section.dataset.erpAuditInitialized) {
      section.dataset.erpAuditInitialized = '1'
      setCollapsed(section, !shouldStartOpen)
    }
  })
  return true
}

function titledSections(form) {
  return [...form.querySelectorAll('.form-section-title')].filter((title) => title.closest('form') === form)
}

function setTitledCollapsed(title, collapsed) {
  title.classList.toggle('erp-audit-title-collapsed', collapsed)
  title.setAttribute('aria-expanded', String(!collapsed))
  let node = title.nextElementSibling
  while (node && !node.classList.contains('form-section-title') && !node.classList.contains('form-actions')) {
    node.classList.toggle('erp-audit-title-content-hidden', collapsed)
    node = node.nextElementSibling
  }
}

function prepareTitledSections(form) {
  const titles = titledSections(form)
  if (titles.length < 3) return
  form.classList.add('erp-audit-titled-form')

  titles.forEach((title, index) => {
    if (!title.dataset.erpAuditTitle) {
      title.dataset.erpAuditTitle = '1'
      title.setAttribute('role', 'button')
      title.setAttribute('tabindex', '0')
      title.title = 'Abrir o cerrar sección'
      const toggle = () => setTitledCollapsed(title, !title.classList.contains('erp-audit-title-collapsed'))
      title.addEventListener('click', toggle)
      title.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle() }
      })
    }
    if (!title.dataset.erpAuditInitialized) {
      title.dataset.erpAuditInitialized = '1'
      setTitledCollapsed(title, index > 1)
    }
  })
}

function prepareForm(form) {
  const hasFieldsets = prepareFieldsets(form)
  if (!hasFieldsets) prepareTitledSections(form)
}

function scanForms() {
  document.querySelectorAll(FORM_SELECTOR).forEach(prepareForm)
}

export default function FormAccordionManager() {
  useEffect(() => {
    const timers = new Set()
    const later = (delay) => {
      const id = window.setTimeout(() => { timers.delete(id); scanForms() }, delay)
      timers.add(id)
    }
    const schedule = () => {
      timers.forEach(window.clearTimeout)
      timers.clear()
      later(0); later(120); later(450)
    }

    const onModuleChange = () => schedule()
    const onClick = (event) => {
      if (event.target.closest('button,[role="tab"],.nav-item,.idealo-main-menu-item')) schedule()
    }
    const onInvalid = (event) => {
      const section = event.target.closest('.erp-audit-accordion-section')
      if (section) setCollapsed(section, false)
      const form = event.target.closest('form')
      if (form) {
        const titles = titledSections(form)
        const owner = titles.find((title) => {
          let node = title.nextElementSibling
          while (node && !node.classList.contains('form-section-title') && !node.classList.contains('form-actions')) {
            if (node === event.target || node.contains(event.target)) return true
            node = node.nextElementSibling
          }
          return false
        })
        if (owner) setTitledCollapsed(owner, false)
      }
    }

    schedule()
    window.addEventListener('idealo-module-change', onModuleChange)
    document.addEventListener('click', onClick)
    document.addEventListener('invalid', onInvalid, true)

    return () => {
      timers.forEach(window.clearTimeout)
      timers.clear()
      window.removeEventListener('idealo-module-change', onModuleChange)
      document.removeEventListener('click', onClick)
      document.removeEventListener('invalid', onInvalid, true)
    }
  }, [])

  return null
}
