const ROLES=['owner','admin','staff','viewer']

function httpError(message,statusCode=400,code='ADMIN_REQUEST_ERROR'){const error=new Error(message);error.statusCode=statusCode;error.code=code;return error}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}

async function actorContext({request,supabase,companyId}){
 const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED')
 const {data:{user},error}=await supabase.auth.getUser(token);if(error||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID')
 const {data:membership,error:membershipError}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle()
 if(membershipError)throw membershipError
 const role=String(membership?.role||'').toLowerCase();if(!['owner','admin'].includes(role))throw httpError('No tenés permisos para administrar usuarios.',403,'ADMIN_REQUIRED')
 return{user,role}
}
async function audit(supabase,{companyId,actorUserId,targetUserId=null,action,detail={}}){const {error}=await supabase.from('company_admin_audit').insert({company_id:companyId,actor_user_id:actorUserId,target_user_id:targetUserId,action,detail});if(error)throw error}
async function ensureOwnerRule(supabase,{companyId,targetUserId,nextRole=null,remove=false}){
 const {data:target,error}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',targetUserId).maybeSingle();if(error)throw error
 if(String(target?.role).toLowerCase()!=='owner'||(!remove&&nextRole==='owner'))return target
 const {count,error:countError}=await supabase.from('company_members').select('*',{count:'exact',head:true}).eq('company_id',companyId).eq('role','owner');if(countError)throw countError
 if(Number(count||0)<=1)throw httpError('La empresa debe conservar al menos un propietario.',409,'LAST_OWNER_PROTECTED')
 return target
}
function assertRole(role){const normalized=String(role||'').toLowerCase();if(!ROLES.includes(normalized))throw httpError('Rol inválido.');return normalized}
function assertActorCanManage(actorRole,targetRole,nextRole){if(actorRole==='owner')return;if(targetRole==='owner'||nextRole==='owner'||nextRole==='admin')throw httpError('Un administrador no puede modificar propietarios ni conceder privilegios de propietario/administrador.',403,'OWNER_ONLY')}
async function findUserByEmail(supabase,email){let page=1;while(page<=10){const {data,error}=await supabase.auth.admin.listUsers({page,perPage:100});if(error)throw error;const found=(data?.users||[]).find(user=>String(user.email||'').toLowerCase()===email);if(found)return found;if((data?.users||[]).length<100)break;page++}return null}

export async function listCompanyUsers({request,supabase}){
 const companyId=String(request.query.company_id||'');if(!companyId)throw httpError('company_id es obligatorio.')
 const actor=await actorContext({request,supabase,companyId})
 const {data:members,error}=await supabase.from('company_members').select('user_id,role,created_at').eq('company_id',companyId).order('created_at',{ascending:true});if(error)throw error
 const ids=(members||[]).map(x=>x.user_id);const {data:profiles,error:profilesError}=ids.length?await supabase.from('profiles').select('id,full_name,avatar_url').in('id',ids):{data:[],error:null};if(profilesError)throw profilesError
 const profileMap=new Map((profiles||[]).map(x=>[x.id,x]));const users=[]
 for(const membership of members||[]){const {data,error:userError}=await supabase.auth.admin.getUserById(membership.user_id);if(userError)throw userError;const auth=user?.user||null;users.push({user_id:membership.user_id,role:membership.role,created_at:membership.created_at,full_name:profileMap.get(membership.user_id)?.full_name||auth?.user_metadata?.full_name||'',email:auth?.email||'',last_sign_in_at:auth?.last_sign_in_at||null,invited_at:auth?.invited_at||null,email_confirmed_at:auth?.email_confirmed_at||null})}
 return{actor_role:actor.role,users}
}

export async function inviteCompanyUser({request,supabase}){
 const companyId=String(request.body?.company_id||''),email=String(request.body?.email||'').trim().toLowerCase(),role=assertRole(request.body?.role),fullName=String(request.body?.full_name||'').trim();if(!companyId||!email)throw httpError('Empresa y correo son obligatorios.')
 const actor=await actorContext({request,supabase,companyId});assertActorCanManage(actor.role,'',role)
 let user=await findUserByEmail(supabase,email)
 if(!user){const {data,error}=await supabase.auth.admin.inviteUserByEmail(email,{data:{full_name:fullName}});if(error)throw error;user=data.user}
 if(!user)throw httpError('No se pudo crear o localizar el usuario.',500)
 const {data:existing,error:existingError}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle();if(existingError)throw existingError
 if(existing)throw httpError('Ese usuario ya pertenece a la empresa.',409,'MEMBERSHIP_EXISTS')
 const {error:memberError}=await supabase.from('company_members').insert({company_id:companyId,user_id:user.id,role});if(memberError)throw memberError
 if(fullName)await supabase.from('profiles').update({full_name:fullName,updated_at:new Date().toISOString()}).eq('id',user.id)
 await audit(supabase,{companyId,actorUserId:actor.user.id,targetUserId:user.id,action:'USER_INVITED',detail:{email,role}})
 return{ok:true,user_id:user.id,email,role}
}

export async function updateCompanyUserRole({request,supabase}){
 const companyId=String(request.body?.company_id||''),targetUserId=String(request.params.userId||''),nextRole=assertRole(request.body?.role);if(!companyId||!targetUserId)throw httpError('Empresa y usuario son obligatorios.')
 const actor=await actorContext({request,supabase,companyId});const {data:target,error}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',targetUserId).maybeSingle();if(error)throw error;if(!target)throw httpError('Usuario no encontrado en esta empresa.',404)
 assertActorCanManage(actor.role,String(target.role).toLowerCase(),nextRole);await ensureOwnerRule(supabase,{companyId,targetUserId,nextRole})
 const {error:updateError}=await supabase.from('company_members').update({role:nextRole}).eq('company_id',companyId).eq('user_id',targetUserId);if(updateError)throw updateError
 await audit(supabase,{companyId,actorUserId:actor.user.id,targetUserId,action:'USER_ROLE_CHANGED',detail:{from:target.role,to:nextRole}});return{ok:true,role:nextRole}
}

export async function revokeCompanyUser({request,supabase}){
 const companyId=String(request.query.company_id||''),targetUserId=String(request.params.userId||'');if(!companyId||!targetUserId)throw httpError('Empresa y usuario son obligatorios.')
 const actor=await actorContext({request,supabase,companyId});if(actor.user.id===targetUserId)throw httpError('No podés revocar tu propio acceso desde esta pantalla.',409,'SELF_REVOKE_BLOCKED')
 const {data:target,error}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',targetUserId).maybeSingle();if(error)throw error;if(!target)throw httpError('Usuario no encontrado en esta empresa.',404)
 assertActorCanManage(actor.role,String(target.role).toLowerCase(),'');await ensureOwnerRule(supabase,{companyId,targetUserId,remove:true})
 const {error:deleteError}=await supabase.from('company_members').delete().eq('company_id',companyId).eq('user_id',targetUserId);if(deleteError)throw deleteError
 await audit(supabase,{companyId,actorUserId:actor.user.id,targetUserId,action:'USER_ACCESS_REVOKED',detail:{role:target.role}});return{ok:true}
}

export async function listCompanyAdminAudit({request,supabase}){
 const companyId=String(request.query.company_id||'');if(!companyId)throw httpError('company_id es obligatorio.');await actorContext({request,supabase,companyId})
 const {data,error}=await supabase.from('company_admin_audit').select('id,actor_user_id,target_user_id,action,detail,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100);if(error)throw error;return{rows:data||[]}
}
