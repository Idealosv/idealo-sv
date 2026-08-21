import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const isSupabaseConfigured = Boolean(url && serviceRoleKey)

let adminClient

export function getSupabaseAdmin() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase todavía no está configurado en la API.')
  }

  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return adminClient
}
