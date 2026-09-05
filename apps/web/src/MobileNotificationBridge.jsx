import {useEffect,useState} from 'react'

const isNative=()=>!!window.Capacitor?.isNativePlatform?.()

export default function MobileNotificationBridge(){
  const [ready,setReady]=useState(false)
  useEffect(()=>{
    const enable=async()=>{
      try{
        if(isNative()){
          const {LocalNotifications}=await import('@capacitor/local-notifications')
          const permission=await LocalNotifications.requestPermissions()
          if(permission.display!=='granted')throw new Error('Permiso de notificaciones denegado')
          await LocalNotifications.schedule({notifications:[{id:Date.now()%2147483000,title:'IDEALO SV',body:'Notificaciones móviles activadas.',schedule:{at:new Date(Date.now()+800)}}]})
          setReady(true)
          window.dispatchEvent(new CustomEvent('idealo-mobile-notifications-status',{detail:{ready:true,native:true}}))
          return
        }
        if(typeof Notification==='undefined')throw new Error('Notificaciones no disponibles en este navegador')
        const permission=await Notification.requestPermission()
        if(permission!=='granted')throw new Error('Permiso de notificaciones denegado')
        const reg=await navigator.serviceWorker?.ready
        if(reg)await reg.showNotification('IDEALO SV',{body:'Notificaciones móviles activadas.',data:{url:'/mobile'}})
        setReady(true)
        window.dispatchEvent(new CustomEvent('idealo-mobile-notifications-status',{detail:{ready:true,native:false}}))
      }catch(error){
        window.dispatchEvent(new CustomEvent('idealo-mobile-notifications-status',{detail:{ready:false,error:error?.message||'No se pudieron activar notificaciones'}}))
      }
    }
    const notify=async event=>{
      const detail=event.detail||{}
      try{
        if(isNative()){
          const {LocalNotifications}=await import('@capacitor/local-notifications')
          await LocalNotifications.schedule({notifications:[{id:Date.now()%2147483000,title:detail.title||'IDEALO SV',body:detail.body||'Tenés una actualización pendiente.',schedule:{at:new Date(Date.now()+500)},extra:{url:detail.url||'/mobile'}}]})
          return
        }
        const reg=await navigator.serviceWorker?.ready
        if(reg&&Notification.permission==='granted')await reg.showNotification(detail.title||'IDEALO SV',{body:detail.body||'Tenés una actualización pendiente.',data:{url:detail.url||'/mobile'}})
      }catch{}
    }
    window.addEventListener('idealo-mobile-notifications-enable',enable)
    window.addEventListener('idealo-mobile-notify',notify)
    return()=>{window.removeEventListener('idealo-mobile-notifications-enable',enable);window.removeEventListener('idealo-mobile-notify',notify)}
  },[])
  return ready?null:null
}
