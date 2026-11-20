/* Conexión Google OAuth + Apps Script Execution API para Newcom. */
(() => {
  'use strict';
  const CLIENT_ID='158432822961-m49sji0hneqt4u6rkobbngt08c8c2mhn.apps.googleusercontent.com';
  const SCRIPT_ID='1Ql41SpKI9gYX_ijoU-1MVmwGjObNuEr1AtsTQJC_b1UsGzOHHg8n3Kqs';
  const SCOPES='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/script.external_request';
  let token='', client, tokenExpiresAt=0, renewal=null, authorized=false, verifying=false;
  let googleReadyAttempts=0;
  let loginWatchdog=null;
  function stopLoginWatchdog(){if(loginWatchdog){clearTimeout(loginWatchdog);loginWatchdog=null;}}
  function startLoginWatchdog(){stopLoginWatchdog();loginWatchdog=setTimeout(()=>{if(!verifying || authorized)return;verifying=false;showState(false,'Google no completó la autorización o la verificación demoró demasiado. Volvé a intentar. Si vuelve a ocurrir, abrí F12 → Consola y enviame el error.');},20000);}
  const pending=[];
  // La sesión dura como máximo lo que dura el token OAuth. No se guarda un refresh token.
  const SESSION_KEY='newcom_google_access_v2';
  try{sessionStorage.removeItem('newcom_google_access_v1');}catch(_e){}
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
      startLoginWatchdog();
      showState(true,'Seleccioná tu cuenta de Google para continuar…');
      try{client.requestAccessToken({prompt:''});}catch(e){stopLoginWatchdog();verifying=false;showState(false,e.message||'No se pudo abrir Google.');}
    };
    if(client && !verifying)showState(false,'');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
  function ready(){
    if(!window.google?.accounts?.oauth2){if(++googleReadyAttempts<200){setTimeout(ready,100);}else{showState(false,'No se cargó el acceso de Google. Revisá la conexión y recargá la página.');}return;}
    client=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,error_callback:err=>{stopLoginWatchdog();verifying=false;const message='Google no pudo completar el acceso: '+(err?.type||err?.message||'ventana cerrada o bloqueada');if(renewal){renewal.reject(Error(message));renewal=null;}showState(false,message);},callback:response=>{
      stopLoginWatchdog();
      if(response.error){
        if(renewal){renewal.reject(Error(response.error));renewal=null;}
        verifying=false;showState(false,'No se pudo autorizar: '+response.error);return;
      }
      if(!google.accounts.oauth2.hasGrantedAllScopes(response,...SCOPES.split(' '))){
        const error=Error('Debés conceder todos los permisos de Google para administrar el torneo.');
        if(renewal){renewal.reject(error);renewal=null;}
        token='';tokenExpiresAt=0;authorized=false;verifying=false;clearSavedSession();
        attach();showState(false,error.message);return;
      }
      token=response.access_token||'';
      tokenExpiresAt=Date.now()+Math.max(0,(Number(response.expires_in)||3500)-90)*1000;
      if(renewal){saveSession();renewal.resolve(token);renewal=null;return;}
      verifying=true;
      startLoginWatchdog();
      showState(true,'Verificando acceso…');
      runAPI('adminVerificarAccesoNewcom',[]).then(ok=>{
        if(ok!==true)throw Error('Esta cuenta no está autorizada para administrar el torneo.');
        stopLoginWatchdog();authorized=true;verifying=false;
        saveSession();
        overlay.remove();
        flushPending();
        document.dispatchEvent(new Event('newcom-autorizado'));
      }).catch(e=>{
        stopLoginWatchdog();token='';authorized=false;verifying=false;clearSavedSession();
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
        stopLoginWatchdog();token='';authorized=false;verifying=false;clearSavedSession();
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
      // No abrir ventanas OAuth inesperadas mientras se trabaja.
      // Google no garantiza renovación silenciosa: se solicita un nuevo ingreso
      // únicamente cuando el token ha vencido y se necesita acceder a la API.
      token='';tokenExpiresAt=0;authorized=false;clearSavedSession();
      attach();showState(false,'La sesión de Google venció. Ingresá para continuar.');
      throw Error('La sesión venció. Ingresá con Google para continuar.');
    }
    const controller=new AbortController();
    const consultarResultados=func==='adminResultados12Consultar';
    const guardarResultado=func==='adminResultados12Guardar';
    const limite=consultarResultados?45000:guardarResultado?60000:20000;
    const timeout=setTimeout(()=>controller.abort(),limite);
    let response,data;
    try{
      response=await fetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(SCRIPT_ID)+':run',{
        method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({function:func,parameters,devMode:false}),signal:controller.signal
      });
      data=await response.json();
    }catch(e){
      if(e.name!=='AbortError')throw e;
      const mensaje=guardarResultado?'No se pudo verificar el guardado en 60 segundos.':
        consultarResultados?'La consulta de resultados tardó más de 45 segundos. Podés actualizar para volver a consultar.':
        func==='adminVerificarAccesoNewcom'?'La verificación de acceso tardó más de 20 segundos.':
        'Apps Script no respondió en 20 segundos.';
      const error=new Error(mensaje);error.code='NEWCOM_API_TIMEOUT';throw error;
    }finally{clearTimeout(timeout);}
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
