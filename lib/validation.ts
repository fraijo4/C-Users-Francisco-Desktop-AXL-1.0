import { z } from 'zod';
import { normalizeTractor,normalizeTrailer } from './dispatch';
const text = z.string().trim().min(1).max(500);
const optional = z.string().trim().max(500).nullish().transform(v=>v || null);
const active = z.boolean().default(true);
export const accountLogin = z.string().trim().toLowerCase().max(254).refine(v=>z.email().safeParse(v).success||/^[a-z0-9][a-z0-9._-]{2,63}$/.test(v),'Usuario o correo inválido');
const plate = z.string().trim().max(30).nullish().transform(v=>v || null);
export const tripDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
const tripText = z.string().trim().max(500).nullish().transform(v=>v||'');
const tripLongText = z.string().trim().max(5000).nullish().transform(v=>v||null);
export const schemas = {
 drivers:z.object({fullName:text,active}),
 tractors:z.object({economicNumber:text.transform(normalizeTractor).refine(Boolean,'Unidad inválida').transform(v=>v!),driverId:optional,brand:optional,year:z.number().int().min(1900).max(2100).nullable().optional(),vin:z.string().trim().regex(/^[A-HJ-NPR-Z0-9]{17}$/).nullable().optional(),plateUs:plate,plateMex:plate,notes:optional,active}),
 trailers:z.object({economicNumber:text.transform(normalizeTrailer).refine(Boolean,'Remolque inválido').transform(v=>v!),category:z.enum(['dry','reefer','flatbed']),lengthFt:z.union([z.literal(45),z.literal(48),z.literal(53)]),plateUs:plate,plateMex:plate,notes:optional,active}).refine(v=>v.category!=='reefer'||v.lengthFt===53,'Refrigerada debe ser 53 pies').refine(v=>v.category!=='flatbed'||v.lengthFt!==53,'Plataforma debe ser 45 o 48 pies').transform(v=>({...v,displayType:`${v.category==='flatbed'?'Plataforma':v.category==='reefer'?'Caja Refrigerada':'Caja'} ${v.lengthFt}'`})),
 destinations:z.object({name:text,addressLine1:optional,addressLine2:optional,city:optional,state:optional,postalCode:optional,country:optional,formattedAddress:z.string().trim().min(1).max(5000),notes:optional,active,aliases:z.array(text).max(30).default([])}),
 users:z.object({email:accountLogin,fullName:text,role:z.enum(['ADMIN','DISPATCHER','READ_ONLY']),password:z.string().min(12).max(256).optional(),active}),
 settings:z.object({companyName:text,caat:text,scac:text,timezone:text.refine(v=>{try {new Intl.DateTimeFormat('en',{timeZone:v});return true} catch{return false}},'Zona horaria inválida'),morningGreeting:text,afternoonGreeting:text}),
 trips:z.object({date:tripDate,tractorNumber:tripText.transform(v=>normalizeTractor(v)||v),trailerNumber:optional.transform(v=>v?(normalizeTrailer(v)||v):null),driverName:tripText,origin:optional,destination:tripText,client:optional,reference:optional,stop:optional,invoices:tripLongText,paperwork:optional,customsPreview:optional,crossed:optional,delivered:optional,rowColor:z.enum(['none','yellow','green','red','blue']).default('none'),status:z.enum(['Programado','En tránsito','Completado','Cancelado']).default('Programado'),notes:tripLongText,active,expectedUpdatedAt:z.iso.datetime().optional()}).refine(v=>[v.client,v.driverName,v.origin,v.destination,v.stop,v.tractorNumber,v.trailerNumber,v.invoices,v.reference,v.notes].some(Boolean),'Captura al menos un dato del viaje.')
};
export type Entity = keyof typeof schemas;
export const entityNames: Record<Entity,string> = {drivers:'Operadores',tractors:'Unidades',trailers:'Remolques',destinations:'Destinos',users:'Usuarios',settings:'Configuración',trips:'Viajes'};
