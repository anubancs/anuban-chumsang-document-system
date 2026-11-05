/** Public data access and safe contact submission. */
(() => {
  const db = () => window.schoolSupabase;\n  // Paste the deployed Apps Script Web App URL here (ends in /exec).\n  window.SCHOOL_GAS_WEB_APP_URL = window.SCHOOL_GAS_WEB_APP_URL || '';
  const ui = () => window.schoolUI;
  window.schoolAPI = {
    async latestNews(limit = 4) {
      const { data, error } = await db().from('news').select('id,title,slug,excerpt,cover_image_url,published_at,is_pinned')
        .eq('status','published').lte('published_at',new Date().toISOString())
        .order('is_pinned',{ascending:false}).order('published_at',{ascending:false}).limit(limit);
      if (error) throw error; return data || [];
    },
    async personnel() {
      const { data, error } = await db().from('personnel').select('id,full_name,position,department,bio,photo_url,personal_website_url,social_links')
        .eq('is_published',true).order('sort_order').order('full_name');
      if (error) throw error; return data || [];
    },
    async submitContact(form) {
      const payload = Object.fromEntries(new FormData(form).entries());
      const { error } = await db().from('contact_messages').insert({
        sender_name: payload.sender_name, sender_email: payload.sender_email || null,
        subject: payload.subject || null, message: payload.message
      });
      if (error) throw error;
      // Fire-and-forget notification. GAS token is stored in Script Properties, never here.
      const endpoint = window.SCHOOL_GAS_WEB_APP_URL;
      if (endpoint) {
        const body = new URLSearchParams({action:'notify', name:payload.sender_name, email:payload.sender_email || '', subject:payload.subject || '', message:payload.message});
        fetch(endpoint,{method:'POST',mode:'no-cors',body}).catch(() => {});
      }
    }
  };
})();