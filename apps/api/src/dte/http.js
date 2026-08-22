export class DteHttpError extends Error {
  constructor(message, { status, body, cause } = {}) {
    super(message, { cause })
    this.name = 'DteHttpError'
    this.status = status
    this.body = body
  }
}

export async function requestJson(url, options = {}, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...options.headers },
    })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }

    if (!response.ok) {
      throw new DteHttpError(`El servicio DTE respondió HTTP ${response.status}.`, {
        status: response.status,
        body,
      })
    }
    return body
  } catch (error) {
    if (error instanceof DteHttpError) throw error
    if (error.name === 'AbortError') {
      throw new DteHttpError(`La solicitud DTE superó ${timeoutMs} ms.`, { cause: error })
    }
    throw new DteHttpError('No fue posible conectar con el servicio DTE.', { cause: error })
  } finally {
    clearTimeout(timer)
  }
}
