import { redirect } from 'next/navigation';
import { db } from '@/lib/database';
import Setup from '@/components/Setup';
export const dynamic='force-dynamic';
export default async function Page(){
 if(await db.user.count())redirect('/login');
 if(!process.env.AXL_SETUP_TOKEN||process.env.AXL_SETUP_TOKEN.length<32)return <main className="login-form"><div><h1>Activación no disponible</h1><p>Solicita al responsable del sitio que habilite la activación de la primera cuenta.</p><a href="/login">Ir al inicio de sesión</a></div></main>;
 return <Setup/>;
}
