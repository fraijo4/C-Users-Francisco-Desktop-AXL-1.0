'use client';
import { useState } from 'react';
export default function Setup(){
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');const form=new FormData(e.currentTarget);
  if(form.get('password')!==form.get('confirmation')){setError('Las contraseñas no coinciden.');setBusy(false);return}
  try{
   const response=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:form.get('token'),fullName:form.get('fullName'),email:form.get('email'),password:form.get('password')})});
   const result=await response.json();if(!response.ok)throw new Error(result.message||'No se pudo activar la cuenta.');window.location.assign('/');
  }catch(e){setError(e instanceof Error?e.message:'No se pudo conectar.')}finally{setBusy(false)}
 }
 return <main className="login"><div className="login-story"><a className="brand" href="/">AXL<span>TRANSPORT</span></a><div><p className="eyebrow">AXL TRANSPORT DISPATCH</p><h1>Tu operación.<br/>Bajo tu control.</h1><p>Activa tu cuenta administradora para gestionar<br/>usuarios, equipos, destinos y viajes.</p></div><small>AXL Transport · CAAT 43E8 · SCAC AJXT</small></div><div className="login-form"><form onSubmit={submit}><h2>Activar cuenta administradora</h2><p className="muted">Esta activación se permite una sola vez. Necesitas el código privado del responsable del sitio.</p><label>Código de activación<input name="token" type="password" autoComplete="off" required maxLength={256}/></label><label>Nombre completo<input name="fullName" required autoComplete="name" maxLength={500}/></label><label>Correo electrónico<input name="email" type="email" required autoComplete="username"/></label><label>Contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/></label><label>Confirmar contraseña<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/></label>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Activando…':'Activar y entrar →'}</button></form></div></main>
}
