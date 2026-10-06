import 'dotenv/config';
import { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
async function main(){
 const control=new Pool({connectionString:process.env.DATABASE_URL});const name=`axl_restore_${Date.now()}`;const url=new URL(process.env.DATABASE_URL!);url.pathname='/'+name;
 await control.query(`CREATE DATABASE "${name}"`);const restored=new Pool({connectionString:url.toString()});
 try {
  execFileSync('docker',['compose','exec','-T','db','psql','-v','ON_ERROR_STOP=1','-U','axl','-d',name],{input:readFileSync('.local/database.sql'),stdio:['pipe','pipe','pipe']});
  for(const table of ['Tractor','Trailer','Driver','Destination','Settings','User','DispatchHistory','Trip']){
   const original=await control.query(`SELECT count(*)::int AS total FROM "${table}"`);const copy=await restored.query(`SELECT count(*)::int AS total FROM "${table}"`);assert.equal(copy.rows[0].total,original.rows[0].total);
  }
  console.log('Respaldo restaurado correctamente en una base separada: 8 tablas verificadas.');
 }finally{await restored.end();await control.query(`DROP DATABASE "${name}"`);await control.end()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Error');process.exitCode=1});
