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

## Usuarios y accesos

Cada persona entra con **su propio usuario y contraseña**. Hay dos permisos:

- **Puede editar** — captura y modifica todo: viajes, casillas de avance, inventario,
  operadores, clientes, plantillas y ajustes.
- **Solo consulta** — ve la página completa (schedule, inventario, disponibilidad,
  directorio) pero no puede cambiar absolutamente nada, ni marcar casillas.

Vienen cinco cuentas creadas de fábrica: dos que editan y tres de consulta. **Cámbiales la
contraseña en cuanto entres** — se hace en *Datos y Ajustes → Usuarios → Cambiar clave*.
Desde ahí también se dan de alta más personas, se les cambia el permiso o se les quita el acceso.

Las contraseñas se guardan **cifradas**: nadie, ni tú, puede volver a verlas. Si a alguien se
le olvida la suya, quien tiene permiso de editar le pone una nueva.

> Aviso: esto separa lo que cada quien puede hacer y evita cambios accidentales, pero no es
> seguridad de nivel bancario — todo corre en el navegador. No guardes aquí información
> confidencial.

## Qué tiene cada pestaña

- **Panel** — viajes de hoy y mañana, unidades libres, ingreso de la semana y avisos
  automáticos: seguros, verificaciones y licencias por vencer (o vencidas) y viajes sin
  unidad o sin operador asignado. Incluye el contador de **pendientes de días pasados**.
- **Schedule** — cuatro vistas: **Hoja diaria** (la que sale al entrar), **Semana**, **Mes** y **Lista**.

  La **hoja diaria** es el mismo formato de siempre: un bloque por día con el encabezado
  *Lunes 07/27/2026* y la tabla con Cliente, Operador, Origen, Destino, Stop, Tractor,
  Remolque, Facturas y las cuatro casillas de avance: **Papeles · Previo · Cruzó · Entregado**.

  - Las casillas se pican y se guardan solas, y queda registrado **quién las marcó y qué
    día** (se ve al pasar el cursor encima y en el detalle del viaje).
  - Al marcar **Entregado**, el viaje se da por terminado: sale de los renglones en curso y
    baja a una sección plegable **✓ Completados** de ese día. Si lo desmarcas, regresa arriba.
  - Hasta arriba aparece **Pendientes de días anteriores**: todo lo que salió antes de la
    semana que estás viendo y sigue sin entregarse, con los días que lleva arrastrando.
    Ahí viven los viajes largos (Marion, Houston) que cruzan de una semana a otra.
  - Quien puede editar lo hace **sobre la tabla**: clic en cualquier celda de texto y
    escribes (Enter guarda, Escape cancela); operador, tractor y remolque son listas.
  - Quien es de consulta ve la hoja igual, pero sin poder tocarla.

  No hay columna de hora: dentro de cada día los viajes van en el orden en que se capturaron,
  y una misma unidad puede dar dos vueltas el mismo día sin que la página lo tome por error.

  Se navega con `‹ Hoy ›`. Se puede filtrar por unidad, conductor, estado o buscar texto,
  y exportar lo filtrado a CSV. Cada viaje se pinta con el **color de su cliente** y trae un
  punto con el **color del operador**; arriba aparece la leyenda de los colores de la semana.

  Hay cuatro formas de programar un viaje, de la más rápida a la más detallada:

  1. **Una línea:** escribes `mañana 6am T-14 Ontario a NPT Houston` y presionas Enter.
     Reconoce la fecha (hoy, mañana, días de la semana, `15/08`), el número
     económico, el operador y el cliente. Antes de guardar te muestra qué entendió.
  2. **Pegar lista:** pegas varios renglones de Excel, WhatsApp o un correo — un viaje por
     renglón — y los interpreta todos de una vez.
  3. **Leer foto con IA:** subes una foto del schedule, una captura de Excel o de WhatsApp
     y Claude lee los viajes y los acomoda. Requiere configurar una llave de API (abajo).
  4. **Formulario completo**, con todos los campos.

  En los cuatro casos aparece una **vista previa**: los renglones a los que les falta algo
  se marcan en ámbar, se pueden editar o quitar uno por uno, y nada se guarda hasta que
  aprietas *Agregar*.
- **Inventario** — tractores y remolques en una sola lista, con filtro para ver solo unos u
  otros: número económico, categoría, tipo, placas de USA y de México, marca, modelo, año,
  VIN, capacidad, odómetro, ubicación, operador asignado, estado y fechas de seguro,
  verificación y servicio.
- **Conductores** — nombre, teléfono, licencia y su vigencia, examen médico, tractor
  asignado y base.
