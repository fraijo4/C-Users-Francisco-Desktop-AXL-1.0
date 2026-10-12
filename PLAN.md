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
- [ ] Corregir los alias de destinos: hoy hay 9 filas con texto JSON; deben quedar los 18 alias reales con sus IDs originales *(requiere autorización)*
- [ ] Probar un despacho con alias, por ejemplo `T15 4416 Ontario`, en base local
- [ ] Borrar el despacho de prueba `T15 4416 Houston` del Historial *(requiere autorización)*
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

- [ ] Campos (`input`, `select`, `textarea`) a 16 px en móvil, para evitar el zoom de iPhone
- [ ] Botones y pestañas con al menos 44 px de alto en móvil
- [ ] Etiquetas pequeñas: de 10–11 px a 12–13 px (`th`, `.badge`, `small`, `.eyebrow`)
- [ ] Quitar la banda verde vacía del encabezado en Destinos, Usuarios y Configuración
- [ ] Barra lateral de escritorio de altura completa en páginas largas
- [ ] Despacho: al tocar «Generar despacho», desplazar la página hasta el mensaje
- [ ] Despacho: «Copiar mensaje» muestra «Copiado» al tocarlo

Criterio de aceptación: en 390 px, ningún campo menor a 16 px ni botón menor a 44 px; tras generar, el mensaje queda en pantalla sin desplazarse a mano.

---

## Fase 2: Navegación inferior

Objetivo: que todas las secciones se encuentren con el pulgar. Esfuerzo medio.

Archivos: `components/Dashboard.tsx`, `app/globals.css`

- [ ] Debajo de 760 px, ocultar el menú horizontal actual
- [ ] Barra inferior fija con 4 entradas: Despacho, Viajes, Catálogos, Más
- [ ] «Catálogos» abre la lista: Unidades, Remolques, Operadores, Destinos
- [ ] «Más» abre la lista: Historial, Auditoría, Usuarios, Configuración, Cerrar sesión
- [ ] Ocultar en «Más» lo que el rol no puede usar (por ejemplo Usuarios para `DISPATCHER`)
- [ ] Respetar el área segura del iPhone (`env(safe-area-inset-bottom)`)
- [ ] Búsqueda global como ícono que se expande en móvil
- [ ] Escritorio sin cambios

Criterio de aceptación: las 10 secciones se alcanzan en dos toques como máximo, sin deslizar el menú.

---

## Fase 3: Despacho pensado para el teléfono

Objetivo: generar y copiar un despacho sin desplazarse. Esfuerzo bajo.

Archivos: `components/Dashboard.tsx`, `app/globals.css`

- [ ] En móvil, el formulario va primero; las 4 tarjetas de cifras pasan a una línea compacta
- [ ] Ejemplos de comando y selector de placas en una fila de chips
- [ ] Botón «Copiar mensaje» fijo abajo mientras haya mensaje
- [ ] Quitar la etiqueta «Consulta directa»

Criterio de aceptación: en 390 px, del comando a «Copiado» sin desplazarse.

---

## Fase 4: Tablas como tarjetas y editor en hoja inferior

Objetivo: que Editar siempre esté a la vista. Esfuerzo medio.

Archivos: `components/Dashboard.tsx`, `app/globals.css`

- [ ] Debajo de 720 px, cada registro se ve como tarjeta: dato principal, 2 datos secundarios y Editar
  - [ ] Unidades: número · marca y año / operador · placa
  - [ ] Remolques: número · tipo / placa
  - [ ] Operadores: nombre / estado
  - [ ] Destinos: nombre / primera línea de la dirección / alias como etiquetas
  - [ ] Usuarios, Historial y Auditoría
- [ ] Destinos en escritorio: columna Dirección más ancha y alias como etiquetas
- [ ] Editor en móvil: hoja de pantalla completa con Guardar y Cancelar fijos abajo
- [ ] Agrupar Exportar CSV, Exportar Excel, Plantilla e Importar en un botón «Importar / Exportar»
- [ ] Selector de archivo propio en español (en vez de «Choose File»)

Criterio de aceptación: Destinos en móvil mide menos de 5,000 px de alto; Editar visible en cada tarjeta sin desplazamiento lateral.

---

## Fase 5: Viajes por día en el teléfono

Objetivo: capturar y revisar viajes desde el teléfono. Esfuerzo alto.

Archivos: `components/TripsBoard.tsx`, `lib/trip-calendar.ts` (solo lectura), `app/globals.css`

Antes de empezar
- [ ] Definir con ustedes qué 4 campos se ven primero en la tarjeta (propuesta: Cliente, Operador, Tractor/Remolque, Destino)

Tareas
- [ ] Debajo de 760 px, cada viaje como tarjeta dentro de su día; la cuadrícula de 12 columnas queda para escritorio
- [ ] Tocar la tarjeta abre la hoja inferior con los 12 campos, color y notas
- [ ] «Guardar cambios» dice cuántos hay pendientes («Guardar 3 cambios») en lugar de quedar gris
- [ ] Selector de mes propio en español (en vez de «October 2026»)
- [ ] Conservar sin cambios: `expectedUpdatedAt` (aviso 409), aviso al salir con cambios, exportación XLSX/CSV
- [ ] Prueba en base local: crear, editar, cambiar de día y retirar un viaje desde 390 px

Criterio de aceptación: un viaje se captura completo en el teléfono sin desplazamiento lateral; `npm run test:integration` en verde en local.

---

## Fase 6: Claridad y acabados

Objetivo: que un usuario nuevo entienda la app sin explicación. Esfuerzo bajo.

- [ ] Decidir el nombre: «Tractores» o «Unidades», y usarlo igual en menú, tablas, tarjetas y ayuda *(decisión de ustedes)*
- [ ] Quitar la línea «AXL TRANSPORT DISPATCH» repetida arriba de cada título
- [ ] Indicador de carga con forma de la página en vez de «Cargando…»
- [ ] Estados vacíos con acción («No hay viajes · Agregar viaje»)
- [ ] Ícono y manifiesto para instalar la app en la pantalla de inicio del teléfono
- [ ] Repetir la auditoría con Playwright y comparar contra la del 12 de octubre

Criterio de aceptación: la nueva auditoría da al menos B+ en móvil.

---

## Registro de publicaciones

| Fecha | Fase | Commit | Verificado |
| --- | --- | --- | --- |
| 2026-10-12 | Migración | `efdb032`, `da33def` | `/api/health` ok, login ok |
