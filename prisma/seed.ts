import { db } from '../lib/database';
import master from '../data/master.json';
async function main() {
 await db.settings.upsert({where:{id:'global'},create:{id:'global'},update:{}});
 for (const {fullName,...tractor} of master.tractors) {
  if(await db.tractor.findUnique({where:{economicNumber:tractor.economicNumber}})) continue;
  await db.$transaction(async tx=>{
   const driver = await tx.driver.create({data:{fullName:fullName!}});
   await tx.tractor.create({data:{...tractor,driverId:driver.id}});
  });
 }
 for(const trailer of master.trailers) await db.trailer.upsert({where:{economicNumber:trailer.economicNumber},create:trailer,update:{}});
 await db.destination.upsert({where:{name:'Houston'},create:{name:'Houston',formattedAddress:'670- NORTH HOUSTON – NPT DIST.\n7350 DENNY ST STE 100\nHOUSTON, TX 77040-4857',addressLine1:'670- NORTH HOUSTON – NPT DIST.',addressLine2:'7350 DENNY ST STE 100',city:'HOUSTON',state:'TX',postalCode:'77040-4857',country:null},update:{}});
 console.log('Datos iniciales cargados sin reemplazar registros existentes.');
}
main().finally(()=>db.$disconnect());
