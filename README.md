# AXL Transport Dispatch

Aplicación de despacho y organización de viajes para AXL Transport. Next.js 16, React, TypeScript, Tailwind CSS, PostgreSQL y Prisma. Los mensajes se construyen con plantillas en el backend y datos registrados; no utiliza IA para completar información.

**Para continuar el trabajo en VS Code, empieza por [HANDOVER.md](HANDOVER.md).** Contiene el contexto, decisiones del usuario, arquitectura, estado del despliegue y siguientes pasos.

Página publicada: https://c-users-francisco-desktop-axl-1-0.onrender.com. Último commit funcional publicado: `d5595da` (tabla editable de viajes).

## Funciones

- Despacho por comandos: `T15 4416`, `T-14 vacío`, `T-16 4069 Houston`, `T-17 R2`.
- Normalización, autocompletado, saludo America/Tijuana y copia del mensaje oficial.
- Consulta de unidad sola y selección explícita de placas mexicanas. Un dato indispensable faltante produce exactamente `No registrado.`.
- Catálogos de unidades, operadores, remolques y destinos, con activación/desactivación, alias y búsqueda universal.
- Roles ADMIN, DISPATCHER y READ_ONLY verificados en el servidor. Sesiones de 12 horas con cookies HttpOnly, Secure en producción, protección de origen y límite de intentos de acceso.
- Historial con copias de datos al momento del despacho y auditoría de modificaciones. No se incluyen contraseñas ni hashes en la API administrativa.
- Viajes por día: cuadrícula editable organizada por mes, semanas de viernes a jueves y bloques diarios. Conserva las 12 columnas del Excel: Cliente, Operador, Origen, Destino, Stop, Tractor, Remolque, Facturas, Papeles, Previo, Cruzó y Entregado. Permite viajes por asignar, equipo externo, selección independiente de operador, notas y color manual de fila. Guardado por fila o de todos los cambios, control de ediciones concurrentes y exportación semanal CSV/XLSX. Stop y seguimiento son texto; no se deducen estados. Los Excel de enero a octubre se usaron solo como referencia; no se importó su historial ni la lista de importaciones pendientes.
- Exportación CSV/Excel. Importación XLSX administrativa con plantilla, vista previa, detección de duplicados, confirmación explícita, respaldo anterior y operación transaccional. Un cambio concurrente exige volver a revisar el archivo. Máximo 500 filas / 2 MB.

## Datos iniciales

El seed reproduce 11 unidades (incluida VAT-05 con datos faltantes NULL), sus operadores, 21 remolques y Houston, proporcionados en la especificación. Las placas se conservan literalmente; no se añade CA. `db:seed` agrega registros iniciales que faltan sin reemplazar cambios administrativos.

En producción se procesó además `DIRECCIONES ENRIQUE.xlsx`: 48 destinos nuevos y actualización de Houston, para un total de 49, verificado el 12 de octubre de 2026. Incluye NPT Ontario con el alias `Ontario`. Estos datos adicionales están en PostgreSQL y no se descargan con Git ni se cargan mediante el seed. Una base local nueva contiene solamente los destinos del seed hasta realizar una importación autorizada.

## Desarrollo local / Codex cloud

Requisitos: Node.js 24, npm y Docker con Compose. En Windows se recomienda abrir el proyecto en VS Code dentro de WSL2 y usar Docker Desktop con integración WSL; los scripts se verificaron en Linux. Utiliza el checkout existente; cada tarea cloud ya está aislada y no necesita un worktree adicional.

```bash
npm ci --include=dev
npm run db:generate
bash scripts/local-db.sh
npm run dev
```

`local-db.sh` crea `.env` con una contraseña local aleatoria si falta, inicia PostgreSQL, restaura `.local/database.sql` únicamente si el esquema está vacío, aplica migraciones y carga datos iniciales. No imprime la contraseña. El puerto PostgreSQL está ligado a loopback. El volumen de Docker conserva datos en esta máquina; el respaldo en `.local` permite restaurarlos al trasladar el checkout o publicar una instantánea cloud.

El archivo `.env`, `.local`, `node_modules` y `.next` están excluidos de Git. Nunca subas contraseñas ni respaldos de datos operativos al repositorio. No uses la base local para datos de producción.

