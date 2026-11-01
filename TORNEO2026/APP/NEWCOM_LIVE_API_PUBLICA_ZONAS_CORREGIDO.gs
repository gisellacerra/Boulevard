/** NEWCOM LIVE — API PÚBLICA DE SOLO LECTURA.
 * Proyecto Apps Script INDEPENDIENTE del asistente administrativo.
 * Implementar como aplicación web: ejecutar como propietario, acceso público.
 * Nunca incluir funciones de escritura ni credenciales administrativas.
 */
const NEWCOM_PUBLIC_SHEET_ID = '1ycxOBzUN6MJQRHcey_ajwjGpwGoEApYiSHDbe0tgVQ4';
function newcomPublicLeer_(nombre) {
  const hoja=SpreadsheetApp.openById(NEWCOM_PUBLIC_SHEET_ID).getSheetByName(nombre);
  if(!hoja) return [];
  const data=hoja.getDataRange().getDisplayValues();
  if(data.length<2) return [];
  const heads=data.shift().map(s=>String(s).trim().toLowerCase());
  return data.map(row=>Object.fromEntries(heads.map((h,i)=>[h,String(row[i]||'').trim()]))).filter(r=>Object.values(r).some(Boolean));
}
function newcomPublicKey_(r){return ['anio','edicion','categoria','genero','zona','ronda','equipo_local','equipo_visitante'].map(k=>String(r[k]||'').replace(/^\+/,'').trim()).join('|');}

/** Vincula escudos con equipos por nombre, categoría y, cuando corresponde, género.
 * No inventa escudos ni mezcla equipos homónimos de categorías distintas.
 */
