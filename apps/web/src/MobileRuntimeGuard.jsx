import { useEffect } from 'react'

const isHandheld=()=>{
  const ua=navigator.userAgent||''
  const mobileUa=/Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const narrow=window.matchMedia?.('(max-width: 820px)')?.matches ?? window.innerWidth<=820
  return mobileUa&&narrow
}

const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true

export default function MobileRuntimeGuard(){
  useEffect(()=>{
    let active=false
    const activate=({writeUrl=true}={})=>{
      active=true
      document.documentElement.classList.add('idealo-mobile-runtime')
      document.body.classList.add('idealo-mobile-runtime')
      if(writeUrl&&window.location.pathname!=='/mobile')window.history.pushState({idealoMobile:true},'',`/mobile${window.location.search||''}`)
      window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'App móviles'}))
    }
    const deactivate=()=>{
      active=false
      document.documentElement.classList.remove('idealo-mobile-runtime')
      document.body.classList.remove('idealo-mobile-runtime')
    }
    const syncRoute=()=>{
      if(window.location.pathname==='/mobile')activate({writeUrl:false})
      else if(active)deactivate()
    }
    const onModule=e=>{
      if(e.detail==='App móviles')activate({writeUrl:true})
      else if(active&&window.location.pathname==='/mobile'){
        window.history.replaceState({},'',`/${window.location.search||''}`)
        deactivate()
      }
    }
    window.addEventListener('popstate',syncRoute)
    window.addEventListener('idealo-module-change',onModule)
    const shouldOpen=window.location.pathname==='/mobile'||(isHandheld()&&isStandalone())
    if(shouldOpen)window.setTimeout(()=>activate({writeUrl:window.location.pathname!=='/mobile'}),0)
    return()=>{
      window.removeEventListener('popstate',syncRoute)
      window.removeEventListener('idealo-module-change',onModule)
      deactivate()
    }
  },[])
  return null
}
