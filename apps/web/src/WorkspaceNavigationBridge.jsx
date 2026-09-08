import { useEffect } from 'react'

export default function WorkspaceNavigationBridge() {
  useEffect(() => {
    const onOpen = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'workspace') return
      const label = detail.tab
      const buttons = [...document.querySelectorAll('.erp-sidebar > nav:not(.idealo-main-menu) .nav-item')]
      const button = buttons.find((item) => item.textContent.trim().endsWith(label))
      button?.click()
    }
    window.addEventListener('idealo-open-module', onOpen)
    return () => window.removeEventListener('idealo-open-module', onOpen)
  }, [])
  return null
}
