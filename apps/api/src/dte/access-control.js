function httpError(message,statusCode=403,code='DTE_FORBIDDEN'){const error=new Error(message);error.statusCode=statusCode;error.code=code;return error}

export function bearerToken(request){const authorization=String(request.headers?.authorization||'');return authorization.startsWith('Bearer ')?authorization.slice(7).trim():''}

export async function requireAuthenticatedUser({request,supabase}){
 const token=bearerToken(request)
 if(!token)throw httpError('Debes iniciar sesión para realizar esta operación DTE.',401,'AUTH_REQUIRED')
 const {data,error}=await supabase.auth.getUser(token)
 if(error||!data?.user)throw httpError('La sesión no es válida o ya venció.',401,'AUTH_INVALID')
 return data.user
}

export async function requireCompanyRole({supabase,companyId,userId,allowedRoles,operation='realizar esta operación DTE'}){
 const {data:membership,error}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',userId).maybeSingle()
 if(error)throw error
 const role=String(membership?.role||'').toLowerCase()
 if(!role)throw httpError('No tienes acceso a esta empresa.',403,'COMPANY_ACCESS_REQUIRED')
 if(!allowedRoles.includes(role)){
  await registerDeniedAttempt(supabase,{companyId,userId,role,operation,allowedRoles})
  throw httpError(`Tu rol no tiene permiso para ${operation}.`,403,'DTE_ROLE_FORBIDDEN')
 }
 return role
}

async function registerDeniedAttempt(supabase,{companyId,userId,role,operation,allowedRoles}){
 try{await supabase.from('company_admin_audit').insert({company_id:companyId,actor_user_id:userId,target_user_id:userId,action:'DTE_ACCESS_DENIED',detail:{role,operation,allowed_roles:allowedRoles}})}catch(error){console.error('No se pudo auditar un acceso DTE rechazado:',error?.message||error)}
}

export const DTE_ROLES={
 DRAFT:['owner','admin'],
 SIGN:['owner','admin'],
 TRANSMIT_TEST:['owner','admin'],
 TRANSMIT_PRODUCTION:['owner'],
}
