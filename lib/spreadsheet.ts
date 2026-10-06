import ExcelJS from 'exceljs';
import { Entity } from './validation';
import { normalizeDestination } from './dispatch';
export const importColumns:Record<string,string[]>={
 tractors:['economicNumber','driverId','brand','year','vin','plateUs','plateMex','notes','active'],
 trailers:['economicNumber','category','lengthFt','plateUs','plateMex','notes','active'],
 drivers:['fullName','active'],
 destinations:['name','addressLine1','addressLine2','city','state','postalCode','country','formattedAddress','notes','active','aliases']
};
export function identity(entity:Entity,row:Record<string,unknown>) {return String(entity==='drivers'?row.fullName:entity==='destinations'?row.name:row.economicNumber).trim().toLowerCase()}
export async function readSheet(buffer:ArrayBuffer,entity:Entity) {
 const book=new ExcelJS.Workbook();
 await book.xlsx.load(buffer);
 const sheet=book.worksheets[0];
 if(!sheet||sheet.rowCount>501||sheet.columnCount>30) throw new Error('Usa una hoja con máximo 500 filas y 30 columnas.');
 const headers=(sheet.getRow(1).values as unknown[]).slice(1).map(v=>String(v??'').trim());
 const allowed=importColumns[entity];
 if(!allowed||headers.some(h=>!allowed.includes(h))||new Set(headers).size!==headers.length) throw new Error('Columnas incompatibles. Descarga la plantilla de este módulo.');
 const rows:Record<string,unknown>[]=[];
 sheet.eachRow((row,n)=>{
  if(n===1)return;
  const item:Record<string,unknown>={};
  headers.forEach((h,i)=>{
   const value=row.getCell(i+1).value;
   if(value!==null&&typeof value==='object') throw new Error('No se admiten fórmulas, vínculos ni celdas complejas.');
   if(h==='aliases')item[h]=value?String(value).split('|').map(v=>v.trim()).filter(Boolean):[];
   else if(h==='active') {if(value===null||value==='')item[h]=true;else if(value===true||value==='true'||value===1)item[h]=true;else if(value===false||value==='false'||value===0)item[h]=false;else throw new Error('active debe ser true o false.')}
   else if(h==='year'||h==='lengthFt')item[h]=value===null||value===''?null:Number(value);
   else item[h]=value===null||value===''?null:String(value);
  });
  rows.push(item);
 });
 if(!rows.length)throw new Error('El archivo no contiene registros.');
 return rows;
}
export function safeCell(v:unknown) {
 const s=v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);
 return /^[\s]*[=+\-@\t\r]/.test(s)?`'${s}`:s;
}
export async function exportSheet(rows:Record<string,unknown>[],format:string,columns?:string[]) {
 const keys=columns||[...new Set(rows.flatMap(r=>Object.keys(r)))];
 if(format==='csv') {
  const escape=(s:string)=>`"${s.replaceAll('"','""')}"`;
  return '\uFEFF'+[keys,...rows.map(r=>keys.map(k=>safeCell(r[k])))].map(r=>r.map(escape).join(',')).join('\r\n');
 }
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('AXL');
 sheet.addRow(keys);rows.forEach(r=>sheet.addRow(keys.map(k=>safeCell(r[k]))));
 sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>c.width=24);
 return new Uint8Array(await book.xlsx.writeBuffer());
}
