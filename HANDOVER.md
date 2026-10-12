# AXL Transport — continuidad del trabajo en VS Code

Actualizado: 12 de octubre de 2026, zona horaria America/Tijuana.

Este documento permite continuar sin tener el historial del chat. Describe lo que está construido, las decisiones del usuario, el despliegue y los siguientes pasos. Los conteos de producción corresponden a la última comprobación del 12 de octubre; pueden cambiar cuando el usuario capture información.

## 1. Resumen y objetivo

Aplicación web interna de **AXL Transport Dispatch**, accesible por Internet y con una cuenta administradora del usuario. Tiene dos áreas principales:

1. **Despacho:** consultar catálogos mediante comandos cortos y generar el mensaje oficial listo para copiar.
2. **Viajes por día:** organizar la operación en una cuadrícula editable parecida a los Excel del usuario.

También hay catálogos, usuarios, permisos, auditoría, historial de despacho e importación/exportación de datos. A futuro, el usuario quiere ampliar la base de datos y solicitar documentos generados a partir de los datos guardados.

**Trabajo más reciente:** se publicó el formato editable de viajes. La siguiente actividad recomendada es revisarlo con el usuario y ajustar su uso diario. Las importaciones pendientes se pospusieron expresamente.

## 2. Repositorio y página publicada

| Elemento | Valor |
| --- | --- |
| Repositorio | https://github.com/fraijo4/C-Users-Francisco-Desktop-AXL-1.0 |
| Cuenta GitHub | `fraijo4` |
| Rama remota del producto | `main` |
| Nombre del paquete | `axl-transport-dispatch` |
| Página | https://c-users-francisco-desktop-axl-1-0.onrender.com |
| Login | https://c-users-francisco-desktop-axl-1-0.onrender.com/login |
| Dashboard de Render | https://dashboard.render.com/web/srv-db2h7r17lnhs73eusgug |
| Servicio Render | `srv-db2h7r17lnhs73eusgug` |
| Último commit funcional publicado | `d5595dacc10e64f3b45ed3ba9895c841b826e0c9` |
| Despliegue de ese commit | `dep-db6ilmavcj2c738319n0`, comprobado como `live` |

Este handover se añade después del último commit funcional, en un cambio de documentación. No confundir un commit posterior de documentación con una nueva versión del código desplegado.

La cuenta administradora de producción tiene usuario **`admin`**. Su contraseña, tokens, sesiones y conexiones **no se incluyen en este documento**. El usuario conserva su acceso; no recrear ni restablecer esa cuenta para preparar una copia local.

El dominio solicitado, **axltransport.com**, sigue pendiente de verificar, registrar y conectar. No está confirmado como disponible, comprado ni configurado. La URL operativa es la de Render.

## 3. Decisiones explícitas del usuario

- El usuario es administrador y quiere una página que guarde la información entre sesiones y pueda usar con otras personas autorizadas.
- Entregó una especificación maestra de despacho. La regla fundamental es **nunca inventar información**.
- Se importaron las direcciones de `DIRECCIONES ENRIQUE.xlsx` a la página.
- Los diez Excel de viajes, de enero a octubre de 2026, se deben usar **solamente como referencia del formato**. El usuario confirmó que no quiere importar ese historial en esta etapa.
- Los viajes repetidos al principio de algunos Excel representan **importaciones pendientes**. Su seguimiento se retomará más adelante; no deduplicarlos, importarlos ni construir ese módulo automáticamente ahora.
- Por el momento requiere el formato diario editable parecido a sus ejemplos.
- Quiere posteriormente más datos y generación de documentos. Todavía faltan las plantillas y las reglas concretas de esos documentos.
- El usuario prefiere que se avance con el trabajo ya autorizado y que las preguntas se reserven para decisiones que afectan el resultado. Para las nuevas reglas de documentos o pendientes, sí se necesitan aclaraciones antes de implementarlas.

## 4. Lo implementado

### Despacho y catálogos

- Comandos como `T15`, `T15 4416`, `T-14 vacío`, `T-16 4069 Houston` y `T-17 R2`.
- Parser y formateador deterministas en el backend; no se usa IA generativa para completar información.
- Autocompletado, búsqueda de unidades/operadores/placas/destinos y copia del mensaje.
- Catálogos de tractores, remolques, operadores y destinos con alias y activación/desactivación.
- Configuración del saludo, compañía, CAAT y SCAC.
- Historial con snapshots: editar un catálogo no cambia un mensaje histórico ya generado.
- Auditoría de cambios, importación XLSX con vista previa y confirmación transaccional, respaldo anterior y control de cambios concurrentes.
- Exportación CSV/XLSX. La importación de catálogos admite un máximo de 500 filas, 30 columnas y 2 MB, y rechaza fórmulas/celdas complejas.

