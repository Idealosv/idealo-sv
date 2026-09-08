import { Component } from 'react'

export default class RuntimeBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[IDEALO SV] Error en ${this.props.label || 'módulo'}`, error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    if (!this.props.fatal) return null

    return (
      <main className="erp-runtime-fallback" role="alert">
        <section>
          <strong>IDEALO SV no pudo cargar esta vista.</strong>
          <p>El resto del sistema quedó protegido. Recargá la página; si el problema continúa, registrá el módulo que estabas abriendo.</p>
          <button type="button" onClick={() => window.location.reload()}>Recargar ERP</button>
        </section>
      </main>
    )
  }
}