function newcomPublicNormalizarEquipo_(valor){
  return String(valor||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
}
function newcomPublicNormalizarCategoria_(valor){return String(valor||'').trim().replace(/^\+/,'');}
function newcomPublicEscudo_(valor){
  const v=String(valor||'').trim();
  return /^(?:https?:\/\/[^\s]+|data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+)$/i.test(v)?v:'';
}
function newcomPublicBuscarEscudo_(equipos,nombre,categoria,genero){
  const n=newcomPublicNormalizarEquipo_(nombre),c=newcomPublicNormalizarCategoria_(categoria);
  const coincidencias=equipos.filter(e=>newcomPublicNormalizarEquipo_(e.nombre)===n&&newcomPublicNormalizarCategoria_(e.categoria)===c);
  if(coincidencias.length===1)return coincidencias[0].escudo||'';
  const g=String(genero||'').trim().toLocaleLowerCase('es');
  const porGenero=coincidencias.filter(e=>String(e.genero||'').trim().toLocaleLowerCase('es')===g);
  return porGenero.length===1?porGenero[0].escudo||'':'';
}

function newcomPublicDatos_(){
 const equipos=newcomPublicLeer_('EQUIPOS')
   .filter(x=>x.equipo&&String(x.estado||'ACTIVO').toUpperCase()!=='BAJA')
   .map(x=>({nombre:x.equipo,categoria:x.categoria,ciudad:x.ciudad||'',provincia:x.provincia||'',genero:x.genero||'',zona:x.zona||'',escudo:newcomPublicEscudo_(x.escudo)}));
 const resultados=new Map(newcomPublicLeer_('RESULTADOS_ADMIN').filter(x=>String(x.estado).toUpperCase()==='CONFIRMADO').map(x=>[newcomPublicKey_(x),x]));
 const partidos=newcomPublicLeer_('FIXTURE').filter(x=>String(x.estado).toUpperCase()==='CONFIRMADO'&&x.equipo_local&&x.equipo_visitante).map(x=>{
  const r=resultados.get(newcomPublicKey_(x));
  return {anio:x.anio,edicion:x.edicion,categoria:x.categoria,genero:x.genero,zona:x.zona,ronda:x.ronda,local:x.equipo_local,visitante:x.equipo_visitante,
   escudoLocal:newcomPublicBuscarEscudo_(equipos,x.equipo_local,x.categoria,x.genero),
   escudoVisitante:newcomPublicBuscarEscudo_(equipos,x.equipo_visitante,x.categoria,x.genero),
   fecha:x.fecha,hora:x.hora,cancha:x.cancha,
   resultado:r?{setsLocal:r.sets_local,setsVisitante:r.sets_visitante,ganador:r.ganador,set1:[r.set1_local,r.set1_visitante],set2:[r.set2_local,r.set2_visitante],tiebreak:[r.tiebreak_local,r.tiebreak_visitante]}:null};
 });
 const resultadosCruces=new Map(newcomPublicLeer_('CRUCES_RESULTADOS_ADMIN').filter(x=>String(x.estado).toUpperCase()==='CONFIRMADO').map(x=>[[x.anio,x.edicion,String(x.categoria).replace(/^\+/,''),x.genero,x.instancia,x.partido].join('|'),x]));
 const cruces=newcomPublicLeer_('CRUCES_ADMIN').filter(x=>x.equipo_local&&x.equipo_visitante&&['CONFIRMADO','PUBLICADO'].includes(String(x.estado).toUpperCase())).map(x=>({anio:x.anio,edicion:x.edicion,categoria:x.categoria,genero:x.genero,instancia:x.instancia,partido:x.partido,local:x.equipo_local,visitante:x.equipo_visitante,
  escudoLocal:newcomPublicBuscarEscudo_(equipos,x.equipo_local,x.categoria,x.genero),
  escudoVisitante:newcomPublicBuscarEscudo_(equipos,x.equipo_visitante,x.categoria,x.genero),
  fecha:x.fecha,hora:x.hora,cancha:x.cancha,resultado:(()=>{const r=resultadosCruces.get([x.anio,x.edicion,String(x.categoria).replace(/^\+/,''),x.genero,x.instancia,x.partido].join('|'));return r?{setsLocal:r.sets_local,setsVisitante:r.sets_visitante,ganador:r.ganador,set1:[r.set1_local,r.set1_visitante],set2:[r.set2_local,r.set2_visitante],tiebreak:[r.tiebreak_local,r.tiebreak_visitante]}:null;})()}));

 // Lectura pública: alojamiento y sede, sin modificar la planilla.
 const ss=SpreadsheetApp.openById(NEWCOM_PUBLIC_SHEET_ID);
 const conf=ss.getSheetByName('CONFIG_TORNEO');
 const valores=conf?conf.getDataRange().getDisplayValues().slice(1).reduce((a,r)=>{a[String(r[0]||'').trim().toLowerCase()]=String(r[1]||'').trim();return a;},{}):{};
 const sede={nombre:valores.nombre_sede||'',direccion:valores.direccion_evento||''};
 const hojaAlojamientos=['ALOJAMIENTOS','ALOJAMIENTO'].map(n=>ss.getSheetByName(n)).find(Boolean);
 let alojamientos=[];
 if(hojaAlojamientos){
   const tabla=hojaAlojamientos.getDataRange().getDisplayValues();
   if(tabla.length>1){
     const cab=tabla.shift().map(x=>String(x||'').trim().toLowerCase());
     alojamientos=tabla.map((fila,i)=>{
       const r=Object.fromEntries(cab.map((k,j)=>[k,String(fila[j]||'').trim()]));
       return {nombre:r.nombre||r.alojamiento||'',direccion:r.direccion||r['dirección']||'',contacto:r.contacto||r.telefono||r['teléfono']||'',descripcion:r.descripcion||r['descripción']||'',mapa:r.mapa||'',imagen:r.imagen||'',orden:Number(r.orden)||i+1,estado:r.estado||''};
     }).filter(x=>x.nombre&&x.direccion&&!['BAJA','ELIMINADO','INACTIVO'].includes(x.estado.toUpperCase())).sort((a,b)=>a.orden-b.orden);
   }
 }
 const notificaciones=newcomPublicNotificaciones_();
 const arbitros=newcomPublicArbitros_();
 return {ok:true,equipos,partidos,cruces,sede,alojamientos,notificaciones,arbitros,actualizado:new Date().toISOString()};
}
/** Lee notificaciones publicadas sin modificar la planilla.
 * Acepta las columnas habituales: titulo, mensaje, fecha, enlace y estado.
 * Si la hoja o sus columnas no existen, devuelve [] en vez de inventar avisos.
 */
function newcomPublicNotificaciones_(){
 const libro=SpreadsheetApp.openById(NEWCOM_PUBLIC_SHEET_ID);
 const hoja=['NOTIFICACIONES','NOTIFICACIONES_ADMIN','AVISOS','AVISOS_ADMIN']
   .map(n=>libro.getSheetByName(n)).find(Boolean);
 if(!hoja)return [];
 const filas=hoja.getDataRange().getDisplayValues();
 if(filas.length<2)return [];
 const encabezados=filas.shift().map(v=>String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_'));
 const obtener=(fila,nombres)=>{for(const n of nombres){const i=encabezados.indexOf(n);if(i>=0&&String(fila[i]||'').trim())return String(fila[i]).trim();}return '';};
 return filas.map(f=>{
   const titulo=obtener(f,['titulo','asunto','nombre']);
   const mensaje=obtener(f,['mensaje','texto','contenido','descripcion','detalle']);
   const fecha=obtener(f,['fecha','fecha_publicacion','creado','created_at']);
   const enlace=obtener(f,['enlace','url','link']);
   const estado=obtener(f,['estado','estatus','status','publicado','visible']).toUpperCase();
   return {titulo,mensaje,fecha,enlace,estado};
 }).filter(n=>n.titulo&&n.mensaje&&(!n.estado||['PUBLICADO','PUBLICADA','ACTIVO','ACTIVA','SI','SÍ','TRUE','1','VISIBLE'].includes(n.estado)))
   .map(({titulo,mensaje,fecha,enlace})=>({titulo,mensaje,fecha,enlace}));
}
function doGet(e){
 const p=(e&&e.parameter)||{};
 if(p.api!=='datos')return ContentService.createTextOutput('API NEWCOM LIVE · solo lectura').setMimeType(ContentService.MimeType.TEXT);
 const cb=String(p.callback||'');
 if(!/^[A-Za-z_$][\w$]{0,100}$/.test(cb))return ContentService.createTextOutput(JSON.stringify({ok:false,error:'Callback inválido'})).setMimeType(ContentService.MimeType.JSON);
 let payload;try{payload=newcomPublicDatos_();}catch(err){payload={ok:false,error:'No se pudieron consultar los datos públicos.'};}
 return ContentService.createTextOutput(cb+'('+JSON.stringify(payload)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
