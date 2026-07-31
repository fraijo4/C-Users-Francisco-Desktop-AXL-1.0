# AXL Transport — Schedule y Flota

Página web para llevar el schedule de viajes, el inventario de tractores y remolques, los
operadores y el directorio de clientes de AXL Transport. No necesita internet, servidor ni
instalación: son archivos que se abren en el navegador.

El inventario de AXL ya viene cargado (`datos-axl.js`): 11 tractores con su operador
asignado, 19 remolques entre cajas secas, refrigeradas y plataformas, y el directorio de
clientes capturado hasta ahora. Todo es editable desde la misma página.

## Cómo abrirla

**Opción rápida (una sola computadora):** abre `index.html` con doble clic. Funciona en
Chrome, Edge o Firefox.

**Opción para que la vean tus empleados:** publica esta carpeta en GitHub Pages
(Settings → Pages → Branch: la rama de este proyecto → carpeta `/root`). Te queda una
dirección de internet que cualquiera puede abrir desde su celular o computadora.

**Versión de un solo archivo:** `node build.mjs` genera `dist/axl.html`, que junta el HTML,
el CSS y el JavaScript en un archivo. Sirve para mandarlo por correo o subirlo a cualquier
lado sin llevar la carpeta completa.

## Los dos tipos de acceso

| | Administrador | Consulta |
|---|---|---|
| Ver schedule, inventario, conductores y disponibilidad | Sí | Sí |
| Exportar a CSV y descargar respaldos | Sí | Sí |
| Crear, editar y borrar cualquier cosa | Sí | No |

La **primera vez** que se abre la página, la contraseña que escribas queda guardada como
la del administrador. Después se cambia en *Datos y Ajustes → Contraseña de administrador*.
Quien solo va a consultar entra en la pestaña **Consulta**, sin contraseña.

> Aviso importante: esta contraseña evita que quien consulta modifique la información por
> accidente, pero no es seguridad de nivel bancario — todo corre en el navegador. No
> guardes aquí datos confidenciales (números de cuenta, documentos personales).

## Qué tiene cada pestaña

- **Panel** — viajes de hoy y mañana, unidades libres, ingreso de la semana y avisos
  automáticos: seguros, verificaciones y licencias por vencer (o vencidas), viajes sin
  unidad o sin conductor, y empalmes.
- **Schedule** — el calendario de viajes en tres vistas: **Semana**, **Mes** y **Lista**.
  Se navega con `‹ Hoy ›`. En la vista de semana, el administrador agrega un viaje con el
  botón *+ Agregar* del día. Se puede filtrar por unidad, conductor, estado o buscar texto,
  y exportar lo filtrado a CSV.
- **Inventario** — tractores y remolques en una sola lista, con filtro para ver solo unos u
  otros: número económico, categoría, tipo, placas de USA y de México, marca, modelo, año,
  VIN, capacidad, odómetro, ubicación, operador asignado, estado y fechas de seguro,
  verificación y servicio.
- **Conductores** — nombre, teléfono, licencia y su vigencia, examen médico, tractor
  asignado y base.
- **Clientes** — el directorio de entregas: nombre, dirección, ciudad, estado, contacto,
  teléfono y horario de recibo. Los clientes y sus ciudades aparecen como sugerencias al
  capturar el origen y el destino de un viaje, para no escribirlos completos cada vez.
- **Plantillas** — rutas que se repiten (por ejemplo: lunes, miércoles y viernes,
  Hermosillo → Nogales, 5:00 am). Con el botón **Generar** llenas el schedule de una semana
  o un mes completo de un jalón. Si un viaje ya fue generado antes, no se duplica.
- **Datos y Ajustes** — respaldos, nombre de la compañía, contraseña, catálogos y borrado.

## Cargar el inventario que ya tienes

1. En Excel, guarda tu archivo como **CSV** (*Archivo → Guardar como → CSV*).
2. Entra como administrador a **Inventario → Importar CSV**.
3. Si quieres, descarga primero la plantilla con los nombres de columna sugeridos.

La primera fila del archivo debe tener los títulos de las columnas. Los nombres se detectan
solos aunque no sean idénticos (`numero`, `número económico`, `unidad`, `unit`, `truck`…),
acepta separadores `,` `;` o tabulador, y entiende fechas `2026-08-15`, `15/08/2026` y
`8/15/2026`.

**Si vuelves a importar el mismo archivo, los registros no se duplican:** cuando el número
económico o la placa ya existen, la unidad se actualiza con los datos nuevos. Lo mismo con
los conductores, comparando por nombre.

## Dónde se guarda la información y cómo no perderla

Todo se guarda solo, dentro del navegador de la computadora donde trabajas
(almacenamiento local). No se envía a ningún lado.

Eso significa que **la información vive en esa computadora y ese navegador**. Si se
formatea el equipo o se borran los datos de navegación, se pierde. Para evitarlo:

- Entra a **Datos y Ajustes → Descargar respaldo (.json)** cada cierto tiempo.
- Ese mismo archivo se carga con **Restaurar respaldo** en otra computadora, y queda todo
  igual: viajes, unidades, conductores y plantillas.

Como cada navegador guarda lo suyo, si tus empleados abren la página en sus propios
equipos verán la página vacía hasta que les pases un respaldo. Para que todos vean el
mismo schedule en vivo hace falta una base de datos compartida — es el siguiente paso
natural si lo necesitas.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La estructura de la página |
| `styles.css` | Los estilos (incluye modo claro y oscuro con el botón 🌓) |
| `app.js` | Toda la lógica: schedule, inventario, plantillas, importación y respaldos |
| `datos-axl.js` | El inventario de AXL: tractores, remolques, operadores y clientes |
| `build.mjs` | Genera `dist/axl.html`, la versión de un solo archivo |

## Datos por confirmar

Al capturar el inventario quedaron tres cosas marcadas dentro de la misma página, en las
notas de cada registro:

- **VAT-05** — solo se tiene el VIN `1FUJA6CKX4LM61270` y el operador; faltan marca, año y
  placas.
- **AXL-4680** — la placa registrada (`4SG4675CA`) no coincide con el número de caja.
- **NPT San Marcos** — falta confirmar si es el de California o el de Texas.

El archivo histórico (tractores VAT01–VAT07, seguros, títulos, DMV, verificaciones, valores
de compra y estado de importación) todavía no está cargado: se puede meter como un módulo
de activos aparte para no mezclarlo con las unidades en operación.
