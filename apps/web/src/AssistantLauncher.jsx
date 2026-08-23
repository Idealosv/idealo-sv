import { useEffect, useState } from 'react'

export default function AssistantLauncher() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'assistant') return
      setOpen(true)
    }
    window.addEventListener('idealo-open-module', onOpen)
    return () => window.removeEventListener('idealo-open-module', onOpen)
  }, [])

  if (!open) return null

  return <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Asistente IA" onMouseDown={(event) => event.stopPropagation()}>
      <header className="erp-modal-head">
        <div><strong>Asistente IA</strong><small>Centro inteligente de IDEALO SV</small></div>
        <button type="button" className="erp-modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
      </header>
      <div className="erp-modal-body">
        <section className="panel module-placeholder-card">
          <p className="form-kicker">ASISTENTE IA</p>
          <h2>Centro de asistencia</h2>
          <p>El módulo ya tiene un acceso propio y estable dentro del ERP. La conexión con un modelo de IA todavía no está configurada, por lo que no se muestran acciones ficticias ni respuestas simuladas.</p>
          <div className="feedback success">Navegación y estructura listas para integrar funciones de IA reales sin mezclar este módulo con otros procesos.</div>
        </section>
      </div>
    </section>
  </div>
}
