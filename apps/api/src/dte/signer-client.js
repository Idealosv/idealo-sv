import { requestJson } from './http.js'

export class DteSignerClient {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config
    this.fetchImpl = fetchImpl
  }

  status() {
    return requestJson(`${this.config.signerUrl}/firmardocumento/status`, {}, this.requestOptions())
  }

  sign(dte) {
    return requestJson(`${this.config.signerUrl}/firmardocumento/`, {
      method: 'POST',
      body: JSON.stringify({
        nit: this.config.nit,
        activo: true,
        passwordPri: this.config.signerPassword,
        dteJson: dte,
      }),
    }, this.requestOptions())
  }

  requestOptions() {
    return { timeoutMs: this.config.requestTimeoutMs, fetchImpl: this.fetchImpl }
  }
}
