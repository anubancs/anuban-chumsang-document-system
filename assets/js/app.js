/** Shared UI helpers for the public school website. */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.schoolUI = { $, escapeHTML };
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = $('#mobile-menu-toggle'), menu = $('#mobile-menu');
    toggle?.addEventListener('click', () => menu?.classList.toggle('hidden'));
    const year = $('#current-year'); if (year) year.textContent = new Date().getFullYear();
    document.querySelectorAll('[data-counter]').forEach(el => {
      const target = Number(el.dataset.counter || 0);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { el.textContent = target.toLocaleString('th-TH'); return; }
      const start = performance.now(), duration = 1100;
      const tick = now => { const p = Math.min((now-start)/duration,1); el.textContent = Math.round(target*(1-Math.pow(1-p,3))).toLocaleString('th-TH'); if(p<1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  });
})();