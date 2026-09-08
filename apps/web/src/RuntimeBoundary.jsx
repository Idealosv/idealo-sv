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
    const label=this.props.label||'módulo'
    console.error(`[IDEALO SV] Error en ${label}`, error, info)
    window.dispatchEvent(new CustomEvent('idealo-runtime-error', {
      detail: { label, message: `No se pudo cargar ${label}.` },
    }))
  }

  retry=()=>this.setState({error:null})

  render() {
    if (!this.state.error) return this.props.children

    if (!this.props.fatal) {
      return (
        <aside className="erp-runtime-module-error" role="alert">
          <strong>No se pudo cargar {this.props.label || 'este módulo'}.</strong>
          <span>El resto del ERP continúa protegido.</span>
          <button type="button" onClick={this.retry}>Reintentar módulo</button>
        </aside>
      )
    }

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
