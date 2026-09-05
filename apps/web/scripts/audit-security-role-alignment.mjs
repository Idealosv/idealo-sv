import fs from 'node:fs'
import path from 'node:path'
const root=path.resolve(process.cwd())
const read=file=>fs.readFileSync(path.join(root,file),'utf8')
const access=read('src/erp-access-control.js')
const runtime=read('src/AccessControlRuntime.jsx')
const menu=read('src/MainMenuController.jsx')
const admin=read('src/UsersAdministrationCenter.jsx')
const checks=[
 ['owner/admin/staff/viewer roles are defined',/owner:[\s\S]*admin:[\s\S]*staff:[\s\S]*viewer:/.test(access)],
 ['viewer is read only',/isReadOnlyRole\(role\)/.test(runtime)&&/READ_ONLY_BLOCKED/.test(runtime)],
 ['runtime resolves active company before membership',/get_my_companies/.test(runtime)&&/eq\('company_id',activeCompanyId\)/.test(runtime)],
 ['menu resolves active company before membership',/get_my_companies/.test(menu)&&/eq\('company_id',companies\[0\]\.id\)/.test(menu)],
 ['menu auth callback does not call getSession recursively',!/onAuthStateChange\([^\n]+loadRole/.test(menu)],
 ['audit displays denied and business events',/ACCESS_DENIED/.test(admin)&&/ERP_RECORD_UPDATED/.test(admin)],
 ['security screen includes 2FA controls',/Autenticación de dos pasos|2FA/.test(admin)],
]
const failed=checks.filter(([,ok])=>!ok)
for(const [name,ok] of checks)console.log(`${ok?'✓':'✗'} ${name}`)
if(failed.length){console.error(`Security alignment audit failed: ${failed.map(([name])=>name).join(', ')}`);process.exit(1)}
console.log('Security role alignment audit passed.')
