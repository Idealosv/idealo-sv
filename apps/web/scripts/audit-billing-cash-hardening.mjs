import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const need=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label}: falta ${token}`)}
const forbid=(text,token,label)=>{if(text.includes(token))throw new Error(`${label}: no debe contener ${token}`)}

const billing=read('apps/web/src/Billing360Dashboard.jsx')
const cash=read('apps/web/src/CashControlCenter.jsx')
const shift=read('apps/web/src/CashRegisterShift.jsx')
const reconciliation=read('apps/web/src/CashReconciliationPanel.jsx')
const income=read('apps/web/src/InternalIncomeCard.jsx')
const dates=read('apps/web/src/billingReceivables.js')
const migration=read('supabase/migrations/20260908102500_billing_cash_audit_hardening.sql')

for(const token of ["billing_control_snapshot","timeZone:'America/El_Salvador'",'los indicadores sí consideran el total completo'])need(billing,token,'Facturación 360')
for(const token of ["from('accounts_receivable')","requestModule('Cuentas por cobrar'",'income_today','expense_today'])need(cash,token,'Caja usa fuentes canónicas')
forbid(cash,'paidByQuote','Caja no reconstruye CxC desde cotizaciones')
for(const token of ["rpc('open_cash_register'","rpc('create_cash_register_cut'","rpc('close_cash_register'",'localIsoDate()'])need(shift,token,'Turno de Caja')
forbid(shift,"from('cash_register_sessions').insert",'Turno no escribe sesión directamente')
forbid(shift,"from('cash_register_sessions').update",'Turno no cierra sesión directamente')
forbid(shift,"from('cash_register_cuts').insert",'Corte no escribe directamente')
for(const token of ["cash_account_balance_as_of",'localIsoDate()','Saldo ERP a esa fecha'])need(reconciliation,token,'Conciliación histórica')
for(const token of ["from('accounts_receivable')","eq('environment','production')",'Anticipo de trabajo','Cuentas por cobrar'])need(income,token,'Anticipos separados de cobros facturados')
for(const token of ["timeZone:'America/El_Salvador'",'formatToParts'])need(dates,token,'Fecha contable SV')
for(const token of ["America/El_Salvador",'DTE_PAYMENT','drop trigger if exists trg_sync_dte_to_receivable','cash_account_balance_as_of','billing_control_snapshot','public.cash_account_balances b','Este trabajo ya fue facturado'])need(migration,token,'Migración Facturación/Caja')
forbid(migration,'select balance,upper(coalesce(account_type','Reversión no usa columna cash_accounts.balance inexistente')

console.log('OK auditoría Facturación + Caja: DTE/CxC/Caja alineados, fecha SV, turnos RPC, conciliación histórica y cobros sin duplicidad')
