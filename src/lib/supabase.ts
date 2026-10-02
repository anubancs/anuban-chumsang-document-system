import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://uwebbofczidcfnjbvsqu.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3xMsRwdyNUhPsnJiH34O9w_hnF8BUiV'

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Supabase configuration is unavailable')
}

export const supabase = createClient(url, key)
