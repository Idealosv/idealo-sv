import { useEffect } from 'react'
import { requestFromTargetDetail } from './erp-navigation.js'

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
  return null
}
