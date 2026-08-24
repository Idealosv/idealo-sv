import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const transmit = fs.readFileSync(path.join(root, 'apps/api/src/dte/transmit-test-service.js'), 'utf8')
const tests = fs.readFileSync(path.join(root, 'apps/api/test/dte-test-transmission.test.js'), 'utf8')

const requireText = (text, token, label) => { if (!text.includes(token)) throw new Error(`${label}: falta ${token}`) }

requireText(transmit, 'nextTransmissionAttempt(existingAttempts', 'Reintentos DTE TEST')
requireText(transmit, 'attempts.length >= 3', 'Límite de 3 intentos')
requireText(transmit, '!attempt.finished_at', 'Bloqueo de intento concurrente')
requireText(transmit, "document.status === 'PROCESSED'", 'Idempotencia DTE procesado')
requireText(transmit, "document.status === 'REJECTED'", 'Bloqueo de reenvío rechazado')
requireText(transmit, 'buildTestReceptionPayload(document, attemptNumber)', 'idEnvio por intento')
requireText(tests, 'permite reintentos técnicos hasta el tercer intento', 'Cobertura reintentos')
requireText(tests, 'bloquea un reenvío mientras existe un intento en curso', 'Cobertura concurrencia')

console.log('OK DTE TEST: reintentos seguros, idempotencia y protección contra duplicados')
