function signedDocument(response) {
  const value = response?.body || response
  return value?.documento || value?.document || value
}

export class DteOrchestrator {
  constructor({ mhClient, signerClient, repository, maxResends = 2 }) {
    this.mh = mhClient
    this.signer = signerClient
    this.repository = repository
    this.maxResends = Math.min(maxResends, 2)
  }

  async transmit({ documentId, generationCode, dte, receptionPayload }) {
    const existing = await this.repository.findByGenerationCode(generationCode)
    if (existing?.status === 'PROCESSED') return existing

    await this.repository.mark(documentId, 'SIGNING')
    const signResponse = await this.signer.sign(dte)
    const document = signedDocument(signResponse)
    if (!document || typeof document !== 'string') {
      throw new Error('El firmador no devolvió el documento JWS.')
    }

    await this.repository.mark(documentId, 'SIGNED', { signed_document: document })
    const payload = { ...receptionPayload, documento: document }

    for (let attempt = 0; attempt <= this.maxResends; attempt += 1) {
      await this.repository.recordAttempt(documentId, attempt + 1, payload)
      try {
        const response = await this.mh.receive(payload)
        const status = response?.estado === 'PROCESADO' ? 'PROCESSED' : 'REJECTED'
        return this.repository.mark(documentId, status, { mh_response: response })
      } catch (error) {
        await this.repository.recordFailure(documentId, attempt + 1, error)
        const query = await this.mh.query({ codigoGeneracion: generationCode })
        if (query?.estado === 'PROCESADO') {
          return this.repository.mark(documentId, 'PROCESSED', { mh_response: query })
        }
        if (attempt === this.maxResends) throw error
      }
    }
  }
}
