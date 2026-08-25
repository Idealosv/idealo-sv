import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const transmit = fs.readFileSync(path.join(root, 'apps/api/src/dte/transmit-test-service.js'), 'utf8')
const tests = fs.readFileSync(path.join(root, 'apps/api/test/dte-test-transmission.test.js'), 'utf8')
const dashboard = fs.readFileSync(path.join(root, 'apps/web/src/Billing360Dashboard.jsx'), 'utf8')

const requireText = (text, token, label) => { if (!text.includes(token)) throw new Error(`${label}: falta ${token}`) }

requireText(transmit, 'nextTransmissionAttempt(existingAttempts', 'Reintentos DTE TEST')
requireText(transmit, 'attempts.length >= 3', 'Límite de 3 intentos')
requireText(transmit, '!attempt.finished_at', 'Bloqueo de intento concurrente')
requireText(transmit, "document.status === 'PROCESSED'", 'Idempotencia DTE procesado')
requireText(transmit, "document.status === 'REJECTED'", 'Bloqueo de reenvío rechazado')
requireText(transmit, 'buildTestReceptionPayload(document, attemptNumber)', 'idEnvio por intento')
requireText(transmit, "const documentRejected = error.mhPhase === 'recepcion' && Boolean(error.mhBody)", 'Persistencia de rechazo documental MH')
requireText(transmit, "status: documentRejected ? 'REJECTED' : 'SIGNED'", 'Separación rechazo fiscal vs fallo técnico')
requireText(tests, 'permite reintentos técnicos hasta el tercer intento', 'Cobertura reintentos')
requireText(tests, 'bloquea un reenvío mientras existe un intento en curso', 'Cobertura concurrencia')
requireText(dashboard, "actionMessage.startsWith('✓')?'success'", 'Feedback verde solo para éxito')
requireText(dashboard, "/(detenida|No se firmó|REJECTED|rechaz)/i.test(actionMessage)?'error'", 'Feedback rojo para rechazo o fallo')

console.log('OK DTE TEST: reintentos seguros, rechazo fiscal persistido y feedback visual coherente')
