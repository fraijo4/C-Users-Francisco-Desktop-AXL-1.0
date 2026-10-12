# Plan de implementación: AXL Dispatch en móvil

Basado en la auditoría del 12 de octubre de 2026 (calificación general B−, móvil C).
Reporte completo: https://claude.ai/artifact/ESEbSDv3RPr5YNV87hneLy

Marca cada casilla al terminarla (`[x]`). Cada fase se publica por separado:
push a `main` → Vercel despliega solo → verificar en https://axl-1-0.vercel.app.

**Reglas para todas las fases**

- Solo cambios de presentación. No tocar `lib/dispatch.ts`, la regla «No registrado.», permisos, auditoría ni el control de ediciones simultáneas sin consultarlo antes.
- Antes de cada push: `npm run typecheck` y `npm test` en verde.
- Probar en 390 px (iPhone) y 1440 px (escritorio) con Playwright, como en la auditoría.
- No probar contra producción acciones que escriben datos (despachos, guardar, importar). Para eso, base local (`bash scripts/local-db.sh`) o una rama de Supabase.

---

## Fase 0: Cerrar la migración y corregir datos

Objetivo: dejar Vercel + Supabase como única versión confiable.

Migración (hecho)
- [x] Esquema y registro `_axl_migrations` en Supabase, RLS activado
- [x] Catálogos copiados desde Render (11 tractores, 21 remolques, 11 operadores, 49 destinos)
- [x] `DATABASE_URL`, `DATABASE_CA` en Vercel; TLS verificado
- [x] Código preparado para Vercel (`vercel.json`, pool, TLS) y desplegado
- [x] Usuario `admin` creado (contraseña en `.env`, `AXL_ADMIN_PASSWORD`)

Pendiente
- [x] Corregir los alias de destinos: 18 alias restaurados con sus IDs originales (12 oct)
- [ ] Probar un despacho con alias, por ejemplo `T15 4416 Ontario`: pendiente, escribe en el Historial; hacerlo en base local o borrar el registro después
- [x] Borrar los 2 despachos de prueba del Historial (12 oct)
- [ ] Cambiar la contraseña de `admin` desde Usuarios
- [ ] Borrar `AXL_SETUP_TOKEN` de Vercel (ya no sirve; `/setup` está cerrado)
- [ ] Confirmar respaldos de Supabase (plan gratis: revisar retención) y hacer un respaldo manual
- [ ] Decidir fecha para apagar Render
- [ ] Actualizar `HANDOVER.md`: producción ahora es Vercel + Supabase; `AGENTS.md` pasó a `CLAUDE.md`

Criterio de aceptación: Destinos muestra alias legibles; un despacho por alias encuentra el destino correcto.

---

## Fase 1: Arreglos rápidos de móvil

Objetivo: quitar las molestias más visibles con cambios pequeños de CSS. Esfuerzo bajo.

Archivos: `app/globals.css`, `components/Dashboard.tsx`

- [x] Campos a 16 px en móvil, para evitar el zoom de iPhone
- [x] Botones y pestañas con al menos 44 px de alto en móvil
- [x] Etiquetas pequeñas subidas a 12 px
- [x] Banda verde vacía eliminada (el menú lateral ya no se muestra en móvil)
- [x] Barra lateral de escritorio: no era un fallo; el corte se debía a la captura de página completa (la barra es fija en pantalla real)
- [x] Despacho: al generar, la página se desplaza al mensaje (móvil)
- [x] Despacho: «Copiar mensaje» muestra «Copiado ✓»

Criterio de aceptación: en 390 px, ningún campo menor a 16 px ni botón menor a 44 px; tras generar, el mensaje queda en pantalla sin desplazarse a mano.

---

## Fase 2: Navegación inferior

Objetivo: que todas las secciones se encuentren con el pulgar. Esfuerzo medio.

Archivos: `components/Dashboard.tsx`, `app/globals.css`

- [x] Debajo de 760 px, menú horizontal oculto
- [x] Barra inferior fija con 4 entradas: Despacho, Viajes, Catálogos, Más
- [x] «Catálogos» abre la lista: Unidades, Remolques, Operadores, Destinos
- [x] «Más» abre la lista: Historial, Auditoría, Usuarios, Configuración, Cerrar sesión
- [x] «Más» muestra solo lo que el rol puede usar (probado con admin; falta probar DISPATCHER y READ_ONLY)
- [x] Área segura del iPhone respetada
- [x] Búsqueda global: campo de 44 px fijo arriba (en lugar de ícono, más simple)
- [x] Escritorio sin cambios (verificado)

Criterio de aceptación: las 10 secciones se alcanzan en dos toques como máximo, sin deslizar el menú.

---

## Fase 3: Despacho pensado para el teléfono

Objetivo: generar y copiar un despacho sin desplazarse. Esfuerzo bajo.

Archivos: `components/Dashboard.tsx`, `app/globals.css`

- [x] En móvil, las 4 cifras en una sola fila compacta
- [x] Ejemplos de comando y selector de placas en dos filas de chips con desplazamiento lateral (AXL2)
- [x] Botón «Copiar mensaje» fijo abajo mientras haya mensaje
- [x] Etiqueta «Consulta directa» quitada

Criterio de aceptación: en 390 px, del comando a «Copiado» sin desplazarse.

---

## Fase 4: Tablas como tarjetas y editor en hoja inferior

Objetivo: que Editar siempre esté a la vista. Esfuerzo medio.

