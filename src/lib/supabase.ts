import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
const validUrl = (() => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))
  } catch {
    return false
  }
})()

export const configured = Boolean(validUrl && key && !key.includes('YOUR_'))

// Keep the module importable when environment variables are missing; the UI shows
// a setup message before any Supabase requests are made.
export const supabase = createClient(
  validUrl ? url : 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key',
)
