import test from 'node:test'
import assert from 'node:assert/strict'
import {requireCompanyAccess,COMPANY_ROLES} from '../src/security/company-access.js'

function mockSupabase(role='viewer'){
 const audits=[]
 const membership={select(){return this},eq(){return this},async maybeSingle(){return {data:role?{role}:null,error:null}}}
 const audit={async insert(row){audits.push(row);return {error:null}}}
 return {audits,auth:{async getUser(token){return token==='good'?{data:{user:{id:'u1',email:'u@example.com'}},error:null}:{data:{user:null},error:new Error('bad')}}},from(name){if(name==='company_members')return membership;if(name==='company_admin_audit')return audit;throw new Error(`Unexpected table ${name}`)}}
}
const request=(token='good')=>({headers:{authorization:`Bearer ${token}`}})

test('owner can perform admin company operation',async()=>{const supabase=mockSupabase('owner');const result=await requireCompanyAccess({request:request(),supabase,companyId:'c1',allowedRoles:COMPANY_ROLES.ADMIN,operation:'administrar'});assert.equal(result.role,'owner');assert.equal(supabase.audits.length,0)})

test('viewer is denied admin operation and denial is audited',async()=>{const supabase=mockSupabase('viewer');await assert.rejects(()=>requireCompanyAccess({request:request(),supabase,companyId:'c1',allowedRoles:COMPANY_ROLES.ADMIN,operation:'administrar'}),error=>error.code==='COMPANY_ROLE_FORBIDDEN'&&error.statusCode===403);assert.equal(supabase.audits.length,1);assert.equal(supabase.audits[0].action,'ACCESS_DENIED')})

test('invalid session is rejected before membership lookup',async()=>{const supabase=mockSupabase('owner');await assert.rejects(()=>requireCompanyAccess({request:request('bad'),supabase,companyId:'c1'}),error=>error.code==='AUTH_INVALID'&&error.statusCode===401)})

test('missing membership is rejected',async()=>{const supabase=mockSupabase(null);await assert.rejects(()=>requireCompanyAccess({request:request(),supabase,companyId:'c1'}),error=>error.code==='COMPANY_ACCESS_REQUIRED'&&error.statusCode===403)})
