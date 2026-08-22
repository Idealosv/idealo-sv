import { requestJson } from './http.js'

const PATHS = Object.freeze({
  auth: '/seguridad/auth',
  receive: '/fesv/recepciondte',
  receiveBatch: '/fesv/recepcionlote',
  query: '/fesv/recepcion/consultadte',
  contingency: '/fesv/contingencia',
  invalidate: '/fesv/anulardte',
})

export class MhDteClient {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config
    this.fetchImpl = fetchImpl
    this.token = null
  }

  async authenticate() {
    const body = new URLSearchParams({ user: this.config.nit, pwd: this.config.apiPassword })
    const response = await requestJson(`${this.config.mhBaseUrl}${PATHS.auth}`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    }, this.requestOptions())
    this.token = response?.body?.token || response?.token
    if (!this.token) throw new Error('Hacienda no devolvió un token de autenticación.')
    return this.token
  }

  async receive(payload) { return this.authorizedPost(PATHS.receive, payload) }
  async receiveBatch(payload) { return this.authorizedPost(PATHS.receiveBatch, payload) }
  async query(payload) { return this.authorizedPost(PATHS.query, payload) }
  async reportContingency(payload) { return this.authorizedPost(PATHS.contingency, payload) }
  async invalidate(payload) { return this.authorizedPost(PATHS.invalidate, payload) }

  async authorizedPost(path, payload) {
    if (!this.token) await this.authenticate()
    return requestJson(`${this.config.mhBaseUrl}${path}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { authorization: this.token },
    }, this.requestOptions())
  }

  requestOptions() {
    return { timeoutMs: this.config.requestTimeoutMs, fetchImpl: this.fetchImpl }
  }
}
