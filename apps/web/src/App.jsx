import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import ErpApp from './ErpApp.jsx'
import Workspace from './Workspace.jsx'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export default function App() {
  const [serviceStatus, setServiceStatus] = useState({
    api: 'comprobando',
    database: 'comprobando',
  })
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [screen, setScreen] = useState('welcome')
  const [recoveryMode, setRecoveryMode] = useState(false)

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

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return undefined
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
      if (data.session) setScreen('account')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setScreen('auth')
      } else if (nextSession) {
        setScreen('account')
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const apiConnected = serviceStatus.api === 'conectada'
  const databaseConnected = serviceStatus.database === 'conectada'

  if (!authReady) {
    return <LoadingScreen />
  }

  if (screen === 'auth') {
    return (
      <AuthScreen
        recoveryMode={recoveryMode}
        onRecoveryComplete={() => {
          setRecoveryMode(false)
          setScreen('account')
        }}
        onBack={() => {
          setRecoveryMode(false)
          setScreen(session ? 'account' : 'welcome')
        }}
      />
    )
  }

  if (session && screen === 'account') {
    return <Workspace session={session} supabase={supabase} />
  }

  return (
    <main className="shell">
      <section className="hero">
        <Brand />

        <p className="eyebrow">SISTEMA DE GESTIÓN PUBLICITARIA</p>
        <h1>Una base nueva para hacer crecer tu agencia.</h1>
        <p className="lead">
          Proyecto preparado desde el primer día para trabajar en línea con
          Supabase, Render y GitHub.
        </p>

        <div className="actions">
          <button type="button" onClick={() => setScreen('auth')}>
            Comenzar configuración
          </button>
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

function AuthScreen({ recoveryMode, onRecoveryComplete, onBack }) {
  const [mode, setMode] = useState(recoveryMode ? 'new-password' : 'sign-in')
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  const copy = useMemo(() => {
    if (mode === 'sign-up') {
      return {
        eyebrow: 'CREAR CUENTA',
        title: 'Comienza con tu agencia.',
        button: 'Crear mi cuenta',
      }
    }
    if (mode === 'forgot') {
      return {
        eyebrow: 'RECUPERAR ACCESO',
        title: 'Recupera tu contraseña.',
        button: 'Enviar enlace',
      }
    }
    if (mode === 'new-password') {
      return {
        eyebrow: 'NUEVA CONTRASEÑA',
        title: 'Protege nuevamente tu cuenta.',
        button: 'Guardar contraseña',
      }
    }
    return {
      eyebrow: 'ACCESO SEGURO',
      title: 'Bienvenido a IDEALO SV.',
      button: 'Iniciar sesión',
    }
  }, [mode])

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setFeedback({ type: '', message: '' })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback({ type: '', message: '' })

    if (!supabase) {
      setFeedback({
        type: 'error',
        message: 'Faltan las variables públicas de Supabase en el frontend.',
      })
      return
    }

    if (mode !== 'forgot' && form.password.length < 8) {
      setFeedback({
        type: 'error',
        message: 'La contraseña debe tener al menos 8 caracteres.',
      })
      return
    }

    setSubmitting(true)

    try {
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: { full_name: form.fullName.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error
        setFeedback({
          type: 'success',
          message: data.session
            ? 'Cuenta creada correctamente.'
            : 'Cuenta creada. Revisa tu correo para confirmar el acceso.',
        })
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          form.email.trim(),
          { redirectTo: window.location.origin },
        )
        if (error) throw error
        setFeedback({
          type: 'success',
          message: 'Te enviamos un enlace para crear una contraseña nueva.',
        })
      } else if (mode === 'new-password') {
        const { error } = await supabase.auth.updateUser({ password: form.password })
        if (error) throw error
        setFeedback({
          type: 'success',
          message: 'Contraseña actualizada correctamente.',
        })
        onRecoveryComplete()
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        })
        if (error) throw error
      }
    } catch (error) {
      setFeedback({ type: 'error', message: friendlyAuthError(error.message) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="shell auth-shell">
      <section className="auth-layout">
        <div className="auth-intro">
          <Brand />
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="lead">
            Un acceso único para administrar clientes, campañas, producción y
            resultados de tu empresa.
          </p>
          <button type="button" className="text-button" onClick={onBack}>
            ← Volver al inicio
          </button>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div>
            <p className="form-kicker">{copy.eyebrow}</p>
            <h2>{copy.button}</h2>
          </div>

          {mode === 'sign-up' && (
            <Field
              label="Nombre completo"
              name="fullName"
              value={form.fullName}
              onChange={updateField}
              autoComplete="name"
              required
            />
          )}

          {mode !== 'new-password' && (
            <Field
              label="Correo electrónico"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              autoComplete="email"
              required
            />
          )}

          {mode !== 'forgot' && (
            <Field
              label={mode === 'new-password' ? 'Nueva contraseña' : 'Contraseña'}
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          )}

          {feedback.message && (
            <p className={`feedback ${feedback.type}`} role="status">
              {feedback.message}
            </p>
          )}

          <button type="submit" className="submit-button" disabled={submitting}>
            {submitting ? 'Procesando…' : copy.button}
          </button>

          {mode === 'sign-in' && (
            <>
              <button
                type="button"
                className="auth-link"
                onClick={() => changeMode('forgot')}
              >
                ¿Olvidaste tu contraseña?
              </button>
              <p className="auth-switch">
                ¿Primera vez aquí?{' '}
                <button type="button" onClick={() => changeMode('sign-up')}>
                  Crear cuenta
                </button>
              </p>
            </>
          )}

          {mode === 'sign-up' && (
            <p className="auth-switch">
              ¿Ya tienes una cuenta?{' '}
              <button type="button" onClick={() => changeMode('sign-in')}>
                Iniciar sesión
              </button>
            </p>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              className="auth-link"
              onClick={() => changeMode('sign-in')}
            >
              Volver al inicio de sesión
            </button>
          )}
        </form>
      </section>
    </main>
  )
}

function AccountScreen({ session }) {
  return <ErpApp session={session} supabase={supabase} />
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">I</span>
      <span>IDEALO SV</span>
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="shell">
      <section className="loading-card">
        <span className="spinner" />
        <p>Preparando acceso seguro…</p>
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

function friendlyAuthError(message = '') {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) {
    return 'El correo o la contraseña no son correctos.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de ingresar.'
  }
  if (normalized.includes('user already registered')) {
    return 'Ya existe una cuenta con ese correo.'
  }
  if (normalized.includes('rate limit')) {
    return 'Espera un momento antes de intentarlo nuevamente.'
  }
  return 'No se pudo completar la solicitud. Inténtalo nuevamente.'
}
