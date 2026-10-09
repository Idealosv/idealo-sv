import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import PrestaditosInvestor from './PrestaditosInvestor.jsx'
import PrestaditosAdmin from './PrestaditosAdmin.jsx'
import './prestaditos.css'

const adminRoute = window.location.pathname.startsWith('/prestaditos/admin')
const Logo = () => <div className="pt-logo"><img src="/prestaditos-logo.svg" alt="Símbolo Prestaditos" /><div><strong>PRESTADITO$</strong><small>INVERSIONISTAS · EL SALVADOR</small></div></div>
export { Logo }

export default function PrestaditosPortal() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setReady(true)
    }).catch(() => setReady(true))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => sub.subscription.unsubscribe()
  }, [])
  return <div className="pt-root">
    {(!ready || !supabase) ? <div className="pt-loading">{!supabase ? 'Supabase no está configurado' : 'Verificando sesión…'}</div> :
      !session ? <Login /> : adminRoute ? <PrestaditosAdmin session={session} /> : <PrestaditosInvestor session={session} />}
  </div>
}

function Login() {
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const send = async (event) => {
    event.preventDefault()
    if (loading) return
    setLoading(true); setMessage('')
    const result = register
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (result.error) { setMessage(result.error.message); return }
    if (register && !result.data?.session) setMessage('Revisa tu correo para confirmar el registro. Luego inicia sesión.')
  }
  return <div className="pt-auth">
    <section className="pt-auth-brand">
      <Logo />
      <h1>Tu inversión, clara y organizada.</h1>
      <p>Portal exclusivo para quienes participan como inversionistas de Prestaditos El Salvador.</p>
      <a href="/">← Volver a IDEALO SV</a>
    </section>
    <form className="pt-auth-card" onSubmit={send}>
      <p className="pt-eyebrow">ACCESO SEGURO</p>
      <h2>{register ? 'Crear cuenta de inversionista' : 'Iniciar sesión'}</h2>
      <p>Usa tu correo electrónico para acceder a la plataforma.</p>
      <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Contraseña<input type="password" autoComplete={register ? 'new-password':'current-password'} minLength="6" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {message && <p role="status" className="pt-notice">{message}</p>}
      <button className="pt-primary" disabled={loading}>{loading ? 'Un momento…' : register ? 'Crear cuenta' : 'Ingresar'}</button>
      {!adminRoute && <button type="button" className="pt-link" onClick={() => {setRegister(!register);setMessage('')}}>{register ? 'Ya tengo cuenta' : 'Quiero solicitar acceso como inversionista'}</button>}
      <p className="pt-footnote">La creación de una cuenta no equivale a la aprobación de una inversión.</p>
    </form>
  </div>
}
