import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async(req)=>{
  try{
    const supabaseUrl=Deno.env.get('SUPABASE_URL')!
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const publicKey=Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey=Deno.env.get('VAPID_PRIVATE_KEY')
    const subject=Deno.env.get('VAPID_SUBJECT')||'mailto:admin@idealo.sv'
    if(!publicKey||!privateKey)return new Response(JSON.stringify({error:'VAPID_NOT_CONFIGURED'}),{status:503,headers:{'content-type':'application/json'}})
    const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'')
    const admin=createClient(supabaseUrl,serviceKey)
    const {data:{user},error:ue}=await admin.auth.getUser(token)
    if(ue||!user)return new Response(JSON.stringify({error:'UNAUTHORIZED'}),{status:401,headers:{'content-type':'application/json'}})
    const body=await req.json().catch(()=>({}))
    const {data:subs,error}=await admin.from('mobile_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('user_id',user.id).eq('active',true)
    if(error)throw error
    webpush.setVapidDetails(subject,publicKey,privateKey)
    let sent=0
    for(const s of subs||[]){try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth_key}},JSON.stringify({title:body.title||'IDEALO SV',body:body.body||'Notificación de prueba',url:body.url||'/mobile',tag:body.tag||'idealo-mobile'}));sent++}catch(e){if(e?.statusCode===404||e?.statusCode===410)await admin.from('mobile_push_subscriptions').update({active:false}).eq('id',s.id)}}
    return new Response(JSON.stringify({ok:true,sent}),{headers:{'content-type':'application/json'}})
  }catch(e){return new Response(JSON.stringify({error:e?.message||'push_error'}),{status:500,headers:{'content-type':'application/json'}})}
})
