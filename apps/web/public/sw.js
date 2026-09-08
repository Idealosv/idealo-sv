const CACHE='idealo-mobile-v4'
const CORE=['/','/mobile','/manifest.webmanifest']

self.addEventListener('install',(event)=>{
  event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(CORE)).catch(()=>null))
  self.skipWaiting()
})

self.addEventListener('activate',(event)=>{
  event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch',(event)=>{
  const request=event.request
  if(request.method!=='GET')return
  const url=new URL(request.url)

  if(url.origin!==self.location.origin)return

  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('/mobile').then((cached)=>cached||caches.match('/'))))
    return
  }

  const isStatic=['style','script','image','font','manifest'].includes(request.destination)
  if(!isStatic)return

  event.respondWith(caches.match(request).then((cached)=>cached||fetch(request).then((response)=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then((cache)=>cache.put(request,copy))}
    return response
  })))
})

self.addEventListener('push',(event)=>{
  let data={}
  try{data=event.data?.json?.()||{body:event.data?.text?.()}}catch{data={body:event.data?.text?.()||'Nueva alerta de IDEALO SV'}}
  const title=data.title||'IDEALO SV'
  const options={body:data.body||'Tenés una nueva notificación.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.tag||'idealo-push',data:{url:data.url||'/mobile'},vibrate:[180,80,180]}
  event.waitUntil(self.registration.showNotification(title,options))
})

self.addEventListener('notificationclick',(event)=>{
  event.notification.close()
  const target=event.notification.data?.url||'/mobile'
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then((list)=>{
    for(const client of list){if('focus'in client){client.navigate(target);return client.focus()}}
    return clients.openWindow?clients.openWindow(target):null
  }))
})
