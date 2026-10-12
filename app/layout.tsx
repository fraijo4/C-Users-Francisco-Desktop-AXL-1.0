import type { Metadata,Viewport } from 'next';
import './globals.css';
import './mobile.css';
export const metadata:Metadata={title:'AXL Transport Dispatch',description:'Despacho y programación de viajes de AXL Transport',robots:{index:false,follow:false},appleWebApp:{capable:true,title:'AXL',statusBarStyle:'black-translucent'}};
export const viewport:Viewport={themeColor:'#142e24',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
