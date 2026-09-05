import {useEffect,useState} from 'react'
import {supabase} from './lib/supabase.js'

export default function MfaSessionGate(){
 const [required,setRequired]=useState(false),[factor,setFactor]=useState(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const inspect=async()=>{if(!supabase)return;const {data:{session}}=await supabase.auth.getSession();if(!session){setRequired(false);return}const {data:aal}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(aal?.currentLevel==='aal1'&&aal?.nextLevel==='aal2'){const {data}=await supabase.auth.mfa.listFactors();const verified=[...(data?.totp||[]),...(data?.phone||[])].find(x=>x.status==='verified');setFactor(verified||null);setRequired(Boolean(verified))}else setRequired(false)}
 useEffect(()=>{inspect();const {data:l}=supabase?.auth.onAuthStateChange(()=>{window.setTimeout(inspect,0)})||{data:null};return()=>l?.subscription?.unsubscribe()},[])
 const verify=async()=>{if(!factor?.id||code.length<6)return;setBusy(true);setError('');try{const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code});if(error)throw error;setRequired(false);setCode('')}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(!required)return null
 return <div className="mfa-gate"><section><p className="form-kicker">SEGURIDAD IDEALO SV</p><h2>Verificación en dos pasos</h2><p>Esta cuenta tiene protección 2FA. Ingresá el código actual de tu aplicación autenticadora para continuar.</p>{error&&<div className="feedback error">{error}</div>}<label>Código de seguridad<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} onKeyDown={e=>{if(e.key==='Enter')verify()}} placeholder="000000"/></label><button className="btn primary" onClick={verify} disabled={busy||code.length<6}>{busy?'Verificando…':'Verificar y entrar'}</button><button className="btn secondary" onClick={()=>supabase.auth.signOut({scope:'local'})}>Cerrar sesión</button></section></div>
}
