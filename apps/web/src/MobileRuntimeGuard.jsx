import { useEffect } from 'react'

const isHandheld=()=>{
  const ua=navigator.userAgent||''
  const mobileUa=/Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const narrow=window.matchMedia?.('(max-width: 820px)')?.matches ?? window.innerWidth<=820
  return mobileUa&&narrow
}

const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true
const platform=()=>{
  const cap=window.Capacitor
  if(!cap)return 'web'
  if(cap.isNativePlatform?.())return cap.getPlatform?.()||'native'
  return cap.getPlatform?.()||'web'
}
const isNative=()=>platform()!=='web'

export default function MobileRuntimeGuard(){
  useEffect(()=>{
    let active=false
    const applyPlatformClasses=()=>{
      const current=platform()
      const native=current!=='web'
      document.documentElement.classList.toggle('idealo-native-mobile',native)
      document.body.classList.toggle('idealo-native-mobile',native)
      document.documentElement.classList.toggle('idealo-native-android',current==='android')
      document.body.classList.toggle('idealo-native-android',current==='android')
      document.documentElement.classList.toggle('idealo-native-ios',current==='ios')
      document.body.classList.toggle('idealo-native-ios',current==='ios')
    }
    const activate=({writeUrl=true}={})=>{
      active=true
      const native=isNative()
      document.documentElement.classList.add('idealo-mobile-runtime')
      document.body.classList.add('idealo-mobile-runtime')
      applyPlatformClasses()
      if(writeUrl&&!native&&window.location.pathname!=='/mobile')window.history.pushState({idealoMobile:true},'',`/mobile${window.location.search||''}`)
      window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'App móviles'}))
    }
    const deactivate=()=>{
      active=false
      document.documentElement.classList.remove('idealo-mobile-runtime','idealo-native-mobile','idealo-native-android','idealo-native-ios')
      document.body.classList.remove('idealo-mobile-runtime','idealo-native-mobile','idealo-native-android','idealo-native-ios')
    }
    const syncRoute=()=>{
      if(window.location.pathname==='/mobile'||isNative())activate({writeUrl:false})
      else if(active)deactivate()
    }
    const onModule=e=>{
      if(e.detail==='App móviles')activate({writeUrl:true})
      else if(active&&!isNative()&&window.location.pathname==='/mobile'){
        window.history.replaceState({},'',`/${window.location.search||''}`)
        deactivate()
      }
    }
    window.addEventListener('popstate',syncRoute)
    window.addEventListener('idealo-module-change',onModule)
    window.addEventListener('resize',applyPlatformClasses)
    const shouldOpen=isNative()||window.location.pathname==='/mobile'||(isHandheld()&&isStandalone())
    if(shouldOpen)window.setTimeout(()=>activate({writeUrl:!isNative()&&window.location.pathname!=='/mobile'}),0)
    return()=>{
      window.removeEventListener('popstate',syncRoute)
      window.removeEventListener('idealo-module-change',onModule)
      window.removeEventListener('resize',applyPlatformClasses)
      deactivate()
    }
  },[])
  return null
}
