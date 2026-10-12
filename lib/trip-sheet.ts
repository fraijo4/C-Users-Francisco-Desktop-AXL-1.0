import ExcelJS from 'exceljs';
import { tripColumns,tripDayLabel,addTripDays } from './trip-calendar';
import { safeCell } from './spreadsheet';
export const tripExportColumns=['Fecha',...tripColumns.map(([,label])=>label),'Notas','Referencia adicional','Estado general'];
export function tripExportRows(rows:Record<string,unknown>[]){return rows.map(r=>Object.fromEntries(tripExportColumns.map((label,i)=>[label,i===0?r.date:i<=12?r[tripColumns[i-1][0]]:i===13?r.notes:i===14?r.reference:r.status])))}
export async function exportTripWorkbook(rows:Record<string,unknown>[],from?:string,to?:string){
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Viajes por día');
 sheet.columns=tripColumns.map(([,header],i)=>({header,key:String(i),width:i>=8?14:i===7?34:24}));
 sheet.getRow(1).values=['AXL TRANSPORT — VIAJES'];sheet.mergeCells('A1:L1');sheet.getRow(1).height=30;sheet.getCell('A1').font={bold:true,size:16};
 const dates=from&&to?(()=>{const result=[];for(let d=from;d<=to;d=addTripDays(d,1))result.push(d);return result})():[...new Set(rows.map(r=>String(r.date)))].sort();
 const colors:Record<string,string>={yellow:'FFF5C96B',green:'FFDCEBD6',red:'FFF9DCD8',blue:'FFDDEBF7'};
 for(const date of dates){
  const day=sheet.addRow([tripDayLabel(date)]);sheet.mergeCells(day.number,1,day.number,12);day.height=25;day.getCell(1).font={bold:true};day.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8EEE5'}};
  const headers=sheet.addRow(tripColumns.map(([,label])=>label));headers.font={bold:true};headers.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE698'}};c.border={bottom:{style:'thin',color:{argb:'FFD7D7BD'}}}});
  const dayRows=rows.filter(r=>r.date===date);
  if(!dayRows.length)sheet.addRow([]);
  for(const record of dayRows){
   const row=sheet.addRow(tripColumns.map(([key])=>safeCell(record[key])));row.alignment={vertical:'top',wrapText:true};row.height=40;
   const color=colors[String(record.rowColor)];if(color)row.eachCell({includeEmpty:true},c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}}});
   const notes=[record.notes,record.reference?'Referencia adicional: '+record.reference:null].filter(Boolean).join('\n');if(notes)row.getCell(8).note=safeCell(notes);
  }
  sheet.addRow([]);
 }
 sheet.views=[{state:'frozen',ySplit:1}];sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
 return new Uint8Array(await book.xlsx.writeBuffer());
}
