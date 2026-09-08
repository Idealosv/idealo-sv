import { requestJson } from './http.js'

export class DteSignerClient {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config
    this.fetchImpl = fetchImpl
  }

  warmup({ timeoutMs = 45000 } = {}) {
    return requestJson(`${this.config.signerUrl}/actuator/health`, {}, {
      timeoutMs,
      fetchImpl: this.fetchImpl,
      headers: {},
    })
  }

  status() {
    return requestJson(`${this.config.signerUrl}/firmardocumento/status`, {}, this.requestOptions())
  }

  diagnostic() {
    return requestJson(`${this.config.signerUrl}/diagnostico-certificado`, {}, this.requestOptions())
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
    return {
      timeoutMs: this.config.requestTimeoutMs,
      fetchImpl: this.fetchImpl,
      headers: { 'x-signer-token': this.config.signerToken },
    }
  }
}
