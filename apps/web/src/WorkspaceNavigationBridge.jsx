import { useEffect } from 'react'
import { confirmModule, failModule, subscribeNavigation } from './erp-navigation.js'

const RETRIES = [0, 60, 150, 300, 600, 1000, 1600]

export default function WorkspaceNavigationBridge() {
  useEffect(() => subscribeNavigation((navigation) => {
    if (navigation.status !== 'requested' || navigation.target !== 'workspace') return
    const { requestId, requestedModule, tab } = navigation
    let done = false

    const attempt = () => {
      if (done) return
      const buttons = [...document.querySelectorAll('.erp-sidebar > nav:not(.idealo-main-menu) .nav-item')]
      const button = buttons.find((item) => item.textContent.trim().endsWith(tab || ''))
      if (!button) return
      button.click()
      window.requestAnimationFrame(() => {
        if (done) return
        const title = document.querySelector('.erp-content .erp-header h1')?.textContent?.trim()
        if (title === tab) {
          done = true
          confirmModule(requestId, requestedModule)
        }
      })
    }

    RETRIES.forEach((delay) => window.setTimeout(attempt, delay))
    window.setTimeout(() => {
      if (!done) failModule(requestId, requestedModule, `La vista ${tab} no confirmó su apertura.`)
    }, 2400)
  }), [])
  return null
}
