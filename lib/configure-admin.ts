import { PrismaClient } from '@prisma/client';
import { accountLogin } from './validation';
import { digest } from './password';

// Operator-only configuration. Credentials are never embedded in the source.
export async function configureAdmin(db:PrismaClient,login:string|undefined,passwordHash:string|undefined){
 if(!login&&!passwordHash)return false;
 const email=accountLogin.parse(login);
 if(!passwordHash||!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash))throw new Error('Configuración de administrador incompleta o hash inválido.');
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(43884389)`;
  const previous=await tx.user.findUnique({where:{email}});
  if(previous?.active&&previous.role==='ADMIN'&&previous.passwordHash===passwordHash)return false;
  const user=await tx.user.upsert({where:{email},create:{email,fullName:'Administrador AXL',passwordHash,role:'ADMIN',active:true},update:{passwordHash,role:'ADMIN',active:true}});
  const publicFields=(u:typeof user)=>({email:u.email,fullName:u.fullName,role:u.role,active:u.active});
  await tx.auditLog.create({data:{userId:user.id,entity:'users',recordId:user.id,...(previous?{before:publicFields(previous)}:{}),after:publicFields(user)}});
  await tx.session.deleteMany({where:{userId:user.id}});
  await tx.loginAttempt.deleteMany({where:{key:digest(email)}});
  return true;
 });
}
