import { db } from '../lib/database';
import { configureAdmin } from '../lib/configure-admin';

async function main(){
 const changed=await configureAdmin(db,process.env.AXL_ADMIN_LOGIN,process.env.AXL_ADMIN_PASSWORD_HASH);
 if(changed)console.log('Cuenta administradora configurada.');
}
main().catch(()=>{console.error('No se pudo configurar la cuenta administradora. Revisa la configuración privada.');process.exitCode=1}).finally(()=>db.$disconnect());
