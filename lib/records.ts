import { Prisma, Role } from '@prisma/client';
import { schemas,Entity } from './validation';
import { normalizeDestination } from './dispatch';
import { hashPassword } from './password';
type Tx = Prisma.TransactionClient;
export const userSelect={id:true,email:true,fullName:true,role:true,active:true,createdAt:true,updatedAt:true};
export async function listRecords(tx:Tx, entity:Entity) {
 switch(entity) {
  case 'tractors':return tx.tractor.findMany({include:{driver:true},orderBy:{economicNumber:'asc'}});
  case 'trailers':return tx.trailer.findMany({orderBy:{economicNumber:'asc'}});
  case 'drivers':return tx.driver.findMany({orderBy:{fullName:'asc'}});
  case 'destinations':return tx.destination.findMany({include:{aliases:true},orderBy:{name:'asc'}});
  case 'users':return tx.user.findMany({select:userSelect,orderBy:{fullName:'asc'}});
  case 'settings':return tx.settings.findMany();
  case 'trips':return tx.trip.findMany({orderBy:[{date:'desc'},{createdAt:'desc'}]});
 }
}
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function saveRecord(tx:Tx,entity:Entity,raw:unknown,userId:string,id?:string) {
 const data=schemas[entity].parse(raw);
 const before=id?(await listRecords(tx,entity)).find(r=>r.id===id):null;
 if(id&&!before) throw new Error('Registro inexistente.');
 let after;
 switch(entity) {
  case 'tractors':{
   const v=schemas.tractors.parse(raw);
   if(v.driverId&&!await tx.driver.findFirst({where:{id:v.driverId,active:true}})) throw new Error('Operador no registrado o inactivo.');
   after=id?await tx.tractor.update({where:{id},data:v}):await tx.tractor.create({data:v});break;
  }
  case 'trailers':{const v=schemas.trailers.parse(raw);after=id?await tx.trailer.update({where:{id},data:v}):await tx.trailer.create({data:v});break}
  case 'drivers':{const v=schemas.drivers.parse(raw);after=id?await tx.driver.update({where:{id},data:v}):await tx.driver.create({data:v});break}
  case 'destinations':{
   const {aliases,...v}=schemas.destinations.parse(raw);
   const normalized=[...new Set(aliases.map(normalizeDestination))];
   const destinations=await tx.destination.findMany({include:{aliases:true}});
   const ownNames=new Set([normalizeDestination(v.name),...normalized]);
   if(destinations.some(d=>d.id!==id&&[normalizeDestination(d.name),...d.aliases.map(a=>a.aliasNormalized)].some(n=>ownNames.has(n)))) throw new Error('Nombre o alias ya registrado en otro destino.');
   const aliasData=aliases.filter((a,i)=>aliases.findIndex(b=>normalizeDestination(a)===normalizeDestination(b))===i).map(alias=>({alias,aliasNormalized:normalizeDestination(alias)}));
   after=id?await tx.destination.update({where:{id},data:{...v,aliases:{deleteMany:{},create:aliasData}},include:{aliases:true}}):await tx.destination.create({data:{...v,aliases:{create:aliasData}},include:{aliases:true}});break;
  }
  case 'users':{
   const {password,...v}=schemas.users.parse(raw);
   if(id===userId&&(!v.active||v.role!=='ADMIN')) throw new Error('No puedes desactivar ni quitar el rol de tu propia cuenta.');
   if(!id&&!password) throw new Error('La contraseña es obligatoria.');
   if(id) await tx.session.deleteMany({where:{userId:id}});
   after=id?await tx.user.update({where:{id},data:{...v,...(password?{passwordHash:hashPassword(password)}:{})},select:userSelect}):await tx.user.create({data:{...v,passwordHash:hashPassword(password!)},select:userSelect});break;
  }
  case 'settings':{const v=schemas.settings.parse(raw);after=await tx.settings.update({where:{id:'global'},data:v});break}
  case 'trips':{
   const v=schemas.trips.parse(raw);
   const tractor=await tx.tractor.findFirst({where:{economicNumber:v.tractorNumber,active:true},include:{driver:true}});
   const original=before as {tractorNumber?:string;driverName?:string}|null;
   const sameAssignment=original?.tractorNumber===v.tractorNumber&&original?.driverName===v.driverName;
   if(!sameAssignment&&(!tractor||!tractor.driver?.active||tractor.driver.fullName!==v.driverName)) throw new Error('Unidad u operador no registrado; selecciona una unidad activa.');
   if(v.trailerNumber&&!await tx.trailer.findFirst({where:{economicNumber:v.trailerNumber,active:true}})) throw new Error('Remolque no registrado o inactivo.');
   // Preserve the original author when editing a trip.
   after=id?await tx.trip.update({where:{id},data:v}):await tx.trip.create({data:{...v,userId}});break;
  }
 }
 await tx.auditLog.create({data:{userId,entity,recordId:after.id,...(before?{before:json(before)}:{}),after:json(after)}});
 return after;
}
export function canWrite(role:Role,entity:string) {return role==='ADMIN'||(role==='DISPATCHER'&&entity==='trips')}