### Primera cuenta administradora

No hay cuentas o contraseñas predeterminadas en el código. Producción ya tiene una cuenta ADMIN configurada por el usuario; no recrearla al preparar una copia local. Los siguientes pasos se aplican a una base nueva. Para un hosting sin terminal, configura un código aleatorio privado de al menos 32 caracteres en `AXL_SETUP_TOKEN`, abre `/setup` por HTTPS y elige nombre, correo y contraseña. No pongas ese código en una URL ni lo compartas en el chat. La activación se cierra cuando se crea la primera cuenta y no permite reemplazar usuarios existentes. Después elimina `AXL_SETUP_TOKEN` del hosting.

Alternativamente, ejecuta en una terminal privada, sustituyendo nombre y correo:

```bash
read -r -s -p 'Contraseña (mínimo 12 caracteres): ' axl_admin_password
printf '\n'
printf '%s\n' "$axl_admin_password" | npm run admin:create -- tu@empresa.com 'Tu nombre'
unset axl_admin_password
```

La contraseña se recibe por stdin, no por argumentos ni archivos de configuración. El comando solo permite la primera cuenta ADMIN activa. Después administra las cuentas desde Usuarios. Conserva el acceso a tu cuenta administrativa; un cambio de contraseña, rol o estado invalida sus sesiones.

### Respaldar y validar

```bash
bash scripts/backup-local.sh
npm test
npm run typecheck
npm run build
npm run test:integration
```

El respaldo local contiene datos completos, incluidos hashes de cuentas; se guarda con permisos restringidos y se reemplaza de forma atómica. Ejecuta un respaldo antes de publicar una instantánea cloud y después de cambios locales que necesites conservar. Los procesos y los volúmenes Docker externos no deben suponerse incluidos en la instantánea.

Las pruebas de integración crean y eliminan una base de datos separada y arrancan temporalmente el servidor en el puerto 3101; requieren una cuenta PostgreSQL con CREATEDB y Chromium (`CHROMIUM_PATH`, por defecto `/usr/bin/chromium`). Comprueban sesiones, permisos, despacho, historial, auditoría, importaciones y formularios en computadora y móvil. No cargan datos ficticios en la base principal.

### Migraciones

`npm run db:migrate` aplica el SQL versionado en `prisma/migrations` en una transacción con bloqueo y comprobación de hashes. Prisma 6.19 tiene una incompatibilidad al leer columnas NAME del catálogo PostgreSQL con su adaptador experimental de migraciones; por eso este proyecto aplica SQL mediante `pg`. El cliente usa el motor JavaScript y el adaptador PostgreSQL oficial, sin descargar motores binarios ni desactivar verificaciones.

Para generar una migración inicial o comparar dos esquemas usa `prisma migrate diff --from-schema-datamodel <anterior> --to-schema-datamodel prisma/schema.prisma --script --output <nueva-migracion>/migration.sql`. No uses `prisma migrate deploy/dev` con esta configuración; utiliza `npm run db:migrate`. No modifiques una migración ya aplicada.

## Publicación en Internet

La aplicación está desplegada en **Render**, servicio Node, rama `main`, región Oregon, salud `/api/health`. Dashboard: https://dashboard.render.com/web/srv-db2h7r17lnhs73eusgug. El despliegue automático está desactivado: después de un push, publicar manualmente el commit verificado. PostgreSQL está conectado mediante `DATABASE_URL` privada.

Alternativas de hosting, solo si se decide cambiar el despliegue actual:

- **Render + Neon**: hosting Next.js y PostgreSQL administrado con planes gratuitos. El servicio gratuito de Render puede suspenderse por inactividad y tardar en despertar. No garantiza disponibilidad continua.
- **Vercel + Neon o Supabase**: compatible con Next.js; verifica el plan permitido para uso comercial de AXL. No asumas que el plan Hobby sirve para una empresa.

Mantén la base PostgreSQL administrada independiente del disco temporal del hosting. Configura `DATABASE_URL` como secreto en el proveedor, utiliza su conexión con TLS verificado y respalda antes de cualquier actualización.

