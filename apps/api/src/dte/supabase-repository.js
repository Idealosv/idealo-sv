export class SupabaseDteRepository {
  constructor(supabase) { this.supabase = supabase }

  async findByGenerationCode(generationCode) {
    const { data, error } = await this.supabase.from('dte_documents')
      .select('*').eq('generation_code', generationCode).maybeSingle()
    if (error) throw error
    return data
  }

  async mark(id, status, values = {}) {
    const { data, error } = await this.supabase.from('dte_documents')
      .update({ status, ...values, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single()
    if (error) throw error
    return data
  }

  async recordAttempt(documentId, attemptNumber, request) {
    const { error } = await this.supabase.from('dte_transmission_attempts').insert({
      dte_document_id: documentId,
      attempt_number: attemptNumber,
      request_payload: request,
    })
    if (error) throw error
  }

  async recordFailure(documentId, attemptNumber, error) {
    const { error: dbError } = await this.supabase.from('dte_transmission_attempts')
      .update({ error_message: error.message, finished_at: new Date().toISOString() })
      .eq('dte_document_id', documentId).eq('attempt_number', attemptNumber)
    if (dbError) throw dbError
  }
}