### Usuarios y permisos

- `ADMIN`: administra catálogos, usuarios, configuración, historial/auditoría e importaciones/exportaciones; también edita viajes.
- `DISPATCHER`: genera despachos y edita viajes; no modifica catálogos maestros ni usuarios.
- `READ_ONLY`: consulta los catálogos y viajes; no genera despachos ni guarda cambios.
- Autenticación propia con scrypt y salt aleatorio; no se implementó Auth.js.
- Sesiones de 12 horas, token aleatorio almacenado como hash, cookie HttpOnly, SameSite Lax y Secure en producción.
- Verificación del origen de las escrituras, límite de 10 intentos de login por cuenta cada 15 minutos y revocación de sesiones al cambiar credenciales/rol/estado.
- El campo de base de datos `User.email` almacena el identificador de acceso, que puede ser usuario o correo. No renombrarlo sin una migración y revisión de compatibilidad.
- `/setup` permite crear la primera cuenta únicamente con un código privado configurado y si no existe ningún usuario. En producción ya está cerrado por la existencia de la cuenta.

### Viajes por día: última entrega

El componente es `components/TripsBoard.tsx`, integrado desde `components/Dashboard.tsx`.

| Columna del Excel | Campo de Trip |
| --- | --- |
| Cliente | `client` |
| Operador | `driverName` |
| Origen | `origin` |
| Destino | `destination` |
| Stop | `stop` |
| Tractor | `tractorNumber` |
| Remolque | `trailerNumber` |
| Facturas | `invoices` |
| Papeles | `paperwork` |
| Previo | `customsPreview` |
| Cruzó | `crossed` |
| Entregado | `delivered` |

- Selector de mes y semana. La semana va de **viernes a jueves**, conservando la organización de los ejemplos.
- Bloques por día y edición directa de celdas; Tab avanza y Ctrl/Cmd + Enter guarda la fila.
- Guardado por fila o de todos los cambios, indicadores de guardado, filtro semanal y recarga.
- Permite viajes aún sin asignar. La fecha y al menos un dato del viaje son necesarios para guardar; una fila completamente vacía se rechaza.
- Operador, tractor y remolque se capturan independientemente, con sugerencias del catálogo. Elegir tractor no cambia automáticamente al operador.
- Admite remolques externos y datos manuales de operación; capturarlos no crea registros en los catálogos ni habilita esos datos para despacho.
- **Stop y las cuatro columnas de seguimiento son texto**, no casillas booleanas ni estados inferidos. Los ejemplos contienen lugares, fechas, números y notas: su significado no se ha definido.
- Colores manuales: sin color, amarillo, verde, rojo y azul; no asignarles automáticamente significado operativo.
- Notas, referencia adicional y estado general en **Notas y detalles**. Los campos anteriores se conservaron para compatibilidad.
- Cambiar el día y retirar un viaje están en el mismo panel de detalles. Retirar usa `active=false`; conserva la auditoría.
- Control de edición concurrente con `expectedUpdatedAt`: una versión antigua produce HTTP 409 y no sobrescribe otra edición. La comprobación se aplica cuando el cliente envía esa versión.
- Aviso antes de salir/recargar con cambios sin guardar. Los cambios sin guardar son estado del navegador, no un respaldo persistente.
- Sábado y domingo aparecen al activar la casilla, o si ya tienen viajes. Las semanas pueden cruzar límites de mes; el primer intervalo parcial también se cuenta en el selector.
- Exportación de la semana en XLSX con bloques diarios y las 12 columnas, colores y notas como comentarios. Incluye siete días. CSV incluye fecha, las 12 columnas, notas, referencia adicional y estado general. No asumir que XLSX incluye esos dos últimos campos generales: la referencia se conserva en el comentario y el estado general no se exporta allí.
- En móvil la tabla se desplaza horizontalmente y conserva Cliente visible. Se probaron captura, guardado y ausencia de desbordamiento de la página.

