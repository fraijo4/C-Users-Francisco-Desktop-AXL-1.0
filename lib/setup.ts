import { timingSafeEqual } from 'node:crypto';
import { digest } from './password';
export function activationAllowed(expected:string|undefined,provided:unknown){
 if(!expected||expected.length<32||typeof provided!=='string'||provided.length>256)return false;
 return timingSafeEqual(Buffer.from(digest(expected),'hex'),Buffer.from(digest(provided),'hex'));
}