- **Clientes** — el directorio de entregas: nombre, dirección, ciudad, estado, contacto,
  teléfono y horario de recibo. Los clientes y sus ciudades aparecen como sugerencias al
  capturar el origen y el destino de un viaje, para no escribirlos completos cada vez.

### Formato de fecha

Viene configurado como **mes/día/año** (07/24/2026), igual que el schedule de AXL. Se cambia
a día/mes/año en *Datos y Ajustes → Datos de la compañía*. El ajuste también decide cómo se
entienden las fechas ambiguas al importar un CSV o al capturar `08/05` en una línea.

### Colores

Cada cliente y cada operador tienen su color. Se reparten solos de una paleta de 16 tonos
al cargar la información, y se cambian a mano en la ficha del cliente o del operador —
el schedule se repinta al instante. El tractor toma el color de su operador asignado, así
que en el inventario se reconoce de un vistazo de quién es cada unidad.
- **Papeles** — genera el texto de los correos que mandas para tramitar papeles, listo
  para copiar y pegar. Escribes un comando y el texto aparece a media pantalla:

  ```
  expo T-15 AXL-4680 Premium Pool Finishes
  vacio T-19
  ```

  El comando (`expo`, `vacio`, o el que agregues) elige el formato; lo demás se reconoce
  solo: número económico del tractor, de la caja, operador y cliente, en cualquier orden.
  Los datos salen de tu propio inventario y directorio, así que las placas, el VIN, el CAAT,
  el SCAC y la dirección siempre coinciden con lo que tienes capturado.

  - **Cada comando agrega también el viaje al schedule**, con su tractor, remolque, operador
    y cliente. La única excepción son los formatos marcados como que no agregan viaje —
    el de *entrada vacío* viene así. Si te equivocaste, el botón **Deshacer** lo quita.
  - Si algún dato falta (por ejemplo la dirección de un cliente), ese renglón **no sale
    vacío**: se cae solo y la página te dice qué información completar.
  - Los formatos se editan y se crean desde la misma pestaña. El texto se escribe tal cual
    quieres que salga, y los datos van entre llaves dobles: `{{operador}}`, `{{tractor.placa}}`,
    `{{cliente.direccion}}`… La lista completa está al final de la pestaña.
  - Quien es de consulta puede generar el texto, pero no se le agrega el viaje ni puede
    cambiar los formatos.

- **Plantillas** — rutas que se repiten (por ejemplo: lunes, miércoles y viernes,
  Hermosillo → Nogales). Con el botón **Generar** llenas el schedule de una semana
  o un mes completo de un jalón. Si un viaje ya fue generado antes, no se duplica.
- **Datos y Ajustes** — respaldos, datos de la compañía, **usuarios y contraseñas**,
  formato de fecha, catálogos, carga del inventario de AXL y borrado.

## Cargar el inventario que ya tienes

1. En Excel, guarda tu archivo como **CSV** (*Archivo → Guardar como → CSV*).
2. Entra con una cuenta que pueda editar y ve a **Inventario → Importar CSV**.
3. Si quieres, descarga primero la plantilla con los nombres de columna sugeridos.

La primera fila del archivo debe tener los títulos de las columnas. Los nombres se detectan
solos aunque no sean idénticos (`numero`, `número económico`, `unidad`, `unit`, `truck`…),
acepta separadores `,` `;` o tabulador, y entiende fechas `2026-08-15`, `15/08/2026` y
`8/15/2026`.

**Si vuelves a importar el mismo archivo, los registros no se duplican:** cuando el número
económico o la placa ya existen, la unidad se actualiza con los datos nuevos. Lo mismo con
los conductores, comparando por nombre.

## Leer fotos con IA

En *Datos y Ajustes → Leer fotos y capturas con IA* se pega una llave de la API de Claude
(se obtiene en platform.claude.com → API keys). La llave se guarda **solo en ese navegador**
y **no se incluye en los respaldos**. Con el botón *Probar conexión* se verifica antes de usarla.

Cómo funciona: la página encoge la imagen si viene muy grande, se la manda a Claude junto con
las listas de tractores, remolques, operadores y clientes que ya tienes capturados, y pide de
vuelta los viajes en un formato fijo. Lo que reconoce del inventario lo liga solo; lo que no
reconoce **no se inventa** — se anota en las notas del viaje (por ejemplo *"Unidad según la
foto: T-99"*) y el renglón se marca en la vista previa para que lo revises.

Dos cosas a tener en cuenta:

- Cada lectura se cobra a tu cuenta de Claude.
- Si abres la página desde la liga de claude.ai, el navegador bloquea esa conexión por
  seguridad. La lectura de fotos funciona en la versión que abres desde tu computadora o
  desde GitHub Pages. Todo lo demás funciona igual en las dos.

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