La migración aditiva es `prisma/migrations/20261012000100_trip_board/migration.sql`: agrega Stop, Facturas, las cuatro marcas y el color; no elimina registros ni columnas anteriores.

## 5. Reglas del mensaje de despacho que deben conservarse

- Compañía por defecto: **AXL Transport**; CAAT **43E8**; SCAC **AJXT**.
- Zona horaria: **America/Tijuana**. Buenos días antes de las 12:00; buenas tardes desde las 12:00.
- Cuando falta información indispensable, el texto de salida debe ser exactamente **`No registrado.`**, sin explicaciones añadidas al mensaje.
- Las placas se conservan literalmente. No agregar `CA` ni corregir una placa por apariencia. El remolque AXL-4680 tiene intencionalmente la placa proporcionada `4SG4675CA`.
- La salida normal no muestra VIN, marca ni año; estos datos permanecen en los catálogos.
- Con unidad sola, no agregar remolque. Con `vacío`, `vacio` o `empty`, no agregar datos de remolque y mostrar Estado: Vacío.
- Las placas de Estados Unidos son el estándar; México se selecciona explícitamente y no se sustituye por una placa USA si falta la mexicana.
- Los destinos se resuelven mediante coincidencia exacta de nombre o alias, ignorando mayúsculas y normalizando espacios. No usar coincidencias aproximadas que elijan una dirección equivocada.
- La dirección va después de SCAC y conserva el formato multilínea guardado.
- `R2` es el identificador soportado por el parser de despacho. La captura libre de viajes puede contener otros textos, pero eso no modifica el parser ni sus catálogos.

Para entender el formato completo, leer `lib/dispatch.ts` y `tests/dispatch.test.ts`; son la referencia ejecutable.

## 6. Datos y archivos: qué está en Git y qué está en PostgreSQL

Última comprobación de producción después de publicar la tabla:

| Registros | Conteo |
| --- | ---: |
| Tractores | 11 |
| Operadores | 11 |
| Remolques | 21 |
| Destinos | 49 |
| Usuarios | 1 |
| Configuración global | 1 |
| Viajes | 0 |

Los cero viajes eran el estado al verificar la entrega: se publicaron las funciones, sin cargar filas de los Excel. Las pruebas usaron bases temporales y sus registros se eliminaron al terminar.

`data/master.json` y `prisma/seed.ts` reproducen los datos iniciales: unidades, operadores, remolques y **Houston solamente**. La unidad VAT-05 conserva los campos faltantes como NULL. El seed no reemplaza los registros existentes.

**Un clone de Git no reproduce los 49 destinos de producción.** Del archivo `DIRECCIONES ENRIQUE.xlsx` se procesaron 49 direcciones: 48 nuevas y actualización de Houston, conservando su ID. Se guardaron alias de rutas explícitas y `Ontario` para la sucursal NPT de Ontario. Las variantes escritas para Nimbus se conservaron en notas; no se corrigieron silenciosamente. La importación confirmada conservó un respaldo previo en `ImportBatch`.

Las direcciones adicionales están en PostgreSQL, no en el seed. Para llevarlas a desarrollo, usar una exportación autorizada de Destinos y el flujo de importación con revisión, o un respaldo autorizado. No copiar `.env` de producción.

Archivos recibidos para referencia de viajes:

`1 ENERO 2026.xlsx`, `2 FEBRERO 2026.xlsx`, `3 MARZO 2026.xlsx`, `4 ABRIL 2026.xlsx`, `5 MAYO 2026.xlsx`, `6 JUNIO 2026.xlsx`, `7 JULIO 2026.xlsx`, `8 AGOSTO 2026.xlsx`, `9 SEPTIEMBRE 2026.xlsx`, `10 OCTUBRE 2026.xlsx`.

Se revisaron 50 hojas: 49 semanales y una de inspecciones anuales. No se encontraron fórmulas de celda; sí 24 comentarios, filas sin asignación, equipos externos, bloques CARGAS/CAJAS TODCO y datos complementarios. Marzo tiene encabezados que dicen febrero y mayo mezcla orden día/mes y mes/día. Si el usuario pide importar historia después, aclarar las fechas y los pendientes antes de hacerlo.

Los Excel originales, análisis, screenshots y respaldos auxiliares se guardaron fuera del repositorio en el entorno cloud. **No asumir que existen en la computadora de VS Code ni que se descargan con Git.** Los screenshots de integración muestran datos de prueba. Un ZIP antiguo preparado antes de las últimas entregas no es la versión vigente del proyecto.

