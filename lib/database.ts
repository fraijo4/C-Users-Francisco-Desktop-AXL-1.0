import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
// Sin DATABASE_CA(_FILE) la URL se usa tal cual (local y Render). Con CA se
// verifica el certificado del servidor; pg ignora `ssl` si la URL trae sslmode.
function poolConfig(){
 const raw=process.env.DATABASE_URL!;
 const max=Number(process.env.DATABASE_POOL_MAX)||(process.env.VERCEL?3:undefined);
 const caFile=process.env.DATABASE_CA_FILE;
 const ca=process.env.DATABASE_CA?.replace(/\\n/g,'\n')||(caFile?readFileSync(caFile,'utf8'):undefined);
 if(!ca||!raw)return {connectionString:raw,max};
 const url=new URL(raw);
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
 return {connectionString:url.toString(),max,ssl:{ca,rejectUnauthorized:true}};
}
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient({adapter:new PrismaPg(poolConfig())});
if (process.env.NODE_ENV !== 'production') globalDb.prisma = db;
