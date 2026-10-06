import { cookies } from 'next/headers';
import { db } from './database';
import { digest } from './password';
export async function currentUser() {
 const token = (await cookies()).get('axl_session')?.value;
 if (!token) return null;
 const session = await db.session.findUnique({where:{tokenHash:digest(token)},include:{user:true}});
 if (!session || session.expiresAt < new Date() || !session.user.active) return null;
 return {id:session.user.id,email:session.user.email,fullName:session.user.fullName,role:session.user.role};
}
