'use client';
import { Fragment,useCallback,useEffect,useMemo,useState } from 'react';
import { addTripDays,localTripToday,tripColumns,tripDayLabel,tripMonthWeeks,tripWeekStart,TripColumn } from '@/lib/trip-calendar';
import './trips-mobile.css';

type Trip = Record<TripColumn,string> & {id:string;date:string;groupDate:string;notes:string;reference:string;status:string;rowColor:string;active:boolean;updatedAt?:string;isNew:boolean};
export type TripCatalog = {tractors:{economicNumber:string;active:boolean}[];trailers:{economicNumber:string;active:boolean}[];drivers:{fullName:string;active:boolean}[];destinations:{name:string;active:boolean}[]};
const extraKeys=['notes','reference','status','rowColor'] as const;
function readTrip(raw:Record<string,unknown>):Trip{
 const fields=Object.fromEntries([...tripColumns.map(([key])=>key),...extraKeys].map(key=>[key,String(raw[key]??'')]));
 return {...fields,id:String(raw.id),date:String(raw.date),groupDate:String(raw.date),active:raw.active!==false,isNew:false,updatedAt:raw.updatedAt?String(raw.updatedAt):undefined} as Trip;
}
function tripPayload(row:Trip){return {date:row.date,...Object.fromEntries([...tripColumns.map(([key])=>key),...extraKeys].map(key=>[key,row[key]])),active:row.active,...(row.updatedAt?{expectedUpdatedAt:row.updatedAt}:{})}}
function sameTrip(a:Trip,b:Trip){return JSON.stringify(tripPayload(a))===JSON.stringify(tripPayload(b))}
async function request(path:string,options?:RequestInit){
 const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...options?.headers}});const result=await response.json();
 if(!response.ok)throw new Error(result.message||'No se pudo guardar el viaje.');return result;
}
const colorOptions=[['none','Sin color'],['yellow','Amarillo'],['green','Verde'],['red','Rojo'],['blue','Azul']] as const;
const statusOptions=['Programado','En tránsito','Completado','Cancelado'];
function useCompactLayout(){
 const [compact,setCompact]=useState(false);
 useEffect(()=>{
  const query=window.matchMedia('(max-width: 759.98px)');const sync=()=>setCompact(query.matches);sync();
  query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);
 },[]);
 return compact;
}
function monthOptions(selected:string,today:string){
 const [year,month]=today.split('-').map(Number);const values=new Set([selected]);
 for(let offset=-24;offset<=24;offset++){const date=new Date(Date.UTC(year,month-1+offset,1));values.add(date.toISOString().slice(0,7))}
 return [...values].sort().map(value=>[value,new Intl.DateTimeFormat('es-MX',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00Z'))] as const);
}
export default function TripsBoard({catalog,editable,admin,onDirtyChange}:{catalog:TripCatalog;editable:boolean;admin:boolean;onDirtyChange:(dirty:boolean)=>void}){
 const initial=localTripToday();
 const [month,setMonth]=useState(initial.slice(0,7));const [week,setWeek]=useState(tripWeekStart(initial));
 const [rows,setRows]=useState<Trip[]>([]);const [baseline,setBaseline]=useState<Record<string,Trip>>({});
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [filter,setFilter]=useState('');const [weekends,setWeekends]=useState(false);const [details,setDetails]=useState<string|null>(null);
 const compact=useCompactLayout();const [sheet,setSheet]=useState<string|null>(null);
 const dirty=useMemo(()=>rows.filter(row=>row.isNew||!baseline[row.id]||!sameTrip(row,baseline[row.id])),[rows,baseline]);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try{const result=(await request('trips')).map(readTrip) as Trip[];setRows(result.filter(row=>row.active));setBaseline(Object.fromEntries(result.map(row=>[row.id,row])))}
  catch(e){setError(e instanceof Error?e.message:'No se pudo cargar la tabla.')}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{void reload()},[reload]);
 useEffect(()=>{onDirtyChange(dirty.length>0||busy);return()=>onDirtyChange(false)},[dirty.length,busy,onDirtyChange]);
 useEffect(()=>{
  if(!dirty.length&&!busy)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[dirty.length,busy]);
 const weeks=tripMonthWeeks(month);const end=addTripDays(week,6);
 const inWeek=rows.filter(row=>row.groupDate>=week&&row.groupDate<=end);
 const hasWeekendTrips=inWeek.some(row=>[0,6].includes(new Date(row.groupDate+'T12:00:00Z').getUTCDay()));
 const days=Array.from({length:7},(_,i)=>addTripDays(week,i)).filter(date=>weekends||![0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())||inWeek.some(row=>row.groupDate===date));
 const changed=(row:Trip)=>row.isNew||!baseline[row.id]||!sameTrip(row,baseline[row.id]);
 const chooseMonth=(value:string)=>{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return;
  setMonth(value);setWeek(value===initial.slice(0,7)?tripWeekStart(initial):tripMonthWeeks(value)[0]);setNotice('');
 };
 function update(id:string,key:TripColumn|typeof extraKeys[number]|'date',value:string){setRows(current=>current.map(row=>row.id===id?{...row,[key]:value}:row));setNotice('')}
 function add(date:string){
  const row=readTrip({id:'new-'+crypto.randomUUID(),date,active:true,status:'Programado',rowColor:'none'});row.isNew=true;
  setRows(current=>[...current,row]);setError('');setNotice('');if(compact)setSheet(row.id);
 }
 async function persist(row:Trip){
  const saved=readTrip(await request('trips'+(row.isNew?'':'/'+row.id),{method:row.isNew?'POST':'PATCH',body:JSON.stringify(tripPayload(row))}));
  setRows(current=>current.map(item=>item.id===row.id?saved:item));setBaseline(current=>({...current,[saved.id]:saved}));
  if(details===row.id)setDetails(saved.id);setSheet(current=>current===row.id?saved.id:current);return saved;
 }
 async function save(items:Trip[]){
  if(busy)return false;setBusy(true);setError('');setNotice('');let count=0;
  try{for(const row of items){await persist(row);count++}setNotice(count===1?'Viaje guardado.':`${count} viajes guardados.`);return true}
  catch(e){setError((count?`${count} viajes guardados. `:'')+(e instanceof Error?e.message:'No se pudo guardar.'));return false}
  finally{setBusy(false)}
 }
 async function remove(row:Trip){
  if(row.isNew){setRows(current=>current.filter(item=>item.id!==row.id));setSheet(null);return}
  if(!window.confirm('¿Retirar este viaje de la tabla? Se conservará su registro en la auditoría.'))return;
  setBusy(true);setError('');setNotice('');
  try{await request('trips/'+row.id,{method:'PATCH',body:JSON.stringify({...tripPayload(row),active:false})});setRows(current=>current.filter(item=>item.id!==row.id));setSheet(null);setNotice('Viaje retirado.')}catch(e){setError(e instanceof Error?e.message:'No se pudo retirar.')}
  finally{setBusy(false)}
 }
 const saveLabel=busy?'Guardando…':dirty.length?`Guardar ${dirty.length} ${dirty.length===1?'cambio':'cambios'}`:'Sin cambios por guardar';
 const sheetRow=compact&&sheet?rows.find(row=>row.id===sheet):undefined;
 const sheetOpen=Boolean(sheetRow);
 useEffect(()=>{
  if(!sheetOpen)return;
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)setSheet(null)};
  window.addEventListener('keydown',close);document.body.classList.add('trip-sheet-open');
  return()=>{window.removeEventListener('keydown',close);document.body.classList.remove('trip-sheet-open')};
 },[sheetOpen,busy]);
 const suggestions:Partial<Record<TripColumn,string>>={driverName:'trip-drivers',tractorNumber:'trip-tractors',trailerNumber:'trip-trailers',destination:'trip-destinations'};
 const choices=[['trip-drivers',catalog.drivers.map(d=>d.active?d.fullName:'')],['trip-tractors',catalog.tractors.map(t=>t.active?t.economicNumber:'')],['trip-trailers',catalog.trailers.map(t=>t.active?t.economicNumber:'')],['trip-destinations',catalog.destinations.map(d=>d.active?d.name:'')]] as const;
 return <section className="trips-board" aria-label="Tabla semanal de viajes">
  <div className="trip-controls panel">
   <div className="trip-selectors">
    <label>Mes<select aria-label="Mes de los viajes" className="trip-month" value={month} onChange={e=>chooseMonth(e.target.value)} disabled={busy}>{monthOptions(month,initial).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Semana<select aria-label="Semana de los viajes" value={week} onChange={e=>{setWeek(e.target.value);setNotice('')}} disabled={busy}>{weeks.map((start,i)=><option key={start} value={start}>Semana {i+1} · {start.slice(8,10)}/{start.slice(5,7)} – {addTripDays(start,6).slice(8,10)}/{addTripDays(start,6).slice(5,7)}</option>)}</select></label>
    <label>Buscar en la semana<input aria-label="Buscar viajes de la semana" placeholder="Cliente, operador, factura…" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
   </div>
   <div className="trip-control-actions">
    <label className="trip-checkbox"><input type="checkbox" checked={weekends} onChange={e=>setWeekends(e.target.checked)}/>Mostrar sábado y domingo</label>
    <button disabled={busy||loading} onClick={()=>{if(!dirty.length||window.confirm('Hay cambios sin guardar. ¿Descartarlos y recargar la tabla?'))void reload()}}>Recargar tabla</button>
    {editable&&<button className="primary" disabled={busy||!dirty.length} onClick={()=>void save(dirty)}>{saveLabel}</button>}
    {admin&&<><a href={`/api/export?entity=trips&format=xlsx&from=${week}&to=${end}`}>Exportar semana a Excel</a><a href={`/api/export?entity=trips&format=csv&from=${week}&to=${end}`}>CSV</a></>}
   </div>
  </div>
  <div className="trip-summary"><span><strong>{inWeek.length}</strong> viajes en esta semana</span><span>{inWeek.filter(r=>!r.driverName||!r.tractorNumber).length} sin asignación completa</span><span>{dirty.length?`${dirty.length} cambios sin guardar`:'Cambios guardados'}</span></div>
  <p className="section-note">Edita las celdas y guarda cada fila o todos los cambios. Tab pasa a la siguiente celda; Ctrl + Enter guarda la fila. Stop y las marcas de seguimiento admiten texto.{!editable&&' Tu cuenta tiene acceso de solo lectura.'}{hasWeekendTrips&&!weekends&&' Se muestran los días de fin de semana que tienen viajes.'}</p>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  {choices.map(([id,values])=><datalist id={id} key={id}>{[...new Set(values.filter(Boolean))].map(value=><option value={value} key={value}/>)}</datalist>)}
  {loading?<div className="skeleton" role="status" aria-label="Cargando viajes"><i className="skeleton-bar"/><i className="skeleton-card"/><i className="skeleton-card"/><i className="skeleton-card"/></div>:days.map(date=>{
   const dayRows=inWeek.filter(row=>row.groupDate===date&&(!filter||JSON.stringify(row).toLocaleLowerCase('es').includes(filter.toLocaleLowerCase('es'))));
   return <section key={date} className="trip-day panel" aria-label={tripDayLabel(date)}>
    <div className="trip-day-heading"><div><h2>{tripDayLabel(date)}</h2><span className="muted">{dayRows.length} {dayRows.length===1?'viaje':'viajes'}</span></div>{editable&&<button disabled={busy} onClick={()=>add(date)}>+ Agregar viaje</button>}</div>
    {compact?<ul className="trip-cards">{dayRows.map(row=><li key={row.id}><button type="button" className={`trip-card color-${row.rowColor}`} data-trip-id={row.id} onClick={()=>setSheet(row.id)}>
     <span className="trip-card-top"><strong>{row.client||'Sin cliente'}</strong>{changed(row)&&<span className="trip-card-flag">Sin guardar</span>}{row.notes&&<span className="trip-card-note" aria-label="Con notas">●</span>}</span>
     <span className="trip-card-field"><small>Operador</small>{row.driverName||'Por asignar'}</span>
     <span className="trip-card-field"><small>Tractor / Remolque</small>{row.tractorNumber||'—'} / {row.trailerNumber||'—'}</span>
     <span className="trip-card-field"><small>Destino</small>{row.destination||'—'}</span>
    </button></li>)}</ul>:<div className="table-scroll trip-grid-scroll" tabIndex={0} aria-label={'Desplazar tabla de '+tripDayLabel(date)}><table className="trip-grid"><thead><tr>{tripColumns.map(([key,label])=><th scope="col" key={key}>{label}</th>)}<th scope="col">Acciones</th></tr></thead><tbody>
     {dayRows.map((row,index)=><Fragment key={row.id}>
      <tr className={`trip-row color-${row.rowColor}`} data-trip-id={row.id} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&editable&&!busy&&changed(row)){e.preventDefault();void save([row])}}}>
       {tripColumns.map(([key,label])=><td key={key}>{key==='invoices'?<textarea aria-label={`${label}, viaje ${index+1}`} value={row[key]} maxLength={5000} rows={2} readOnly={!editable} disabled={busy} onChange={e=>update(row.id,key,e.target.value)}/>:<input aria-label={`${label}, viaje ${index+1}`} value={row[key]} maxLength={500} autoComplete="off" list={suggestions[key]} readOnly={!editable} disabled={busy} autoFocus={row.isNew&&key==='client'} onChange={e=>update(row.id,key,e.target.value)}/>}</td>)}
       <td className="trip-row-actions"><span className={'trip-save-state '+(changed(row)?'unsaved':'')}>{changed(row)?'Sin guardar':'Guardado'}</span><div>{editable&&<button className="primary" disabled={busy||!changed(row)} onClick={()=>void save([row])}>Guardar fila</button>}<button aria-expanded={details===row.id} onClick={()=>setDetails(details===row.id?null:row.id)}>Notas y detalles{row.notes?' ●':''}</button></div></td>
      </tr>
      {details===row.id&&<tr className="trip-detail-row"><td colSpan={13}><div className="trip-detail-grid">
       <label>Día del viaje<input aria-label="Día del viaje" type="date" value={row.date} readOnly={!editable} disabled={busy} onChange={e=>update(row.id,'date',e.target.value)}/></label>
       <label>Color de la fila<select aria-label="Color de la fila" value={row.rowColor} disabled={!editable||busy} onChange={e=>update(row.id,'rowColor',e.target.value)}>{[['none','Sin color'],['yellow','Amarillo'],['green','Verde'],['red','Rojo'],['blue','Azul']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
       <label>Referencia adicional<input value={row.reference} maxLength={500} readOnly={!editable} disabled={busy} onChange={e=>update(row.id,'reference',e.target.value)}/></label>
       <label>Estado general<select value={row.status} disabled={!editable||busy} onChange={e=>update(row.id,'status',e.target.value)}>{['Programado','En tránsito','Completado','Cancelado'].map(status=><option key={status}>{status}</option>)}</select></label>
       <label className="trip-notes">Notas<textarea aria-label="Notas del viaje" value={row.notes} maxLength={5000} readOnly={!editable} disabled={busy} onChange={e=>update(row.id,'notes',e.target.value)}/></label>
       {editable&&<div><button disabled={busy} onClick={()=>{if(row.isNew)setRows(current=>current.filter(r=>r.id!==row.id));else setRows(current=>current.map(r=>r.id===row.id?baseline[row.id]:r));setDetails(null);setError('')}}>Descartar cambios</button><button className="trip-remove" disabled={busy||(!row.isNew&&changed(row))} onClick={()=>void remove(row)}>{row.isNew?'Quitar fila nueva':'Retirar viaje'}</button></div>}
      </div></td></tr>}
     </Fragment>)}
    </tbody></table></div>}
    {!dayRows.length&&<div className="trip-empty"><p>{filter?'Sin coincidencias para este día.':'No hay viajes registrados para este día.'}</p>{editable&&!filter&&<button disabled={busy} onClick={()=>add(date)}>+ Agregar el primer viaje</button>}</div>}
   </section>;
  })}
  {compact&&editable&&dirty.length>0&&!sheetRow&&<div className="trip-savebar"><button className="primary" disabled={busy} onClick={()=>void save(dirty)}>{saveLabel}</button></div>}
  {sheetRow&&<div className="trip-sheet-backdrop" onClick={()=>{if(!busy)setSheet(null)}}><div className="trip-sheet" role="dialog" aria-modal="true" aria-label="Detalle del viaje" onClick={e=>e.stopPropagation()}>
   <div className="trip-sheet-head"><h2>{sheetRow.client||'Viaje nuevo'}</h2><span className={'trip-save-state '+(changed(sheetRow)?'unsaved':'')}>{changed(sheetRow)?'Sin guardar':'Guardado'}</span><button aria-label="Cerrar" disabled={busy} onClick={()=>setSheet(null)}>✕</button></div>
   <div className="trip-sheet-body">
    {tripColumns.map(([key,label])=><label key={key}>{label}{key==='invoices'?<textarea value={sheetRow[key]} maxLength={5000} rows={2} readOnly={!editable} disabled={busy} onChange={e=>update(sheetRow.id,key,e.target.value)}/>:<input value={sheetRow[key]} maxLength={500} autoComplete="off" list={suggestions[key]} readOnly={!editable} disabled={busy} onChange={e=>update(sheetRow.id,key,e.target.value)}/>}</label>)}
    <label>Día del viaje<input type="date" value={sheetRow.date} readOnly={!editable} disabled={busy} onChange={e=>update(sheetRow.id,'date',e.target.value)}/></label>
    <label>Color de la fila<select value={sheetRow.rowColor} disabled={!editable||busy} onChange={e=>update(sheetRow.id,'rowColor',e.target.value)}>{colorOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Referencia adicional<input value={sheetRow.reference} maxLength={500} readOnly={!editable} disabled={busy} onChange={e=>update(sheetRow.id,'reference',e.target.value)}/></label>
    <label>Estado general<select value={sheetRow.status} disabled={!editable||busy} onChange={e=>update(sheetRow.id,'status',e.target.value)}>{statusOptions.map(status=><option key={status}>{status}</option>)}</select></label>
    <label>Notas<textarea value={sheetRow.notes} maxLength={5000} readOnly={!editable} disabled={busy} onChange={e=>update(sheetRow.id,'notes',e.target.value)}/></label>
    {editable&&<div className="trip-sheet-secondary"><button disabled={busy} onClick={()=>{if(sheetRow.isNew)setRows(current=>current.filter(r=>r.id!==sheetRow.id));else setRows(current=>current.map(r=>r.id===sheetRow.id?baseline[sheetRow.id]:r));setSheet(null);setError('')}}>Descartar cambios</button><button className="trip-remove" disabled={busy||(!sheetRow.isNew&&changed(sheetRow))} onClick={()=>void remove(sheetRow)}>{sheetRow.isNew?'Quitar fila nueva':'Retirar viaje'}</button></div>}
   </div>
   <div className="trip-sheet-actions">{editable&&<button className="primary" disabled={busy||!changed(sheetRow)} onClick={()=>void save([sheetRow]).then(saved=>{if(saved)setSheet(null)})}>{busy?'Guardando…':'Guardar viaje'}</button>}<button disabled={busy} onClick={()=>setSheet(null)}>{editable&&changed(sheetRow)?'Seguir después':'Cerrar'}</button></div>
  </div></div>}
 </section>;
}