`render.yaml` refleja los comandos y requisitos del servicio Node actual y solicita `DATABASE_URL` sin almacenarla en Git. El servicio existente se configuró directamente; no crear uno nuevo solo para aplicar esta plantilla.

Comando de construcción: `npm ci --include=dev && npm run db:generate && npm run build`.

Para un despliegue nuevo en Render, conecta PostgreSQL en la misma región del servicio (Oregon) y guarda la Internal Database URL en `DATABASE_URL` desde Environment. No se ha confirmado el plan ni la fecha de caducidad de la base actual; verificar esas condiciones y planificar respaldos para la operación diaria. Nunca pegues la conexión ni el código privado de activación en el chat. En una base nueva, con `AXL_SETUP_TOKEN` configurado, `/setup` permite crear la primera cuenta sin terminal del hosting. En producción la cuenta ya existe y las variables temporales de activación/configuración se retiraron.

Antes del primer arranque, desde una terminal autorizada conectada a la base de producción: `npm run db:migrate`, `npm run db:seed` y `npm run admin:create` con contraseña por stdin. No ejecutes integración contra una base de producción.

Comando de inicio actual de Render: `npm run db:migrate && npm run db:seed && npx tsx scripts/configure-admin.ts && npm run start -- --port "$PORT"` (el proveedor define PORT). El script administrativo no modifica cuentas cuando sus variables temporales no están definidas. En Vercel usa su integración Next.js. Programa respaldos diarios en el proveedor PostgreSQL o con un trabajo seguro externo; el respaldo local manual no es un respaldo automático de producción. Conserva copias fuera del proveedor y prueba la restauración.

### axltransport.com

Disponibilidad y precio pendientes de verificar en un registrador. Compra el dominio en tu propia cuenta; su renovación suele ser anual y es independiente del hosting. Añádelo como dominio personalizado en el proveedor elegido y configura exactamente los registros DNS que ese proveedor indique. Activa HTTPS antes de ofrecer acceso a otros usuarios. No se ha registrado, reservado ni publicado el dominio.

## Siguientes pasos

- Revisar con el usuario el formato editable publicado y ajustar la captura diaria según sus indicaciones.
- Retomar importaciones pendientes únicamente cuando el usuario lo solicite; definir fechas, identidad del viaje y seguimiento antes de importar o automatizar.
- Recibir plantillas y reglas para documentos, y archivos maestros adicionales para importación revisada.
- Confirmar condiciones de PostgreSQL, configurar respaldos automáticos y registrar/configurar `axltransport.com`.
- Verificar acceso real a Dropbox si se retoma esa integración.

### Configuración de cuenta por el operador del hosting

El acceso admite usuario o correo electrónico. Para configurar una cuenta ADMIN desde el hosting, define temporalmente `AXL_ADMIN_LOGIN` y `AXL_ADMIN_PASSWORD_HASH` (formato scrypt del módulo `lib/password.ts`), y ejecuta `npx tsx scripts/configure-admin.ts` después de las migraciones. El script no tiene contraseña predeterminada, conserva las otras cuentas, registra la configuración sin hashes en auditoría y revoca sesiones previas del usuario actualizado. Retira ambas variables después de verificar el acceso; retira también `AXL_SETUP_TOKEN` cuando ya exista una cuenta. Los formularios normales mantienen el mínimo de 12 caracteres para contraseñas nuevas.

### Uso de la tabla de viajes

Abre **Viajes por día**, elige mes y semana y pulsa **Agregar viaje** en el día correspondiente. Edita directamente las celdas; las sugerencias de operadores y equipos no cambian automáticamente otras columnas. Pulsa **Guardar fila** o **Guardar cambios** para persistir los datos. Tab avanza entre celdas y Ctrl/Cmd + Enter guarda la fila. **Notas y detalles** permite cambiar el día, elegir un color, conservar referencias adicionales o retirar un viaje sin borrar su auditoría. Se avisa antes de salir con cambios sin guardar.

Las semanas pueden incluir días del mes anterior o siguiente. Sábado y domingo se muestran al activar la casilla o cuando ya tienen viajes. La exportación semanal incluye los siete días del intervalo. Usuarios de solo lectura consultan la cuadrícula sin controles de edición; administradores y despachadores pueden guardar viajes.
