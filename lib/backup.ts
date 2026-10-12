import ExcelJS from 'exceljs';
import { db } from './database';
import { safeCell } from './spreadsheet';
type Row=Record<string,unknown>;
// Valores listos para una celda de Excel. Los textos se neutralizan igual que en las demás exportaciones.
const cell=(v:unknown)=>{
 if(v instanceof Date)return v.toISOString();
 if(v&&typeof v==='object')return safeCell(JSON.stringify(v));
 return typeof v==='string'?safeCell(v):v??'';
};
function addSheet(book:ExcelJS.Workbook,name:string,rows:Row[]){
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 const sheet=book.addWorksheet(name);
 sheet.addRow(keys.length?keys:['(sin registros)']);
 for(const r of rows)sheet.addRow(keys.map(k=>cell(r[k])));
 sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>c.width=24);sheet.views=[{state:'frozen',ySplit:1}];
 return rows.length;
}
// Respaldo completo en un solo Excel. No incluye contraseñas, sesiones ni intentos de login.
export async function buildBackup(by:string){
 const [tractors,trailers,drivers,destinations,trips,history,audit,users,settings]=await Promise.all([
  db.tractor.findMany({include:{driver:true},orderBy:{economicNumber:'asc'}}),
  db.trailer.findMany({orderBy:{economicNumber:'asc'}}),
  db.driver.findMany({orderBy:{fullName:'asc'}}),
  db.destination.findMany({include:{aliases:true},orderBy:{name:'asc'}}),
  db.trip.findMany({orderBy:[{date:'asc'},{createdAt:'asc'}]}),
  db.dispatchHistory.findMany({orderBy:{createdAt:'desc'}}),
  db.auditLog.findMany({orderBy:{createdAt:'desc'}}),
  db.user.findMany({select:{id:true,email:true,fullName:true,role:true,active:true,createdAt:true,updatedAt:true},orderBy:{fullName:'asc'}}),
  db.settings.findMany()
 ]);
 const book=new ExcelJS.Workbook();
 const info=book.addWorksheet('Información');
 const counts:[string,number][]=[
  ['Tractores',addSheet(book,'Tractores',tractors.map(({driver,...t})=>({...t,operador:driver?.fullName??''})))],
  ['Remolques',addSheet(book,'Remolques',trailers)],
  ['Operadores',addSheet(book,'Operadores',drivers)],
  ['Destinos',addSheet(book,'Destinos',destinations.map(({aliases,...d})=>({...d,aliases:aliases.map(a=>a.alias).join(' | ')})))],
  ['Viajes',addSheet(book,'Viajes',trips)],
  ['Historial de despachos',addSheet(book,'Historial',history)],
  ['Auditoría',addSheet(book,'Auditoría',audit)],
  ['Usuarios',addSheet(book,'Usuarios',users)],
  ['Configuración',addSheet(book,'Configuración',settings)]
 ];
 info.addRow(['Respaldo de AXL Transport Dispatch']);
 info.addRow(['Generado',new Intl.DateTimeFormat('es-MX',{timeZone:'America/Tijuana',dateStyle:'full',timeStyle:'short'}).format(new Date())]);
 info.addRow(['Generado por',by]);
 info.addRow([]);info.addRow(['Hoja','Registros']);
 counts.forEach(([n,c])=>info.addRow([n,c]));
 info.addRow([]);
 info.addRow(['Notas']);
 info.addRow(['No incluye contraseñas, sesiones ni intentos de login. Los usuarios deberán recrearse con contraseña nueva.']);
 info.addRow(['Los textos que empiezan con = + - @ llevan un apóstrofe al inicio como protección de Excel; quítalo al restaurar.']);
 info.getRow(1).font={bold:true,size:14};info.getRow(5).font={bold:true};info.getRow(info.rowCount-2).font={bold:true};
 info.getColumn(1).width=32;info.getColumn(2).width=44;
 return new Uint8Array(await book.xlsx.writeBuffer());
}
