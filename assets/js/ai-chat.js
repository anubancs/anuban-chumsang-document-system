(() => {
  const GAS_URL = window.SCHOOL_GAS_WEB_APP_URL || '';
  const root = document.getElementById('school-ai-chat');
  if (!root) return;
  const toggle = document.getElementById('ai-chat-toggle');
  const panel = document.getElementById('ai-chat-panel');
  const close = document.getElementById('ai-chat-close');
  const form = document.getElementById('ai-chat-form');
  const input = document.getElementById('ai-chat-input');
  const messages = document.getElementById('ai-chat-messages');
  const send = document.getElementById('ai-chat-send');
  let busy = false;
  let clientId = '';
  try { clientId = sessionStorage.getItem('school_ai_client') || ''; } catch {}
  if (!clientId) {
    clientId = 'web_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g,'') : Math.random().toString(36).slice(2));
    try { sessionStorage.setItem('school_ai_client',clientId); } catch {}
  }
  function addMessage(text, role) {
    const node = document.createElement('div');
    node.className = 'ai-chat-bubble ' + (role === 'user' ? 'ai-chat-user' : 'ai-chat-bot');
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }
  function ask(question) {
    return new Promise((resolve,reject) => {
      if (!GAS_URL) return reject(new Error('ยังไม่ได้ตั้งค่า URL ของ Google Apps Script'));
      const requestId = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2,9);
      const iframe = document.createElement('iframe');
      iframe.name = requestId;
      iframe.title = 'AI response';
      iframe.hidden = true;
      const frame = document.createElement('form');
      frame.method = 'POST'; frame.action = GAS_URL; frame.target = requestId; frame.hidden = true;
      const fields = {action:'ai_chat',request_id:requestId,client_id:clientId,message:question};
      Object.entries(fields).forEach(([name,value]) => {
        const el = document.createElement('input'); el.type='hidden'; el.name=name; el.value=value; frame.appendChild(el);
      });
      let finished = false;
      const cleanup = () => { window.removeEventListener('message',onMessage); frame.remove(); iframe.remove(); };
      const timer = setTimeout(() => { if(!finished){finished=true;cleanup();reject(new Error('หมดเวลารอคำตอบจากระบบ AI กรุณาลองอีกครั้ง'));}},65000);
      const onMessage = event => {
        if (event.source !== iframe.contentWindow) return;
        let host=''; try { host=new URL(event.origin).hostname; } catch {}
        if (!(host==='script.google.com'||host==='googleusercontent.com'||host.endsWith('.googleusercontent.com'))) return;
        const data=event.data;
        if (!data || data.type!=='school-drive-upload' || data.requestId!==requestId) return;
        if (finished) return;
        finished=true;clearTimeout(timer);cleanup();
        data.result && data.result.ok ? resolve(data.result.answer) : reject(new Error(data.result && data.result.error || 'ระบบ AI ไม่สามารถตอบได้'));
      };
      window.addEventListener('message',onMessage);
      document.body.append(iframe,frame);
      frame.submit();
    });
  }
  function setOpen(open) {
    panel.classList.toggle('hidden',!open);
    toggle.setAttribute('aria-expanded',String(open));
    if(open) input.focus();
  }
  toggle.addEventListener('click',()=>setOpen(panel.classList.contains('hidden')));
  close.addEventListener('click',()=>setOpen(false));
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const question=input.value.trim();
    if(!question||busy)return;
    busy=true;send.disabled=true;input.disabled=true;
    addMessage(question,'user');input.value='';
    const pending=addMessage('กำลังค้นข้อมูลและเรียบเรียงคำตอบ...','bot');
    try { pending.textContent=await ask(question); }
    catch(error) { pending.textContent=error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่'; }
    finally { busy=false;send.disabled=false;input.disabled=false;input.focus();messages.scrollTop=messages.scrollHeight; }
  });
})();