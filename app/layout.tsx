import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'AXL Transport Dispatch',description:'Despacho y programación de viajes de AXL Transport',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