## 7. Arquitectura y mapa de archivos

Stack: Node.js 24, Next.js 16.3.8, React 19.2.7, TypeScript, Tailwind CSS 4, PostgreSQL, Prisma 6.19.3, adaptador PostgreSQL, Zod y ExcelJS. `package-lock.json` fija las dependencias instaladas; usar `npm ci`.

| Archivo | Responsabilidad |
| --- | --- |
| `AGENTS.md` | Instrucciones para agentes; leer antes de editar |
| `app/page.tsx`, `app/login/page.tsx`, `app/setup/page.tsx` | Entrada autenticada, login y primera activación |
| `components/Dashboard.tsx` | Navegación, despacho y catálogos |
| `components/TripsBoard.tsx` | Tabla semanal editable |
| `app/globals.css` | Diseño y comportamiento responsive |
| `app/api/[...path]/route.ts` | API, autenticación, permisos, importación/exportación y salud |
| `lib/dispatch.ts` | Parser y mensaje oficial |
| `lib/trip-calendar.ts` | Columnas y calendario de semanas |
| `lib/trip-sheet.ts` | Exportación de viajes |
| `lib/validation.ts`, `lib/records.ts` | Validación, persistencia, auditoría y control de concurrencia |
| `lib/spreadsheet.ts` | Importación/exportación general y protección frente a fórmulas |
| `lib/auth.ts`, `lib/password.ts`, `lib/setup.ts` | Sesiones, hashes y activación |
| `lib/configure-admin.ts`, `scripts/configure-admin.ts` | Configuración administrativa temporal desde el hosting |
| `lib/database.ts`, `prisma.config.ts`, `prisma/schema.prisma` | Cliente y configuración de base de datos |
| `prisma/migrations/`, `scripts/migrate.ts` | SQL versionado y aplicación transaccional |
| `prisma/seed.ts`, `data/master.json` | Datos iniciales sin reemplazo |
| `compose.yaml`, `scripts/local-db.sh` | PostgreSQL local y restauración inicial |
| `scripts/backup-local.sh`, `scripts/test-backup.ts` | Respaldo local y comprobación de restauración |
| `tests/` | Pruebas de lógica, seguridad, exportación y flujo completo |
| `render.yaml` | Plantilla de configuración del servicio web |

Los modelos incluyen User, Session, LoginAttempt, Driver, Tractor, Trailer, Destination, DestinationAlias, Settings, DispatchHistory, AuditLog, Trip e ImportBatch.

## 8. Preparar VS Code y ejecutar localmente

1. Iniciar sesión en GitHub desde VS Code y abrir/clonar el repositorio.
2. Leer `AGENTS.md`, este documento y `README.md`. Next.js exige consultar las guías de la versión instalada en `node_modules/next/dist/docs/` antes de cambiar código relevante.
3. Tener Node.js 24, npm y Docker con Compose. En Windows se recomienda **WSL2 + Docker Desktop con integración WSL**, y abrir la carpeta desde VS Code en WSL: los scripts y la integración se verificaron en Linux, no en Windows nativo.
4. Si ya hay una copia local, revisar `git status` antes de actualizar. En una rama `main` limpia, usar `git pull --ff-only origin main`. Conservar los cambios locales del usuario.

Desde la raíz del repositorio, en Bash:

```bash
npm ci --include=dev
npm run db:generate
bash scripts/local-db.sh
npm run dev
```

`local-db.sh` crea `.env` local con contraseña aleatoria si no existe, arranca PostgreSQL 17 en Docker, restaura `.local/database.sql` solo si el esquema está vacío, migra y carga los datos iniciales. Comprobar que cualquier `.env` preexistente apunte a una base de desarrollo antes de ejecutarlo. No usar aquí DATABASE_URL de producción.

Crear una cuenta **local** mediante `npm run admin:create` siguiendo README, o `/setup` con un código privado local. La cuenta y contraseña de producción no se transfieren al clonar Git.

La base Docker usa el usuario/base `axl`, volumen `axl_db` y puerto 5432 ligado a loopback. El volumen conserva datos locales, pero no debe suponerse trasladado por Git ni por una instantánea cloud. Los procesos requieren reinicio después de restaurar un entorno.