Archivos: `components/Dashboard.tsx`, `app/globals.css`

- [x] Debajo de 760 px, cada registro se ve como tarjeta con Editar visible
  - [x] Unidades
  - [x] Remolques
  - [x] Operadores
  - [x] Destinos (con alias como etiquetas)
  - [x] Usuarios, Historial y Auditoría
- [x] Destinos en escritorio: columna Dirección más ancha
- [x] Editor en móvil: hoja inferior con Guardar y Cancelar fijos
- [x] Importar y exportar agrupados en un menú «Importar / Exportar»
- [x] Selector de archivo en español (ya no sale «Choose File»)

Criterio de aceptación: Destinos en móvil mide menos de 5,000 px de alto; Editar visible en cada tarjeta sin desplazamiento lateral.

---

## Fase 5: Viajes por día en el teléfono

Objetivo: capturar y revisar viajes desde el teléfono. Esfuerzo alto.

Archivos: `components/TripsBoard.tsx`, `lib/trip-calendar.ts` (solo lectura), `app/globals.css`

Antes de empezar
- [x] Campos primarios de la tarjeta: Cliente, Operador, Tractor/Remolque, Destino

Tareas
- [x] Debajo de 760 px, cada viaje como tarjeta; cuadrícula intacta en escritorio (AXL2)
- [x] Tocar la tarjeta abre la hoja inferior con los 12 campos, color y notas (AXL2)
- [x] «Guardar N cambios» muestra los pendientes (AXL2)
- [x] Selector de mes en español (AXL2)
- [x] Sin cambios en expectedUpdatedAt, aviso al salir y exportaciones (AXL2)
- [x] Prueba en base local (Postgres local, 390 px): crear, editar operador/tractor/remolque/notas, cambiar de día y retirar; `npm run test:integration` 85 verificaciones en verde (AXL2)

Criterio de aceptación: un viaje se captura completo en el teléfono sin desplazamiento lateral; `npm run test:integration` en verde en local.

---

## Fase 6: Claridad y acabados

Objetivo: que un usuario nuevo entienda la app sin explicación. Esfuerzo bajo.

- [ ] Decidir el nombre: «Tractores» o «Unidades», y usarlo igual en menú, tablas, tarjetas y ayuda *(decisión de ustedes)*
- [x] Línea «AXL TRANSPORT DISPATCH» repetida quitada
- [x] Carga con la forma de la página (esqueletos) en lugar de «Cargando…» (AXL2)
- [x] Estados vacíos con acción: «Agregar el primer viaje», «+ Agregar registro» y «Quitar filtro» (AXL2)
- [x] Ícono y manifiesto para instalar la app en el teléfono
- [ ] Repetir la auditoría con Playwright y comparar contra la del 12 de octubre

Criterio de aceptación: la nueva auditoría da al menos B+ en móvil.

---

## Registro de publicaciones

| Fecha | Fase | Commit | Verificado |
| --- | --- | --- | --- |
| 2026-10-12 | Migración | `efdb032`, `da33def` | `/api/health` ok, login ok |

---

## Decisiones del 12 de octubre (cuestionario con el dueño)

- Usuarios: solo oficina, 2 a 3 personas, en computadora. Rol Despachador para quien despacha.
- Planes: se quedan en gratis (Vercel Hobby, Supabase gratis) por ahora. Riesgo aceptado: Supabase pausa el proyecto tras 7 días sin uso y no hay respaldos automáticos; Hobby no es para uso comercial.
- Prioridades siguientes: panel de control y avisos dentro de la página.
- Avisos: solo dentro de la página (sin correo ni WhatsApp). Falta definir cuáles (respondieron «otro» sin detalle).
- Panel: unidades libres y ocupadas. Falta confirmar si también viajes de hoy/semana, pendientes y actividad.
- Respaldo: botón de respaldo en la página para administradores.
- Nombre «Unidades» / «Tractores»: se deja como está por ahora.

## Fase 7: Seguridad y continuidad (antes de uso diario)

- [ ] Cambiar la contraseña `admin` por una de 12+ caracteres desde Usuarios
- [ ] Crear las cuentas de las 2 a 3 personas de oficina (rol Despachador)
- [x] Mantener despierta la base gratis: tarea diaria de Vercel (15:00 UTC) que llama a `/api/health`
- [x] Botón «Descargar respaldo completo» en Configuración (solo ADMIN): Excel con 10 hojas, sin contraseñas; probado en producción
- [ ] Probar el respaldo restaurándolo en una base local (solo se validó el contenido del archivo; falta Docker)
- [x] `AXL_SETUP_TOKEN` borrado de Vercel (12 oct)
- [x] `transporteraxl.vercel.app` quitado del proyecto
- [x] `HANDOVER.md` actualizado (producción en Vercel + Supabase)
- [ ] Decidir y registrar dominio propio (`axltransport.com`)

## Fase 8: Panel de control

- [ ] Nueva sección «Panel» como pantalla de inicio
- [ ] Unidades libres y ocupadas hoy (tractores y remolques con y sin viaje)
- [ ] (Por confirmar) Viajes de hoy y de la semana
- [ ] (Por confirmar) Pendientes por documento
- [ ] (Por confirmar) Actividad reciente

## Fase 9: Avisos dentro de la página

- [ ] Definir los avisos con el dueño
- [ ] Campana con contador en la barra superior
- [ ] Lista de pendientes en el panel
- [ ] Si incluye vencimientos: agregar fechas a tractores y remolques (migración aditiva)
