import { useEffect, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function App() {
  const [serviceStatus, setServiceStatus] = useState({
    api: 'comprobando',
    database: 'comprobando',
  })

  useEffect(() => {
    fetch(`${apiUrl}/api/system/status`)
      .then((response) => {
        if (!response.ok) throw new Error('Servicios no disponibles')
        return response.json()
      })
      .then((status) => {
        setServiceStatus({
          api: status.api === 'ok' ? 'conectada' : 'con error',
          database: status.database === 'ok' ? 'conectada' : 'con error',
        })
      })
      .catch(() => {
        setServiceStatus({
          api: 'pendiente de configuración',
          database: 'pendiente de configuración',
        })
      })
  }, [])

  const apiConnected = serviceStatus.api === 'conectada'
  const databaseConnected = serviceStatus.database === 'conectada'

  return (
    <main className="shell">
      <section className="hero">
        <div className="brand">
          <span className="brand-mark">I</span>
          <span>IDEALO SV</span>
        </div>

        <p className="eyebrow">SISTEMA DE GESTIÓN PUBLICITARIA</p>
        <h1>Una base nueva para hacer crecer tu agencia.</h1>
        <p className="lead">
          Proyecto preparado desde el primer día para trabajar en línea con
          Supabase, Render y GitHub.
        </p>

        <div className="actions">
          <button type="button">Comenzar configuración</button>
          <a href={`${apiUrl}/health`} target="_blank" rel="noreferrer">
            Revisar API
          </a>
        </div>

        <div className="status-grid" aria-label="Estado de servicios">
          <Status label="Frontend" value="listo" active />
          <Status label="API" value={serviceStatus.api} active={apiConnected} />
          <Status
            label="Supabase"
            value={serviceStatus.database}
            active={databaseConnected}
          />
          <Status
            label="Render"
            value={apiConnected ? 'desplegado' : 'comprobando'}
            active={apiConnected}
          />
        </div>
      </section>
    </main>
  )
}

function Status({ label, value, active = false }) {
  return (
    <article className="status-card">
      <span className={active ? 'dot active' : 'dot'} />
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
    </article>
  )
}
