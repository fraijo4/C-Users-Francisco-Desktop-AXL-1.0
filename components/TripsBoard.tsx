'use client';
import { Fragment,useCallback,useEffect,useMemo,useState } from 'react';
import { addTripDays,localTripToday,tripColumns,tripDayLabel,tripMonthWeeks,tripWeekStart,TripColumn } from '@/lib/trip-calendar';

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
export default function TripsBoard({catalog,editable,admin,onDirtyChange}:{catalog:TripCatalog;editable:boolean;admin:boolean;onDirtyChange:(dirty:boolean)=>void}){
 const initial=localTripToday();
 const [month,setMonth]=useState(initial.slice(0,7));const [week,setWeek]=useState(tripWeekStart(initial));
 const [rows,setRows]=useState<Trip[]>([]);const [baseline,setBaseline]=useState<Record<string,Trip>>({});
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [filter,setFilter]=useState('');const [weekends,setWeekends]=useState(false);const [details,setDetails]=useState<string|null>(null);
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
  setRows(current=>[...current,row]);setError('');setNotice('');
 }
 async function persist(row:Trip){
  const saved=readTrip(await request('trips'+(row.isNew?'':'/'+row.id),{method:row.isNew?'POST':'PATCH',body:JSON.stringify(tripPayload(row))}));
  setRows(current=>current.map(item=>item.id===row.id?saved:item));setBaseline(current=>({...current,[saved.id]:saved}));
  if(details===row.id)setDetails(saved.id);return saved;
 }
 async function save(items:Trip[]){
  if(busy)return;setBusy(true);setError('');setNotice('');let count=0;
  try{for(const row of items){await persist(row);count++}setNotice(count===1?'Viaje guardado.':`${count} viajes guardados.`)}
  catch(e){setError((count?`${count} viajes guardados. `:'')+(e instanceof Error?e.message:'No se pudo guardar.'))}
  finally{setBusy(false)}
 }
 async function remove(row:Trip){
  if(row.isNew){setRows(current=>current.filter(item=>item.id!==row.id));return}
  if(!window.confirm('¿Retirar este viaje de la tabla? Se conservará su registro en la auditoría.'))return;
  setBusy(true);setError('');setNotice('');
  try{await request('trips/'+row.id,{method:'PATCH',body:JSON.stringify({...tripPayload(row),active:false})});setRows(current=>current.filter(item=>item.id!==row.id));setNotice('Viaje retirado.')}catch(e){setError(e instanceof Error?e.message:'No se pudo retirar.')}
  finally{setBusy(false)}
 }
 const suggestions:Partial<Record<TripColumn,string>>={driverName:'trip-drivers',tractorNumber:'trip-tractors',trailerNumber:'trip-trailers',destination:'trip-destinations'};
 const choices=[['trip-drivers',catalog.drivers.map(d=>d.active?d.fullName:'')],['trip-tractors',catalog.tractors.map(t=>t.active?t.economicNumber:'')],['trip-trailers',catalog.trailers.map(t=>t.active?t.economicNumber:'')],['trip-destinations',catalog.destinations.map(d=>d.active?d.name:'')]] as const;
 return <section className="trips-board" aria-label="Tabla semanal de viajes">
  <div className="trip-controls panel">
   <div className="trip-selectors">
    <label>Mes<input aria-label="Mes de los viajes" type="month" min="1900-01" max="2100-12" value={month} onChange={e=>chooseMonth(e.target.value)} disabled={busy}/></label>
    <label>Semana<select aria-label="Semana de los viajes" value={week} onChange={e=>{setWeek(e.target.value);setNotice('')}} disabled={busy}>{weeks.map((start,i)=><option key={start} value={start}>Semana {i+1} · {start.slice(8,10)}/{start.slice(5,7)} – {addTripDays(start,6).slice(8,10)}/{addTripDays(start,6).slice(5,7)}</option>)}</select></label>
    <label>Buscar en la semana<input aria-label="Buscar viajes de la semana" placeholder="Cliente, operador, factura…" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
   </div>
   <div className="trip-control-actions">
    <label className="trip-checkbox"><input type="checkbox" checked={weekends} onChange={e=>setWeekends(e.target.checked)}/>Mostrar sábado y domingo</label>
    <button disabled={busy||loading} onClick={()=>{if(!dirty.length||window.confirm('Hay cambios sin guardar. ¿Descartarlos y recargar la tabla?'))void reload()}}>Recargar tabla</button>
    {editable&&<button className="primary" disabled={busy||!dirty.length} onClick={()=>void save(dirty)}>{busy?'Guardando…':`Guardar cambios${dirty.length?' ('+dirty.length+')':''}`}</button>}
    {admin&&<><a href={`/api/export?entity=trips&format=xlsx&from=${week}&to=${end}`}>Exportar semana a Excel</a><a href={`/api/export?entity=trips&format=csv&from=${week}&to=${end}`}>CSV</a></>}
   </div>
  </div>
  <div className="trip-summary"><span><strong>{inWeek.length}</strong> viajes en esta semana</span><span>{inWeek.filter(r=>!r.driverName||!r.tractorNumber).length} sin asignación completa</span><span>{dirty.length?`${dirty.length} cambios sin guardar`:'Cambios guardados'}</span></div>
  <p className="section-note">Edita las celdas y guarda cada fila o todos los cambios. Tab pasa a la siguiente celda; Ctrl + Enter guarda la fila. Stop y las marcas de seguimiento admiten texto.{!editable&&' Tu cuenta tiene acceso de solo lectura.'}{hasWeekendTrips&&!weekends&&' Se muestran los días de fin de semana que tienen viajes.'}</p>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  {choices.map(([id,values])=><datalist id={id} key={id}>{[...new Set(values.filter(Boolean))].map(value=><option value={value} key={value}/>)}</datalist>)}
  {loading?<div className="loading">Cargando viajes…</div>:days.map(date=>{
   const dayRows=inWeek.filter(row=>row.groupDate===date&&(!filter||JSON.stringify(row).toLocaleLowerCase('es').includes(filter.toLocaleLowerCase('es'))));
   return <section key={date} className="trip-day panel" aria-label={tripDayLabel(date)}>
    <div className="trip-day-heading"><div><h2>{tripDayLabel(date)}</h2><span className="muted">{dayRows.length} {dayRows.length===1?'viaje':'viajes'}</span></div>{editable&&<button disabled={busy} onClick={()=>add(date)}>+ Agregar viaje</button>}</div>
    <div className="table-scroll trip-grid-scroll" tabIndex={0} aria-label={'Desplazar tabla de '+tripDayLabel(date)}><table className="trip-grid"><thead><tr>{tripColumns.map(([key,label])=><th scope="col" key={key}>{label}</th>)}<th scope="col">Acciones</th></tr></thead><tbody>
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
    </tbody></table></div>
    {!dayRows.length&&<p className="trip-empty">{filter?'Sin coincidencias para este día.':'No hay viajes registrados para este día.'}</p>}
   </section>;
  })}
 </section>;
}