`GET /api/health` debe devolver `{"status":"ok"}`; `/login` debe responder y `/api/catalog` sin sesión debe devolver 401. El servidor de desarrollo usa el puerto 3000 por defecto. En Codex cloud las comprobaciones locales son internas; la página para compartir sigue siendo la de Render.

## 9. Pruebas y migraciones

Comandos de verificación disponibles:

```bash
npm test
npm run typecheck
npm run build
npm run test:integration
```

Último resultado funcional: **20 pruebas de lógica aprobadas, build con TypeScript aprobado y 82 verificaciones de integración aprobadas**. Incluyeron despacho, roles, sesiones, importaciones, Excel semanal, ediciones concurrentes, guardado por fila y conjunto, cambios sin guardar, recarga y captura en móvil.

La integración requiere PostgreSQL de desarrollo con permiso CREATEDB, un build vigente y Chromium. Usa `CHROMIUM_PATH` si su ejecutable no está en `/usr/bin/chromium`. Crea y elimina una base `axl_test_*` y un servidor temporal en 3101. No ejecutar integración con una conexión de producción.

Prisma usa `engineType="client"` y `@prisma/adapter-pg`; no requiere descargar motores nativos. Existe una incompatibilidad del adaptador experimental de migraciones de Prisma 6.19 con columnas NAME del catálogo PostgreSQL. Por eso:

- Aplicar cambios con **`npm run db:migrate`**, no `prisma migrate dev/deploy`.
- El runner ejecuta SQL dentro de una transacción, con bloqueo advisory y ledger `_axl_migrations` que verifica SHA-256.
- No editar una migración ya aplicada. Crear una carpeta nueva con SQL revisable.
- Se puede generar el SQL con `prisma migrate diff --from-schema-datamodel <esquema-anterior> --to-schema-datamodel prisma/schema.prisma --script --output <nueva-carpeta>/migration.sql`.
- Con la configuración actual, encender PostgreSQL local antes de `migrate diff`; una base detenida provocó `External error id#0` y se resolvió arrancándola.
- Regenerar el cliente después de cambiar el esquema. Probar la migración con datos existentes y respaldar antes de producción.
- No desactivar TLS, comprobaciones de integridad ni pruebas para eludir un error.

Migraciones actuales: `20261005233000_initial` y `20261012000100_trip_board`.

## 10. Despliegue actual y credenciales

Render: servicio web **Node**, rama `main`, raíz del repositorio, región Oregon, plan web free. El despliegue automático está desactivado: **push a GitHub no publica por sí solo**.

Build:

```bash
npm ci --include=dev && npm run db:generate && npm run build
```

Inicio:

```bash
npm run db:migrate && npm run db:seed && npx tsx scripts/configure-admin.ts && npm run start -- --port "$PORT"
```

Salud: `/api/health`. Configuración estable: `NODE_VERSION=24`, `NODE_ENV=production` y `DATABASE_URL` privada, correspondiente a la base administrada conectada al servicio.

Se usaron temporalmente `AXL_SETUP_TOKEN`, `AXL_ADMIN_LOGIN` y `AXL_ADMIN_PASSWORD_HASH`; **se retiraron** después de crear/verificar la cuenta. No restaurarlas como valores predeterminados. El script de configuración no hace cambios si las dos variables administrativas no están definidas.

En el entorno cloud se dispuso de una vinculación privada `RENDER_API_KEY` para peticiones HTTPS a `api.render.com`. No asumir que esa vinculación existe en VS Code ni copiar valores de un proxy/entorno. El acceso Git del entorno cloud fue mediante su autenticación HTTPS proporcionada; no requiere guardar un token en el repo.

Para publicar un cambio: revisar diff, ejecutar las verificaciones apropiadas, commit y push a `main`, lanzar un despliegue manual del commit desde Render y comprobar estado `live`, salud y comportamiento relevante. Registrar el commit publicado. Conservar variables y datos existentes.

El error original de Render era `cargo build --release` / falta de `Cargo.toml`: **ya se corrigió** configurando Node. No volver a seleccionar Rust.

La última publicación conservó los registros anteriores y sirvió los archivos de la nueva tabla; se verificaron salud HTTP pública y exportaciones CSV/XLSX. Los navegadores de las pruebas locales pasaron. Un intento de Chromium hacia la URL pública desde cloud encontró `ERR_CERT_AUTHORITY_INVALID` con el proxy; no se desactivó TLS. Esto no fue un fallo de las pruebas locales ni una respuesta de error de la aplicación.

