import { createInterface } from 'node:readline/promises';
import { db } from '../lib/database';
import { hashPassword } from '../lib/password';
async function main() {
 const email = process.argv[2]?.trim().toLowerCase();
 const fullName = process.argv[3]?.trim();
 if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName) throw new Error('Uso: npm run admin:create -- correo nombre (contraseña de al menos 12 caracteres por stdin)');
 const rl = createInterface({input:process.stdin,output:process.stdout});
 const password = await rl.question('Contraseña (entrada por stdin, no usar como argumento): ');
 rl.close();
 if(password.length<12) throw new Error('La contraseña debe tener al menos 12 caracteres.');
 if(await db.user.count({where:{role:'ADMIN',active:true}})) throw new Error('Ya hay un administrador activo. Usa Usuarios con una cuenta ADMIN.');
 await db.user.create({data:{email,fullName,passwordHash:hashPassword(password),role:'ADMIN'}});
 console.log('Administrador creado.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
