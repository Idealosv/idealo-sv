const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function isTransientSignerWakeError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0)
  // A sleeping Render instance responds with 502/503/504 while Java starts.
  // Credentials and invalid document errors must never be retried.
  return status === 0 || [429, 502, 503, 504].includes(status)
}

export async function waitForSignerReady({
  signer,
  maxWaitMs = 120000,
  requestTimeoutMs = 15000,
  retryDelayMs = 2500,
  now = Date.now,
  sleep = defaultSleep,
}) {
  const deadline = now() + maxWaitMs
  let lastError = null
  while (now() < deadline) {
    try {
      const health = await signer.warmup({
        timeoutMs: Math.max(1, Math.min(requestTimeoutMs, deadline - now())),
      })
      if (health?.status && health.status !== 'UP') {
        const error = new Error('El firmador todavía no está listo.')
        error.status = 503
        throw error
      }
      return health
    } catch (error) {
      if (!isTransientSignerWakeError(error)) throw error
      lastError = error
    }
    const remaining = deadline - now()
    if (remaining > 0) await sleep(Math.min(retryDelayMs, remaining))
  }

  const error = new Error('El firmador está tardando en iniciar. El DTE permanece en borrador; comprobá Hacienda antes de firmarlo nuevamente.')
  error.statusCode = 503
  error.cause = lastError
  throw error
}