## 11. Respaldo, datos privados y límites actuales

- `.env`, `.local`, `node_modules`, `.next`, salidas de pruebas y archivos de credenciales están excluidos de Git. Revisar qué se va a subir antes de cada commit.
- `bash scripts/backup-local.sh` genera `.local/database.sql` con permisos restringidos. La restauración local se probó; este respaldo **no equivale a un respaldo automático de producción**.
- Antes de la tabla se hizo una copia privada de registros de producción para comparación. No tratar esa copia parcial como un dump completo recuperable de todas las tablas.
- No se configuraron respaldos diarios automáticos de producción ni se confirmó la retención/fecha de caducidad del plan PostgreSQL actual. Verificarlo en la cuenta del usuario antes de planificar operación continua. El servicio web gratuito puede dormir por inactividad.
- No hay cuentas ni contraseñas predeterminadas en el código. Pedir cualquier secreto por un mecanismo privado autorizado, nunca pegarlo en commits, documentos o logs.
- No hay integración de Dropbox dentro de AXL. El usuario intentó conectar Dropbox al chat, pero no se confirmó acceso activo a sus carpetas. No afirmar que se pueden abrir archivos allí sin verificar las herramientas/conexión del nuevo entorno.
- VS Code es el editor local; Render aloja la página y PostgreSQL conserva los datos. Conectar GitHub en VS Code no conecta automáticamente Dropbox, Render o la base de producción.

## 12. Ruta de continuidad propuesta: pasos A, B y C

**Paso A — recuperar el contexto.** Sincronizar la copia de GitHub, leer documentos y AGENTS, comprobar la base local y ejecutar la aplicación. No reiniciar el proyecto desde cero ni crear un worktree adicional por defecto en Codex cloud.

**Paso B — revisar la entrega actual con el usuario.** Abrir Viajes por día y pedir ajustes concretos de ancho, orden, navegación, colores, captura o guardado. Usar un entorno local para pruebas y ejemplos. Mantener las 12 columnas y la posibilidad de viajes por asignar.

**Paso C — siguiente trabajo de producto, según lo que indique el usuario.** Implementar los ajustes concretos al formato actual, probarlos y publicar el commit verificado. Si todavía no ha pedido un ajuste nuevo, presentar el estado y esperar su indicación; no empezar automáticamente importaciones pendientes, importación histórica ni documentos.

Después, cuando el usuario retome esos temas:

1. **Importaciones pendientes:** definir qué fecha representa cada campo, identificador estable de viaje, cambios de operador/equipo, cuándo sale de pendientes y cómo relacionarlo con el viaje diario. No sumar copias mensuales como viajes nuevos.
2. **Base de datos ampliada y documentos:** recibir archivos reales y plantillas; definir el primer documento, campos necesarios, formatos PDF/Word/Excel, numeración, firmas/logos y permisos. Las exportaciones actuales no son todavía un generador de todos los documentos solicitados.
3. **Operación y dominio:** confirmar el plan de PostgreSQL, respaldos automáticos y restauración; consultar y registrar axltransport.com en la cuenta del usuario y configurar DNS/HTTPS cuando corresponda.
4. **Dropbox:** verificar conexión real y alcance autorizado antes de consultar carpetas o diseñar una importación. Un enlace privado no acredita acceso por sí solo.

## 13. Texto para pegar al chat de VS Code

> Estamos continuando AXL Transport Dispatch, no iniciándolo desde cero. Lee HANDOVER.md, README.md y AGENTS.md. El repositorio es fraijo4/C-Users-Francisco-Desktop-AXL-1.0, rama main, y está publicado en Render. El último cambio funcional publicado es d5595da: tabla semanal editable de viajes con las 12 columnas de nuestros Excel. Los Excel de enero a octubre fueron solo referencia; no se importó su historial. Las importaciones pendientes se pospusieron. Mantén el despacho determinista y la respuesta exacta «No registrado.» cuando falten datos. Prepara la copia local, conserva mis cambios y datos, y continúa desde la revisión del formato actual y el Paso C de este handover. Antes de cambiar una regla de negocio que no esté definida, consúltamela. No pongas contraseñas ni conexiones privadas en Git. Los futuros ajustes deben probarse, committearse y publicarse manualmente en Render cuando estén autorizados.
