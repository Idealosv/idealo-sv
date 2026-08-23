import fs from 'node:fs'

const migration=fs.readFileSync(new URL('../../../supabase/migrations/20260823181000_cash_reconciliation_flow.sql',import.meta.url),'utf8')
const panel=fs.readFileSync(new URL('../src/CashReconciliationPanel.jsx',import.meta.url),'utf8')
const launcher=fs.readFileSync(new URL('../src/FinancialDashboardLauncher.jsx',import.meta.url),'utf8')
const required=[
  ['cash reconciliation table',migration.includes('cash_reconciliations')],
  ['cash balance view',migration.includes('cash_account_balances')],
  ['reconciliation rpc',migration.includes('reconcile_cash_account')],
  ['difference status',migration.includes("'MATCHED'")&&migration.includes("'DIFFERENCE'")],
  ['daily income',panel.includes('Entradas hoy')],
  ['daily expense',panel.includes('Salidas hoy')],
  ['net cash flow',panel.includes('Flujo neto hoy')],
  ['financial dashboard integration',launcher.includes('CashReconciliationPanel')],
]
const failed=required.filter(([,ok])=>!ok)
if(failed.length){console.error('Cash reconciliation audit failed:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log('Cash reconciliation audit OK')
