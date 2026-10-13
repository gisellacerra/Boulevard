/* Puente entre Google Apps Script HTMLService y Apps Script Execution API.
   El control de acceso real debe implementarse TAMBIÉN en el servidor. */
(() => {
  'use strict';
  const CLIENT_ID='158432822961-m49sji0hneqt4u6rkobbngt08c8c2mhn.apps.googleusercontent.com';
  const SCRIPT_ID='AKfycbxEo9D7klkUJ7ZiSrRCB3ljr0VHNOdpG6Q7DpZ2FCEGhaqRRYpQTMrjLslR3PiWPWxZow';
  const SCOPES='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email';
  let token='', client;
  let tokenExpiresAt=0;
  let renewal=null;
  let authorized=false;
  const pending=[];
  function flushPending(){
    while(pending.length){
      const task=pending.shift();
      runAPI(task.func,task.args).then(task.resolve,task.reject);
    }
  }
  function queuedAPI(func,args){
    if(authorized)return runAPI(func,args);
    return new Promise((resolve,reject)=>pending.push({func,args,resolve,reject}));
  }
  const overlay=document.createElement('div');
  overlay.id='newcom-auth';
  overlay.style.cssText='position:fixed;inset:0;z-index:999999;background:#f3f6f3;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#18362e;padding:20px';
  overlay.innerHTML='<section style="width:min(430px,100%);background:white;border:1px solid #dbe7de;border-radius:18px;padding:32px;box-shadow:0 12px 45px #123e321c"><h1 style="font-size:24px">Asistente de Torneos Newcom</h1><p>Acceso privado para administradores autorizados.</p><button id="newcom-login" disabled style="background:#177a51;color:white;border:0;padding:13px 18px;border-radius:9px;cursor:pointer;font-weight:bold">Preparando acceso…</button><p id="newcom-login-status" style="font-size:13px;line-height:1.5"></p></section>';
  document.addEventListener('DOMContentLoaded',()=>{document.body.appendChild(overlay);document.getElementById('newcom-login').onclick=()=>client.requestAccessToken({prompt:'select_account'});});
  const ready=()=>{
    if(!window.google?.accounts?.oauth2){setTimeout(ready,100);return;}
    client=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,callback:response=>{
      const status=document.getElementById('newcom-login-status');
      if(response.error){if(renewal){renewal.reject(Error(response.error));renewal=null;}if(status)status.textContent='No se pudo autorizar: '+response.error;return;}
      token=response.access_token || '';
      tokenExpiresAt=Date.now()+Math.max(0,(Number(response.expires_in)||3500)-90)*1000;
      if(renewal){renewal.resolve(token);renewal=null;}
      // La verificación de cuenta debe estar también en Apps Script.
      runAPI('adminVerificarAccesoNewcom',[]).then(ok=>{
        if(ok!==true)throw Error('Esta cuenta no está autorizada para administrar el torneo.');
        authorized=true;
        overlay.remove();
        flushPending();
        document.dispatchEvent(new Event('newcom-autorizado'));
      }).catch(e=>{token='';authorized=false;if(status)status.textContent=e.message;});
    }});
    const b=document.getElementById('newcom-login');if(b){b.disabled=false;b.textContent='Ingresar con Google';}
  };
  ready();
  async function runAPI(func,parameters){
    if(!token || Date.now()>=tokenExpiresAt){
      if(!authorized)throw Error('Iniciá sesión para continuar.');
      if(!renewal){
        renewal={};
        renewal.promise=new Promise((resolve,reject)=>{renewal.resolve=resolve;renewal.reject=reject;});
        try{client.requestAccessToken({prompt:''});}catch(e){renewal.reject(e);renewal=null;throw e;}
      }
      await renewal.promise;
      if(!token)throw Error('No se pudo renovar la sesión de Google.');
    }
    const response=await fetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(SCRIPT_ID)+':run',{
      method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({function:func,parameters,devMode:false})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error?.message||'Error HTTP '+response.status);
    if(data.error)throw Error(data.error.details?.[0]?.errorMessage||data.error.message||'Error del servidor');
    return data.response?.result;
  }
  function runner(success,failure){
    return new Proxy({}, {get(_target,prop){
      if(prop==='withSuccessHandler')return cb=>runner(cb,failure);
      if(prop==='withFailureHandler')return cb=>runner(success,cb);
      if(prop==='withUserObject')return ()=>runner(success,failure);
      if(typeof prop==='string')return (...args)=>{queuedAPI(prop,args).then(r=>success?.(r)).catch(e=>failure?failure(e):console.error('Error de API:',e));};
    }});
  }
  // Evitar que el código original realice llamadas antes de la autenticación.
  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=runner();
  window.newcomAPI={run:queuedAPI,authenticated:()=>authorized&&!!token};
})();
