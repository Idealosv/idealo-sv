import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const platform = process.argv[2]
const root = resolve(process.cwd())

const exists = async path => {
  try { await access(path); return true } catch { return false }
}

const patchIos = async () => {
  const plist = resolve(root, 'ios/App/App/Info.plist')
  if (!(await exists(plist))) throw new Error(`No existe Info.plist: ${plist}`)
  let text = await readFile(plist, 'utf8')
  const permissions = [
    ['NSCameraUsageDescription', 'IDEALO SV usa la cámara para adjuntar evidencia fotográfica de producción, instalación y entrega.'],
    ['NSPhotoLibraryUsageDescription', 'IDEALO SV permite elegir fotografías para adjuntarlas como evidencia de trabajo.'],
    ['NSLocationWhenInUseUsageDescription', 'IDEALO SV usa tu ubicación durante el trabajo para registrar evidencia y entregas con referencia GPS.'],
  ]
  for (const [key, value] of permissions) {
    if (text.includes(`<key>${key}</key>`)) continue
    const insertion = `\t<key>${key}</key>\n\t<string>${value}</string>\n`
    text = text.replace('</dict>', `${insertion}</dict>`)
  }
  await writeFile(plist, text)
  for (const [key] of permissions) {
    if (!text.includes(`<key>${key}</key>`)) throw new Error(`No se pudo agregar ${key}`)
  }
  console.log('OK iOS: permisos de cámara, fotos y ubicación declarados en Info.plist.')
}

const patchAndroid = async () => {
  const manifest = resolve(root, 'android/app/src/main/AndroidManifest.xml')
  if (!(await exists(manifest))) throw new Error(`No existe AndroidManifest.xml: ${manifest}`)
  let text = await readFile(manifest, 'utf8')
  const permissions = [
    'android.permission.CAMERA',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
  ]
  for (const permission of permissions) {
    if (text.includes(`android:name="${permission}"`)) continue
    text = text.replace('<application', `    <uses-permission android:name="${permission}" />\n\n    <application`)
  }
  await writeFile(manifest, text)
  for (const permission of permissions) {
    if (!text.includes(`android:name="${permission}"`)) throw new Error(`No se pudo agregar ${permission}`)
  }
  console.log('OK Android: permisos de cámara y ubicación declarados en AndroidManifest.xml.')
}

if (platform === 'ios') await patchIos()
else if (platform === 'android') await patchAndroid()
else throw new Error('Uso: node scripts/patch-native-mobile-permissions.mjs ios|android')
