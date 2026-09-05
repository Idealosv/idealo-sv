import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const gradlePath = path.resolve(root, 'android/app/build.gradle')
const marker = '// IDEALO_ANDROID_RELEASE_SIGNING'

if (!fs.existsSync(gradlePath)) {
  throw new Error(`No existe ${gradlePath}`)
}

let gradle = fs.readFileSync(gradlePath, 'utf8')
if (gradle.includes(marker)) {
  console.log('Firma Android release ya preparada.')
  process.exit(0)
}

const required = [
  'IDEALO_ANDROID_KEYSTORE_PATH',
  'IDEALO_ANDROID_KEYSTORE_PASSWORD',
  'IDEALO_ANDROID_KEY_ALIAS',
  'IDEALO_ANDROID_KEY_PASSWORD',
]
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  throw new Error(`Faltan variables para firma Android: ${missing.join(', ')}`)
}

const androidOpen = /android\s*\{/
if (!androidOpen.test(gradle)) {
  throw new Error('No se encontró bloque android en build.gradle')
}

gradle = gradle.replace(androidOpen, (match) => `${match}\n    ${marker}\n    signingConfigs {\n        release {\n            storeFile file(System.getenv('IDEALO_ANDROID_KEYSTORE_PATH'))\n            storePassword System.getenv('IDEALO_ANDROID_KEYSTORE_PASSWORD')\n            keyAlias System.getenv('IDEALO_ANDROID_KEY_ALIAS')\n            keyPassword System.getenv('IDEALO_ANDROID_KEY_PASSWORD')\n        }\n    }`)

const buildRelease = /buildTypes\s*\{\s*release\s*\{/
if (!buildRelease.test(gradle)) {
  throw new Error('No se encontró buildTypes.release en build.gradle')
}

gradle = gradle.replace(buildRelease, (match) => `${match}\n            signingConfig signingConfigs.release`)
fs.writeFileSync(gradlePath, gradle)
console.log('OK firma Android release preparada.')
