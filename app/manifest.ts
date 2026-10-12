import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest{
 return {name:'AXL Transport Dispatch',short_name:'AXL',description:'Despacho y programación de viajes de AXL Transport',start_url:'/',display:'standalone',background_color:'#142e24',theme_color:'#142e24',lang:'es',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]};
}
