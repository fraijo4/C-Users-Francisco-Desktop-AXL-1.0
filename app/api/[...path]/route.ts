import { NextRequest,NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/database';
import { currentUser } from '@/lib/auth';
import { digest,hashPassword,verifyPassword } from '@/lib/password';
import { generateDispatch } from '@/lib/dispatch';
import { schemas,Entity } from '@/lib/validation';
import { canWrite,listRecords,saveRecord } from '@/lib/records';
import { exportSheet,readSheet,identity,importColumns } from '@/lib/spreadsheet';
export const runtime='nodejs';
const dummyHash=hashPassword('dummy-login-timing-padding');
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function body(req:NextRequest) {
 const raw=await req.text();if(raw.length>100000)throw new Error('Solicitud demasiado grande.');return JSON.parse(raw);
}
async function catalog() {
 const [tractors,trailers,destinations,settings,drivers]=await Promise.all([db.tractor.findMany({include:{driver:true}}),db.trailer.findMany(),db.destination.findMany({include:{aliases:true}}),db.settings.findUniqueOrThrow({where:{id:'global'}}),db.driver.findMany({orderBy:{fullName:'asc'}})]);
 return {tractors,trailers,destinations,settings,drivers};
}
async function handle(req:NextRequest) {
 const path=req.nextUrl.pathname.replace(/^\/api\//,'').split('/');const [entity,id]=path;
 const write=req.method!=='GET';
 if(write) {
  const origin=req.headers.get('origin');let sameOrigin=false;
  try {const parsed=new URL(origin||'');sameOrigin=parsed.host===req.headers.get('host')&&['http:','https:'].includes(parsed.protocol)&&parsed.origin===origin;}catch{}
  if(!sameOrigin)return json({message:'Origen no permitido.'},403);
 }
 if(entity==='login'&&req.method==='POST') {
  const input=await body(req);const email=String(input.email||'').trim().toLowerCase();const password=String(input.password||'');
  if(email.length>254||password.length>256)return json({message:'Credenciales inválidas.'},401);
  const key=digest(email);const windowStart=new Date(Date.now()-15*60*1000);
  const limit=await db.$transaction(async tx=>{
   const attempt=await tx.loginAttempt.findUnique({where:{key}});
   if(attempt&&attempt.windowStart>windowStart&&attempt.count>=10)return true;
   await tx.loginAttempt.upsert({where:{key},create:{key,count:1},update:attempt&&attempt.windowStart>windowStart?{count:{increment:1}}:{count:1,windowStart:new Date()}});return false;
  },{isolationLevel:'Serializable'});
  if(limit)return json({message:'Demasiados intentos. Espera 15 minutos.'},429);
  const user=await db.user.findUnique({where:{email}});
  const valid=verifyPassword(password,user?.passwordHash||dummyHash);
  if(!user?.active||!valid)return json({message:'Credenciales inválidas.'},401);
  const token=randomBytes(32).toString('hex');const expiresAt=new Date(Date.now()+12*60*60*1000);
  await db.session.create({data:{userId:user.id,tokenHash:digest(token),expiresAt}});
  await db.loginAttempt.deleteMany({where:{key}});
  (await cookies()).set('axl_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires:expiresAt});
  return json({success:true});
 }
 if(entity==='health'&&req.method==='GET') {await db.$queryRaw`SELECT 1`;return json({status:'ok'})}
 const user=await currentUser();if(!user)return json({message:'Inicia sesión.'},401);
 if(entity==='logout'&&req.method==='POST') {
  const token=(await cookies()).get('axl_session')?.value;
  if(token)await db.session.deleteMany({where:{tokenHash:digest(token)}});
  (await cookies()).delete('axl_session');return json({success:true});
 }
 if(entity==='statistics'&&req.method==='GET') {
  const localDate=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const [tractors,trailers,destinations,recent]=await Promise.all([db.tractor.count({where:{active:true}}),db.trailer.count({where:{active:true}}),db.destination.count({where:{active:true}}),db.dispatchHistory.findMany({where:{status:'GENERATED',createdAt:{gte:new Date(Date.now()-48*60*60*1000)}},select:{createdAt:true}})]);
  return json({tractors,trailers,destinations,today:recent.filter(r=>localDate(r.createdAt)===localDate(new Date())).length});
 }
 if(entity==='catalog'&&req.method==='GET')return json(await catalog());
 if(entity==='dispatch'&&req.method==='POST') {
  if(user.role==='READ_ONLY')return json({message:'Permiso insuficiente.'},403);
  const input=await body(req);
  if(typeof input.command!=='string'||input.command.length>500)return json({success:false,message:'No registrado.'},400);
  if(input.plateCountry&&input.plateCountry!=='US'&&input.plateCountry!=='MX')return json({success:false,message:'No registrado.'},400);
  const result=generateDispatch(input.command,await catalog(),new Date(),input.plateCountry||'US');
  await db.dispatchHistory.create({data:{userId:user.id,rawCommand:input.command,tractorId:result.tractorId,trailerId:result.trailerId,destinationId:result.destinationId,status:result.success?'GENERATED':'NOT_REGISTERED',generatedText:result.formattedText,snapshot:result.snapshot as Prisma.InputJsonValue}});
  return json(result.success?result:{success:false,message:'No registrado.',formattedText:'No registrado.'});
 }
 if(entity==='history'||entity==='audit') {
  if(user.role!=='ADMIN')return json({message:'Permiso insuficiente.'},403);
  if(req.method!=='GET')return json({message:'Método no permitido.'},405);
  return json(entity==='history'?await db.dispatchHistory.findMany({include:{user:{select:{fullName:true}}},orderBy:{createdAt:'desc'},take:500}):await db.auditLog.findMany({orderBy:{createdAt:'desc'},take:500}));
 }
 if(entity==='export'&&req.method==='GET') {
  if(user.role!=='ADMIN')return json({message:'Permiso insuficiente.'},403);
  const target=req.nextUrl.searchParams.get('entity')||'';const format=req.nextUrl.searchParams.get('format')==='csv'?'csv':'xlsx';
  const template=req.nextUrl.searchParams.get('template')==='1';
  let rows:Record<string,unknown>[];
  if(target==='history')rows=await db.dispatchHistory.findMany({orderBy:{createdAt:'desc'}});
  else if(target in schemas&&target!=='settings')rows=await listRecords(db,target as Entity);
  else return json({message:'Exportación inválida.'},400);
  if(template&&!importColumns[target])return json({message:'Plantilla inválida.'},400);
  const content=await exportSheet(template?[]:rows,format,template?importColumns[target]:undefined);
  return new NextResponse(content as BodyInit,{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="axl-${target}.${format}"`,'Cache-Control':'no-store'}});
 }
 if(entity==='import'&&req.method==='POST') {
  if(user.role!=='ADMIN')return json({message:'Permiso insuficiente.'},403);
  if(id==='preview') {
   if(Number(req.headers.get('content-length')||0)>2_000_000)return json({message:'Máximo 2 MB.'},400);
   const form=await req.formData();const target=String(form.get('entity')) as Entity;const file=form.get('file');
   if(!importColumns[target]||!(file instanceof File)||file.size>2_000_000)return json({message:'Archivo o módulo inválido (máximo 2 MB).'},400);
   const rawRows=await readSheet(await file.arrayBuffer(),target);
   const rows=rawRows.map(r=>schemas[target].parse(r) as Record<string,unknown>);
   const existing=await listRecords(db,target);const seen=new Set<string>();
   const preview=rows.map(row=>{
    const key=identity(target,row);if(seen.has(key))throw new Error('Archivo con registros duplicados.');seen.add(key);
    const match=existing.find(r=>identity(target,r as unknown as Record<string,unknown>)===key);
    return {...row,...(match?{id:match.id}:{}),action:match?'Actualizar (requiere confirmación)':'Crear'};
   });
   const batch=await db.importBatch.create({data:{userId:user.id,entity:target,rows:preview as Prisma.InputJsonValue,baselineHash:digest(JSON.stringify(existing))}});
   return json({batchId:batch.id,rows:preview});
  }
  if(id==='confirm') {
   const input=await body(req);if(input.confirm!==true)return json({message:'Confirma los cambios explícitamente.'},400);
   const result=await db.$transaction(async tx=>{
    const batch=await tx.importBatch.findUniqueOrThrow({where:{id:String(input.batchId)}});
    if(batch.userId!==user.id||batch.confirmedAt||Date.now()-batch.createdAt.getTime()>30*60*1000)throw new Error('Importación vencida o ya aplicada.');
    const target=batch.entity as Entity;const backup=await listRecords(tx,target);
    if(digest(JSON.stringify(backup))!==batch.baselineHash)throw new Error('Los datos cambiaron. Vuelve a cargar y revisar el archivo.');
    for(const row of batch.rows as Record<string,unknown>[])await saveRecord(tx,target,row,user.id,row.id as string|undefined);
    await tx.importBatch.update({where:{id:batch.id},data:{confirmedAt:new Date(),backup:JSON.parse(JSON.stringify(backup))}});
    return {success:true,count:(batch.rows as unknown[]).length};
   },{isolationLevel:'Serializable',timeout:30000});return json(result);
  }
 }
 if(entity in schemas) {
  const target=entity as Entity;
  if((target==='users'||target==='settings')&&user.role!=='ADMIN')return json({message:'Permiso insuficiente.'},403);
  if(req.method==='GET')return json(await listRecords(db,target));
  if(!canWrite(user.role,target))return json({message:'Permiso insuficiente.'},403);
  if(req.method==='POST'||req.method==='PATCH') {
   if(req.method==='PATCH'&&!id)return json({message:'Falta el registro.'},400);
   const input=await body(req);
   const result=await db.$transaction(tx=>saveRecord(tx,target,input,user.id,req.method==='PATCH'?id:undefined),{isolationLevel:'Serializable'});
   return json(result,req.method==='POST'?201:200);
  }
 }
 return json({message:'Ruta no disponible.'},404);
}
async function route(req:NextRequest) {
 try{return await handle(req)}catch(e){
  if(e instanceof Prisma.PrismaClientKnownRequestError){
   if(e.code==='P2002')return json({message:'Ya existe ese económico, VIN, correo o alias.'},409);
   if(e.code==='P2034')return json({message:'Otra operación modificó los datos. Vuelve a intentar.'},409);
   if(e.code==='P2025')return json({message:'Registro inexistente.'},404);
   console.error('Database operation failed:',e.code);return json({message:'No se pudo guardar la operación.'},500);
  }
  if(e instanceof Error&&e.name.startsWith('Prisma')){console.error('Database unavailable:',e.name);return json({message:'La base de datos no está disponible.'},503)}
  if(e instanceof Error&&e.name==='ZodError')return json({message:'Datos inválidos. Revisa los campos obligatorios y formatos.'},400);
  console.error('Request failed:',e instanceof Error?e.name:'unknown');
  return json({message:e instanceof Error&&!['SyntaxError','TypeError'].includes(e.name)?e.message:'Solicitud inválida.'},400);
 }
}
export const GET=route;export const POST=route;export const PATCH=route;
