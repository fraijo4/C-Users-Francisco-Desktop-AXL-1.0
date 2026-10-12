import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { addTripDays,tripMonthWeeks,tripWeekStart,tripColumns } from '../lib/trip-calendar';
import { schemas } from '../lib/validation';
import { exportTripWorkbook,tripExportRows } from '../lib/trip-sheet';

test('weekly board keeps Friday–Thursday weeks across months, years and leap days',()=>{
 assert.equal(tripWeekStart('2026-10-12'),'2026-10-09');assert.equal(tripWeekStart('2026-10-09'),'2026-10-09');
 assert.equal(tripWeekStart('2026-01-01'),'2025-12-26');
 assert.deepEqual(tripMonthWeeks('2026-10'),['2026-09-25','2026-10-02','2026-10-09','2026-10-16','2026-10-23','2026-10-30']);
 assert.equal(addTripDays('2024-02-28',1),'2024-02-29');assert.equal(addTripDays('2026-02-28',1),'2026-03-01');
});
test('trip drafts preserve free-text marks and external equipment without changing catalogs',()=>{
 const row=schemas.trips.parse({date:'2026-10-12',client:'Cliente',stop:'10.06.26',trailerNumber:'DD4',paperwork:'2',crossed:'CONTROL : 123'});
 assert.equal(row.tractorNumber,'');assert.equal(row.driverName,'');assert.equal(row.trailerNumber,'DD4');assert.equal(row.crossed,'CONTROL : 123');
 assert.equal(schemas.trips.parse({date:'2026-10-12',tractorNumber:'T15'}).tractorNumber,'T-15');
 assert.throws(()=>schemas.trips.parse({date:'2026-10-12'}));assert.throws(()=>schemas.trips.parse({date:'2026-02-30',client:'C'}));
 assert.throws(()=>schemas.trips.parse({date:'2026-10-12',client:'C',rowColor:'unknown'}));
});
test('weekly Excel exports real column headers, empty days, manual colors, notes and safe invoice text',async()=>{
 const record={date:'2026-10-07',client:'Cliente',driverName:'Operador',invoices:'=HYPERLINK("bad")',rowColor:'red',notes:'Cambio de operador',reference:'Referencia anterior',paperwork:'2',active:true};
 const bytes=await exportTripWorkbook([record],'2026-10-02','2026-10-08');const book=new ExcelJS.Workbook();await book.xlsx.load(bytes.buffer as ArrayBuffer);
 const sheet=book.worksheets[0];let headerCount=0;let invoiceCell:ExcelJS.Cell|undefined;
 sheet.eachRow(row=>{if(row.getCell(1).value==='Cliente'&&row.getCell(2).value==='Operador'&&row.getCell(6).value==='Tractor')headerCount++;if(String(row.getCell(8).value).includes('HYPERLINK'))invoiceCell=row.getCell(8)});
 assert.equal(headerCount,7);assert.equal(invoiceCell?.type,ExcelJS.ValueType.String);assert.ok(String(invoiceCell?.value).startsWith("'="));
 assert.deepEqual((invoiceCell?.fill as ExcelJS.FillPattern).fgColor,{argb:'FFF9DCD8'});assert.ok(String(invoiceCell?.note).includes('Cambio de operador'));
 const csv=tripExportRows([record])[0];assert.equal(csv['Papeles'],'2');assert.equal(csv['Referencia adicional'],'Referencia anterior');assert.equal(tripColumns.length,12);
});
