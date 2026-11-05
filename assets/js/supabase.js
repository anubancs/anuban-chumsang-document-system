/**
 * Supabase browser client.
 * Publishable key is intentionally public; database RLS is the security boundary.
 * Never place service_role / sb_secret keys in this file.
 */
(() => {
  const CONFIG = {
    url: 'https://uwebbofczidcfnjbvsqu.supabase.co',
    publishableKey: 'sb_publishable_3xMsRwdyNUhPsnJiH34O9w_hnF8BUiV'
  };
  if (!window.supabase) throw new Error('Supabase JS CDN did not load.');
  if (!CONFIG.url || !CONFIG.publishableKey) throw new Error('Configure Supabase URL and publishable key.');
  window.schoolSupabase = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();