const ALLOWED_EVENTS=new Set(['ACCESS_DENIED','READ_ONLY_BLOCKED'])
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}
function httpError(message,statusCode=400,code='SECURITY_AUDIT_ERROR'){const error=new Error(message);error.statusCode=statusCode;error.code=code;return error}
function maskIp(value=''){const ip=String(value||'');if(!ip)return'';if(ip.includes(':'))return`${ip.split(':').slice(0,3).join(':')}::`;const p=ip.split('.');return p.length===4?`${p[0]}.${p[1]}.${p[2]}.xxx`:ip}
function clientIp(request){const forwarded=String(request.headers?.['x-forwarded-for']||'').split(',')[0].trim();return forwarded||String(request.ip||request.socket?.remoteAddress||'')}

export async function recordSecurityAuditEvent({request,supabase}){
 const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED')
 const {data:{user},error:userError}=await supabase.auth.getUser(token);if(userError||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID')
 const companyId=String(request.body?.company_id||'');if(!companyId)throw httpError('company_id es obligatorio.')
 const {data:membership,error:membershipError}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle();if(membershipError)throw membershipError;if(!membership)throw httpError('No tenés acceso a esta empresa.',403,'COMPANY_ACCESS_REQUIRED')
 const action=String(request.body?.action||'ACCESS_DENIED').toUpperCase();if(!ALLOWED_EVENTS.has(action))throw httpError('Evento de seguridad no permitido.',400,'SECURITY_EVENT_NOT_ALLOWED')
 const moduleName=String(request.body?.module||'ERP').slice(0,80)
 const reason=String(request.body?.reason||'Acción bloqueada por permisos.').slice(0,240)
 const control=String(request.body?.control||'role_policy').slice(0,80)
 const detail={module:moduleName,reason,control,role:String(membership.role||''),ip:maskIp(clientIp(request)),user_agent:String(request.headers?.['user-agent']||'').slice(0,220)}
 const {error}=await supabase.from('company_admin_audit').insert({company_id:companyId,actor_user_id:user.id,target_user_id:user.id,action,detail});if(error)throw error
 return{ok:true,action,module:moduleName,recorded_at:new Date().toISOString()}
}
