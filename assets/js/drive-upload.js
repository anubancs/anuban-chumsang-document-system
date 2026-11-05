/** Authenticated image uploader for the school's Google Drive. */
(() => {
  window.SCHOOL_GAS_WEB_APP_URL = window.SCHOOL_GAS_WEB_APP_URL || '';
  const maxBytes=6*1024*1024;
  const base64=file=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
    reader.onerror=()=>reject(new Error('อ่านไฟล์ภาพไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
  async function upload(file,moduleName) {
    if(!window.SCHOOL_GAS_WEB_APP_URL) throw new Error('ยังไม่ได้ตั้งค่า URL ของ Google Apps Script');
    if(!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) throw new Error('รองรับ JPG, PNG, WEBP และ GIF เท่านั้น');
    if(file.size>maxBytes) throw new Error('ภาพต้องมีขนาดไม่เกิน 6 MB');
    const {data:{session},error}=await window.schoolSupabase.auth.getSession();
    if(error||!session?.access_token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
    const params=new URLSearchParams({action:'upload',access_token:session.access_token,module:moduleName,
      filename:file.name,mimeType:file.type,base64:await base64(file)});
    const response=await fetch(window.SCHOOL_GAS_WEB_APP_URL,{method:'POST',body:params});
    if(!response.ok) throw new Error('อัปโหลดไม่สำเร็จ (HTTP '+response.status+')');
    const result=await response.json();
    if(!result.ok||!result.url) throw new Error(result.error||'Google Drive บันทึกภาพไม่สำเร็จ');
    return result;
  }
  window.schoolDrive={upload};
  document.addEventListener('change',async event=>{
    const input=event.target.closest('[data-drive-upload]');
    if(!input||!input.files?.length) return;
    const target=document.querySelector(input.dataset.driveTarget);
    const status=document.querySelector(input.dataset.driveStatus||'');
    if(!target) return;
    input.disabled=true;
    if(status) status.textContent='กำลังอัปโหลดภาพ...';
    try {
      const urls=[];
      for(const file of Array.from(input.files)) urls.push((await upload(file,input.dataset.driveUpload)).url);
      target.value=(input.multiple||input.dataset.driveAppend==='true')
        ? [target.value.trim(),...urls].filter(Boolean).join('\n') : urls[0];
      target.dispatchEvent(new Event('input',{bubbles:true}));
      if(status) status.textContent='อัปโหลดสำเร็จ '+urls.length+' ภาพ · URL ถูกเติมให้แล้ว';
    } catch(error) {
      if(status) status.textContent=error.message;
      if(window.Swal) Swal.fire('อัปโหลดภาพไม่สำเร็จ',error.message,'error');
    } finally { input.disabled=false; input.value=''; }
  });
})();
