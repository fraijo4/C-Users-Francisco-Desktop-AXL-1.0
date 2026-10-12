export const tripColumns = [
 ['client','Cliente'],['driverName','Operador'],['origin','Origen'],['destination','Destino'],
 ['stop','Stop'],['tractorNumber','Tractor'],['trailerNumber','Remolque'],['invoices','Facturas'],
 ['paperwork','Papeles'],['customsPreview','Previo'],['crossed','Cruzó'],['delivered','Entregado']
] as const;
export type TripColumn = typeof tripColumns[number][0];
export function localTripToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function addTripDays(date:string,days:number){const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}
export function tripWeekStart(date:string){const day=new Date(date+'T12:00:00Z').getUTCDay();return addTripDays(date,-((day+2)%7))}
export function tripMonthWeeks(month:string){
 const first=month+'-01';const last=new Date(first+'T12:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
 const result:string[]=[];for(let day=tripWeekStart(first);day<=last.toISOString().slice(0,10);day=addTripDays(day,7))result.push(day);return result;
}
export function tripDayLabel(date:string){return new Intl.DateTimeFormat('es-MX',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00Z'))}
