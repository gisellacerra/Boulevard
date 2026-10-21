const DESAFIO = 'reglamento-01';
const CLAVES = [2,2,1,3];
function doGet(){return json_({ok:true,servicio:'Newcom Boulevard'});}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function doPost(e){try{return json_({ok:true,resultado:guardar(JSON.parse(e.postData.contents))});}catch(error){return json_({ok:false,error:String(error.message||error)});}}
function tabla_(){const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw new Error('Creá este proyecto desde una planilla de Google Sheets.');let t=ss.getSheetByName('RESPUESTAS_NEWCOM');if(!t){t=ss.insertSheet('RESPUESTAS_NEWCOM');t.appendRow(['Fecha','Desafío','Día','Nombre','Aciertos','Asistencia','Respuestas']);}return t;}
function dia_(){return Utilities.formatDate(new Date(),'America/Argentina/Buenos_Aires','yyyy-MM-dd');}
function ranking(){const rows=tabla_().getDataRange().getValues().slice(1);return rows.filter(r=>r[1]===DESAFIO&&r[2]===dia_()).map(r=>({nombre:String(r[3]).replace(/^'/,''),puntos:Number(r[4])})).sort((a,b)=>b.puntos-a.puntos||a.nombre.localeCompare(b.nombre));}
function guardar(p){
 if(!p||typeof p.nombre!=='string'||!p.nombre.trim()||p.nombre.trim().length>30||!['Sí','No'].includes(p.asistencia)||!Array.isArray(p.respuestas)||p.respuestas.length!==CLAVES.length||!p.respuestas.every(v=>Number.isInteger(v)&&v>=0&&v<=3))throw new Error('Revisá tus datos.');
 const nombre=p.nombre.trim().replace(/\s+/g,' ');const key=nombre.toLocaleLowerCase();const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{const t=tabla_();const rows=t.getDataRange().getValues();const found=rows.findIndex((r,i)=>i>0&&r[1]===DESAFIO&&r[2]===dia_()&&String(r[3]).replace(/^'/,'').toLocaleLowerCase()===key);let puntos=p.respuestas.reduce((s,v,i)=>s+(v===CLAVES[i]?1:0),0);
 if(found>0){puntos=Number(rows[found][4]);t.getRange(found+1,6).setValue(p.asistencia);}else{t.appendRow([new Date(),DESAFIO,dia_(),/^[=+\-@']/.test(nombre)?"'"+nombre:nombre,puntos,p.asistencia,JSON.stringify(p.respuestas)]);}
 return {puntos,ranking:ranking(),repetido:found>0};
 }finally{lock.releaseLock();}
}
