# AXL Transport Dispatch

Aplicación de despacho y organización de viajes para AXL Transport. Next.js 16, React, TypeScript, Tailwind CSS, PostgreSQL y Prisma. Los mensajes se construyen con plantillas en el backend y datos registrados; no utiliza IA para completar información.

## Funciones

- Despacho por comandos: `T15 4416`, `T-14 vacío`, `T-16 4069 Houston`, `T-17 R2`.
- Normalización, autocompletado, saludo America/Tijuana y copia del mensaje oficial.
- Consulta de unidad sola y selección explícita de placas mexicanas. Un dato indispensable faltante produce exactamente `No registrado.`.
- Catálogos de unidades, operadores, remolques y destinos, con activación/desactivación, alias y búsqueda universal.
- Roles ADMIN, DISPATCHER y READ_ONLY verificados en el servidor. Sesiones de 12 horas con cookies HttpOnly, Secure en producción, protección de origen y límite de intentos de acceso.
- Historial con copias de datos al momento del despacho y auditoría de modificaciones. No se incluyen contraseñas ni hashes en la API administrativa.
- Viajes por día: unidad, operador, remolque, origen, destino, cliente, referencia, estado y notas. Columnas iniciales pendientes de ajustar al ejemplo del usuario.
- Exportación CSV/Excel. Importación XLSX administrativa con plantilla, vista previa, detección de duplicados, confirmación explícita, respaldo anterior y operación transaccional. Un cambio concurrente exige volver a revisar el archivo. Máximo 500 filas / 2 MB.

## Datos iniciales

11 unidades (incluida VAT-05 con datos faltantes NULL), 21 remolques y la dirección de Houston proporcionados en la especificación. Las placas se conservan literalmente; no se añade CA. Los ejemplos conceptuales de alias no se cargan como registros confirmados. Ontario no está registrado. `db:seed` agrega registros iniciales que faltan sin reemplazar cambios administrativos.

## Desarrollo local / Codex cloud

Requisitos: Node.js 24, npm y Docker con Compose. Utiliza el checkout existente; cada tarea cloud ya está aislada y no necesita un worktree adicional.

```bash
npm ci --cache /workspace/.npm-cache
npm run db:generate
bash scripts/local-db.sh
npm run dev
```

`local-db.sh` crea `.env` con una contraseña local aleatoria si falta, inicia PostgreSQL, restaura `.local/database.sql` únicamente si el esquema está vacío, aplica migraciones y carga datos iniciales. No imprime la contraseña. El puerto PostgreSQL está ligado a loopback. El volumen de Docker conserva datos en esta máquina; el respaldo en `.local` permite restaurarlos al trasladar el checkout o publicar una instantánea cloud.

El archivo `.env`, `.local`, `node_modules` y `.next` están excluidos de Git. Nunca subas contraseñas ni respaldos de datos operativos al repositorio. No uses la base local para datos de producción.

### Primera cuenta administradora

No hay cuentas o contraseñas predeterminadas. Para un hosting sin terminal, configura un código aleatorio privado de al menos 32 caracteres en `AXL_SETUP_TOKEN`, abre `/setup` por HTTPS y elige nombre, correo y contraseña. No pongas ese código en una URL ni lo compartas en el chat. La activación se cierra cuando se crea la primera cuenta y no permite reemplazar usuarios existentes. Después elimina `AXL_SETUP_TOKEN` del hosting.

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

El código está preparado para desplegarse; todavía no se ha conectado un proveedor ni comprado un dominio. Opciones a evaluar según sus planes y condiciones vigentes:

- **Render + Neon**: hosting Next.js y PostgreSQL administrado con planes gratuitos. El servicio gratuito de Render puede suspenderse por inactividad y tardar en despertar. No garantiza disponibilidad continua.
- **Vercel + Neon o Supabase**: compatible con Next.js; verifica el plan permitido para uso comercial de AXL. No asumas que el plan Hobby sirve para una empresa.

Mantén la base PostgreSQL administrada independiente del disco temporal del hosting. Configura `DATABASE_URL` como secreto en el proveedor, utiliza su conexión con TLS verificado y respalda antes de cualquier actualización.

`render.yaml` incluye una plantilla de despliegue para Render que solicita `DATABASE_URL` sin almacenarla en Git. No ha sido aplicada.

Comando de construcción: `npm ci && npm run db:generate && npm run build`.

Para Render, crea PostgreSQL en la misma región del servicio (Oregon) y guarda la Internal Database URL en `DATABASE_URL` desde Environment. La base gratuita de Render tiene caducidad; úsala para la revisión inicial y planifica PostgreSQL sin caducidad y respaldos para la operación diaria. Nunca pegues la conexión ni el código privado de activación en el chat. Con la base conectada y `AXL_SETUP_TOKEN` configurado, `/setup` permite crear la primera cuenta sin requerir acceso a una terminal del hosting.

Antes del primer arranque, desde una terminal autorizada conectada a la base de producción: `npm run db:migrate`, `npm run db:seed` y `npm run admin:create` con contraseña por stdin. No ejecutes integración contra una base de producción.

Comando de inicio para un servicio Node: `npm run start -- --port "$PORT"` (el proveedor define PORT). En Vercel usa su integración Next.js. Programa respaldos diarios en el proveedor PostgreSQL o con un trabajo seguro externo; el respaldo local manual no es un respaldo automático de producción. Conserva copias fuera del proveedor y prueba la restauración.

### axltransport.com

Disponibilidad y precio pendientes de verificar en un registrador. Compra el dominio en tu propia cuenta; su renovación suele ser anual y es independiente del hosting. Añádelo como dominio personalizado en el proveedor elegido y configura exactamente los registros DNS que ese proveedor indique. Activa HTTPS antes de ofrecer acceso a otros usuarios. No se ha registrado, reservado ni publicado el dominio.

## Pendientes del usuario

- Nombre y correo de la cuenta ADMIN y configuración segura de su contraseña.
- Ejemplo de Excel para definir las columnas finales de viajes y archivos maestros adicionales para importación revisada.
- Hosting, PostgreSQL de producción, respaldos automáticos y registro/configuración de `axltransport.com`.
