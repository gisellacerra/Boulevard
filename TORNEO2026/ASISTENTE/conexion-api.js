/* Conexión Google OAuth + Apps Script Execution API para Newcom. */
(() => {
  'use strict';
  const CLIENT_ID='158432822961-m49sji0hneqt4u6rkobbngt08c8c2mhn.apps.googleusercontent.com';
  const SCRIPT_ID='16wIlEc2ZRx67KmItEddvmkm9iCHo5QP1AE5X6rY-kz7Gz3H3K_LhAJaU';
  const SCOPES='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email';
  let token='', client, tokenExpiresAt=0, renewal=null, authorized=false, verifying=false;
  const pending=[];
  // La sesión dura como máximo lo que dura el token OAuth. No se guarda un refresh token.
  const SESSION_KEY='newcom_google_access_v1';
  function clearSavedSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch(_e){}}
  function saveSession(){try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({token,expiresAt:tokenExpiresAt}));}catch(_e){}}
  const overlay=document.createElement('div');
  overlay.id='newcom-auth';
  overlay.style.cssText='position:fixed;inset:0;z-index:999999;background:#f3f6f3;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#18362e;padding:20px';
  overlay.innerHTML='<section style="width:min(430px,100%);background:white;border:1px solid #dbe7de;border-radius:18px;padding:32px;box-shadow:0 12px 45px #123e321c"><h1 style="font-size:24px">Asistente de Torneos Newcom</h1><p>Acceso privado para administradores autorizados.</p><button id="newcom-login" disabled style="background:#177a51;color:white;border:0;padding:13px 18px;border-radius:9px;cursor:pointer;font-weight:bold">Preparando acceso…</button><p id="newcom-login-status" role="status" aria-live="polite" style="font-size:13px;line-height:1.5"></p></section>';
  function showState(busy,message){
    const button=overlay.querySelector('#newcom-login');
    const status=overlay.querySelector('#newcom-login-status');
    if(button){button.disabled=busy || !client;button.style.display=busy && verifying?'none':'inline-block';button.textContent=busy?'Preparando acceso…':'Ingresar con Google';}
    if(status)status.textContent=message||'';
  }
  function flushPending(){
    while(pending.length){const task=pending.shift();runAPI(task.func,task.args).then(task.resolve,task.reject);}
  }
  function queuedAPI(func,args){
    if(authorized)return runAPI(func,args);
    return new Promise((resolve,reject)=>pending.push({func,args,resolve,reject}));
  }
  function attach(){
    if(!overlay.isConnected)document.body.appendChild(overlay);
    const button=overlay.querySelector('#newcom-login');
    button.onclick=()=>{
      if(!client || verifying)return;
      verifying=true;
      showState(true,'Seleccioná tu cuenta de Google para continuar…');
      try{client.requestAccessToken({prompt:''});}catch(e){verifying=false;showState(false,e.message||'No se pudo abrir Google.');}
    };
    if(client && !verifying)showState(false,'');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
  function ready(){
    if(!window.google?.accounts?.oauth2){setTimeout(ready,100);return;}
    client=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,callback:response=>{
      if(response.error){
        if(renewal){renewal.reject(Error(response.error));renewal=null;}
        verifying=false;showState(false,'No se pudo autorizar: '+response.error);return;
      }
      token=response.access_token||'';
      tokenExpiresAt=Date.now()+Math.max(0,(Number(response.expires_in)||3500)-90)*1000;
      if(renewal){saveSession();renewal.resolve(token);renewal=null;return;}
      verifying=true;
      showState(true,'Verificando acceso…');
      runAPI('adminVerificarAccesoNewcom',[]).then(ok=>{
        if(ok!==true)throw Error('Esta cuenta no está autorizada para administrar el torneo.');
        authorized=true;verifying=false;
        saveSession();
        overlay.remove();
        flushPending();
        document.dispatchEvent(new Event('newcom-autorizado'));
      }).catch(e=>{
        token='';authorized=false;verifying=false;clearSavedSession();
        showState(false,e.message||'No se pudo verificar el acceso.');
      });
    }});
    // Al actualizar (F5), reutilizar el token temporal y volver a comprobar
    // los permisos en el servidor antes de mostrar el asistente.
    let saved=null;
    try{saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(_e){clearSavedSession();}
    if(saved && typeof saved.token==='string' && Number(saved.expiresAt)>Date.now()+30000){
      token=saved.token;tokenExpiresAt=Number(saved.expiresAt);verifying=true;
      showState(true,'Recuperando sesión…');
      runAPI('adminVerificarAccesoNewcom',[]).then(ok=>{
        if(ok!==true)throw Error('Acceso no autorizado.');
        authorized=true;verifying=false;overlay.remove();flushPending();
        document.dispatchEvent(new Event('newcom-autorizado'));
      }).catch(()=>{
        token='';authorized=false;verifying=false;clearSavedSession();
        showState(false,'La sesión venció o no se pudo validar. Ingresá con Google.');
      });
    }else{
      clearSavedSession();
      if(overlay.isConnected && !verifying)showState(false,'');
    }
  }
  ready();
  async function runAPI(func,parameters){
    if(!token || Date.now()>=tokenExpiresAt){
      if(!authorized)throw Error('Iniciá sesión para continuar.');
      if(!renewal){
        const current={};
        current.promise=new Promise((resolve,reject)=>{current.resolve=resolve;current.reject=reject;});
        renewal=current;
        try{client.requestAccessToken({prompt:''});}catch(e){current.reject(e);renewal=null;throw e;}
      }
      const waitForToken=renewal.promise;
      await waitForToken;
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
  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=runner();
  window.newcomAPI={run:queuedAPI,authenticated:()=>authorized&&!!token};
})();
