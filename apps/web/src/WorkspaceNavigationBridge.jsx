import { useEffect } from 'react'

export default function WorkspaceNavigationBridge() {
  useEffect(() => {
    const navigate = (detail = {}) => {
      const label = detail.tab
      if (!label) return
      const buttons = [...document.querySelectorAll('.erp-sidebar > nav:not(.idealo-main-menu) .nav-item')]
      const button = buttons.find((item) => item.textContent.trim().endsWith(label))
      button?.click()
    }

    const onOpen = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'workspace') return
      navigate(detail)
    }

    const onNavigate = (event) => navigate(event.detail || {})

    window.addEventListener('idealo-open-module', onOpen)
    window.addEventListener('idealo-workspace-navigate', onNavigate)
    return () => {
      window.removeEventListener('idealo-open-module', onOpen)
      window.removeEventListener('idealo-workspace-navigate', onNavigate)
    }
  }, [])
  return null
}
