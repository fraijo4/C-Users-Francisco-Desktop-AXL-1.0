/* =========================================================
   Control de Schedule y Flota — aplicación de una sola página
   Toda la información se guarda en el navegador (localStorage)
   y se puede respaldar / restaurar en archivo .json
   ========================================================= */
'use strict';

/* ---------------- Utilidades ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Fechas: se manejan como texto YYYY-MM-DD para no depender de zona horaria */
const pad = n => String(n).padStart(2, '0');
/* Formato de fecha de la compañía: 'mdy' (mes/día/año, como el schedule de AXL)
   o 'dmy' (día/mes/año). Se elige en Datos y Ajustes. */
const formatoFecha = () => (DB.preferencias && DB.preferencias.formatoFecha) || 'mdy';
const hoyISO = () => toISO(new Date());
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromISO(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : new Date(NaN);
}
function addDias(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
function inicioSemana(iso) { const d = fromISO(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toISO(d); } // lunes
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function fechaLarga(iso) {
  const d = fromISO(iso);
  if (isNaN(d)) return iso || '—';
  return `${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
function fechaCorta(iso) {
  const d = fromISO(iso);
  if (isNaN(d)) return iso || '—';
  const dd = pad(d.getDate()), mm = pad(d.getMonth() + 1);
  return formatoFecha() === 'mdy' ? `${mm}/${dd}/${d.getFullYear()}` : `${dd}/${mm}/${d.getFullYear()}`;
}
/* Encabezado de cada día, igual que en la hoja: "Viernes 07/24/2026" */
function fechaEncabezado(iso) {
  const d = fromISO(iso);
  if (isNaN(d)) return iso || '';
  return `${DIAS[(d.getDay() + 6) % 7]} ${fechaCorta(iso)}`;
}
/* índice de día de semana 0=lunes … 6=domingo */
const dowLunes = iso => (fromISO(iso).getDay() + 6) % 7;

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function descargar(nombre, contenido, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------------- CSV ---------------- */
function csvEscapar(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function aCSV(filas, columnas) {
  const head = columnas.map(c => csvEscapar(c.titulo)).join(',');
  const body = filas.map(f => columnas.map(c => csvEscapar(c.valor(f))).join(',')).join('\n');
  return '﻿' + head + '\n' + body;   // BOM para que Excel respete acentos
}
/* Parser CSV tolerante: detecta separador , ; o tab, respeta comillas */
function deCSV(texto) {
  const t = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primera = t.split('\n')[0] || '';
  const sep = [',', ';', '\t'].reduce((mejor, s) =>
    (primera.split(s).length > primera.split(mejor).length ? s : mejor), ',');
  const filas = [];
  let campo = '', fila = [], comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const limpias = filas.filter(f => f.some(c => String(c).trim() !== ''));
  if (!limpias.length) return { encabezados: [], registros: [] };
  const encabezados = limpias[0].map(h => h.trim());
  const registros = limpias.slice(1).map(f => {
    const o = {};
    encabezados.forEach((h, i) => o[h] = (f[i] ?? '').trim());
    return o;
  });
  return { encabezados, registros };
}
/* busca una columna del CSV por varios nombres posibles */
function campoCSV(reg, ...nombres) {
  const claves = Object.keys(reg);
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  for (const n of nombres) {
    const k = claves.find(c => norm(c) === norm(n));
    if (k && reg[k] !== '') return reg[k];
  }
  for (const n of nombres) {
    const k = claves.find(c => norm(c).includes(norm(n)));
    if (k && reg[k] !== '') return reg[k];
  }
  return '';
}

/* ---------------- Estado / almacenamiento ---------------- */
const CLAVE = 'axl_transportes_v1';

const CATALOGOS_DEF = {
  estadosViaje: ['Programado', 'Confirmado', 'En ruta', 'Entregado', 'Retrasado', 'Cancelado'],
  estadosUnidad: ['Disponible', 'En ruta', 'Mantenimiento', 'Fuera de servicio'],
  tiposUnidad: ['Tractocamión', "Caja seca 53'", "Caja refrigerada 53'", "Plataforma 48'",
    "Plataforma 45'", 'Camioneta', 'Dolly'],
  estadosConductor: ['Disponible', 'En ruta', 'Descanso', 'Vacaciones', 'Baja']
};
const CATEGORIAS = ['Tractor', 'Remolque', 'Otro'];
const EMPRESA_DEF = { nombre: 'AXL Transport', dispatch: '', contacto: '', caat: '', scac: '' };

const ESTADO_INICIAL = () => ({
  version: 2,
  empresa: Object.assign({}, EMPRESA_DEF),
  auth: { hash: '', salt: '', configurada: false },
  usuarios: [],
  catalogos: JSON.parse(JSON.stringify(CATALOGOS_DEF)),
  preferencias: { formatoFecha: 'mdy', origenPorDefecto: 'Tecate Mx' },
  formatos: [],
  unidades: [],
  conductores: [],
  clientes: [],
  viajes: [],
  plantillas: [],
  actualizado: null
});

let DB = ESTADO_INICIAL();
let sesion = { rol: 'consulta', nombre: '', usuario: '', id: '' };

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const d = JSON.parse(crudo);
      DB = Object.assign(ESTADO_INICIAL(), d);
      DB.catalogos = Object.assign(JSON.parse(JSON.stringify(CATALOGOS_DEF)), d.catalogos || {});
      DB.empresa = Object.assign({}, EMPRESA_DEF, d.empresa || {});
      DB.auth = Object.assign({ hash: '', salt: '', configurada: false }, d.auth || {});
      DB.preferencias = Object.assign({ formatoFecha: 'mdy', origenPorDefecto: 'Tecate Mx' }, d.preferencias || {});
      ['unidades', 'conductores', 'clientes', 'viajes', 'plantillas', 'usuarios', 'formatos'].forEach(k => {
        if (!Array.isArray(DB[k])) DB[k] = [];
      });
      DB.viajes.forEach(v => {
        if (!v.estatus) v.estatus = {};
        if (!v.facturas && v.referencia) v.facturas = v.referencia;   // la columna se llamaba "referencia"
      });
    }
  } catch (e) {
    console.error('No se pudo leer la información guardada', e);
    toast('No se pudo leer la información guardada; se empezó con datos vacíos.');
  }
}
function guardar() {
  asignarColores();
  DB.actualizado = new Date().toISOString();
  try {
    localStorage.setItem(CLAVE, JSON.stringify(DB));
  } catch (e) {
    toast('¡No se pudo guardar! El almacenamiento del navegador está lleno. Descarga un respaldo.');
    console.error(e);
  }
}

/* ---------------- Usuarios ---------------- */
/* Cinco cuentas de arranque: dos que editan y tres de consulta.
   Todas se pueden renombrar, cambiar de permiso o borrar desde Ajustes. */
const USUARIOS_DEF = [
  { usuario: 'francisco', nombre: 'Francisco — dueño y dispatch', rol: 'admin', clave: 'AXL-dueno-2026' },
  { usuario: 'oficina', nombre: 'Oficina — segundo dispatch', rol: 'admin', clave: 'AXL-oficina-2026' },
  { usuario: 'consulta1', nombre: 'Consulta 1', rol: 'consulta', clave: 'AXL-ver1-2026' },
  { usuario: 'consulta2', nombre: 'Consulta 2', rol: 'consulta', clave: 'AXL-ver2-2026' },
  { usuario: 'consulta3', nombre: 'Consulta 3', rol: 'consulta', clave: 'AXL-ver3-2026' }
];
const ROLES = { admin: 'Puede editar', consulta: 'Solo consulta' };
const buscarUsuario = u => DB.usuarios.find(x => x.usuario.toLowerCase() === String(u || '').trim().toLowerCase());
const cuantosAdmin = () => DB.usuarios.filter(u => u.rol === 'admin').length;

async function crearUsuario({ usuario, nombre, rol, clave }) {
  const salt = uid() + uid();
  return { id: uid(), usuario, nombre, rol, salt, hash: await hashPass(clave, salt), creado: new Date().toISOString() };
}

/* Se ejecuta una sola vez: crea las cuentas de arranque.
   Si ya había una contraseña de administrador, se conserva en la cuenta principal. */
/* Formatos de arranque: los dos que ya se usan por correo */
function sembrarFormatos() {
  if (Array.isArray(DB.formatos) && DB.formatos.length) return;
  DB.formatos = FORMATOS_DEF.map(f => Object.assign({ id: uid() }, f));
  guardar();
}

async function sembrarUsuarios() {
  if (Array.isArray(DB.usuarios) && DB.usuarios.length) return false;
  DB.usuarios = [];
  for (const d of USUARIOS_DEF) DB.usuarios.push(await crearUsuario(d));
  if (DB.auth && DB.auth.configurada) {           // respeta la clave que ya se había puesto
    DB.usuarios[0].salt = DB.auth.salt;
    DB.usuarios[0].hash = DB.auth.hash;
    DB.usuarios[0].notaClave = 'Conserva la contraseña que ya tenías.';
  }
  guardar();
  return true;
}

/* ---------------- Contraseña ---------------- */
async function hashPass(pass, salt) {
  const txt = salt + '|' + pass;
  if (window.crypto && crypto.subtle && crypto.subtle.digest) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(b => pad(b.toString(16))).join('');
  }
  // Respaldo si el navegador no expone crypto.subtle (por ejemplo, http sin TLS)
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < txt.length; i++) {
    h1 = Math.imul(h1 ^ txt.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + txt.charCodeAt(i) * (i + 7), 2654435761) >>> 0;
  }
  return 'f' + h1.toString(16) + h2.toString(16);
}
async function cambiarClave(u, clave) {
  u.salt = uid() + uid();
  u.hash = await hashPass(clave, u.salt);
  delete u.notaClave;
}
async function claveCorrecta(u, clave) {
  return !!u && (await hashPass(clave, u.salt)) === u.hash;
}

/* ---------------- Búsquedas por id ---------------- */
const unidad = id => DB.unidades.find(u => u.id === id);
const conductor = id => DB.conductores.find(c => c.id === id);
const nombreUnidad = id => { const u = unidad(id); return u ? (u.numero || u.placa || 'Unidad') : ''; };
const nombreConductor = id => { const c = conductor(id); return c ? c.nombre : ''; };

/* ---------------- Colores por cliente y por operador ---------------- */
/* Paleta elegida para que se distinga en modo claro y oscuro */
const PALETA = ['#2563eb', '#0d9488', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#ca8a04', '#dc2626', '#4f46e5', '#65a30d', '#9333ea',
  '#0ea5e9', '#e11d48', '#059669', '#d97706'];

function colorAuto(texto) {                   // color estable aunque no esté en el directorio
  let h = 0;
  const s = String(texto || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}
/* asigna colores libres a quien no tenga */
function asignarColores() {
  const usados = c => new Set(c.map(x => x.color).filter(Boolean));
  [DB.clientes, DB.conductores].forEach(lista => {
    const ya = usados(lista);
    lista.forEach(x => {
      if (x.color) return;
      x.color = PALETA.find(c => !ya.has(c)) || colorAuto(x.nombre || x.id);
      ya.add(x.color);
    });
  });
}
function colorCliente(nombre) {
  if (!nombre) return '';
  const c = DB.clientes.find(x => String(x.nombre).toLowerCase() === String(nombre).toLowerCase());
  return (c && c.color) || colorAuto(nombre);
}
const colorConductor = id => { const c = conductor(id); return (c && c.color) || (c ? colorAuto(c.nombre) : ''); };
/* el tractor toma el color de su operador asignado */
function colorUnidad(id) {
  const c = DB.conductores.find(x => x.unidadId === id);
  return c ? (c.color || colorAuto(c.nombre)) : '';
}
/* color con el que se pinta un viaje: el del cliente, o el del operador si no hay cliente */
const colorViaje = v => colorCliente(v.cliente) || colorConductor(v.conductorId) || '';

/* clase de color según estado */
function claseEstado(e) {
  const s = String(e || '').toLowerCase();
  if (/disponible|entregad|confirmad|activo/.test(s)) return 'ok';
  if (/retras|mantenim|descanso|vacacion|pendiente/.test(s)) return 'warn';
  if (/cancel|fuera|baja|averi/.test(s)) return 'bad';
  if (/ruta|transito|tránsito/.test(s)) return 'info';
  return '';
}

/* ---------------- Modal ---------------- */
function abrirModal(titulo, htmlCuerpo, botones = []) {
  $('#modalTitle').textContent = titulo;
  $('#modalBody').innerHTML = htmlCuerpo;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  botones.forEach(b => {
    if (b.adminOnly && sesion.rol !== 'admin') return;
    const el = document.createElement('button');
    el.className = 'btn ' + (b.clase || '');
    el.textContent = b.texto;
    el.onclick = b.accion;
    foot.appendChild(el);
  });
  $('#modalBack').classList.remove('hidden');
  const primero = $('#modalBody input, #modalBody select, #modalBody textarea');
  if (primero) primero.focus();
}
function cerrarModal() { $('#modalBack').classList.add('hidden'); $('#modalBody').innerHTML = ''; }

function confirmar(titulo, mensaje, alConfirmar, textoBoton = 'Sí, continuar') {
  abrirModal(titulo, `<p>${esc(mensaje)}</p>`, [
    { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
    { texto: textoBoton, clase: 'danger', accion: () => { cerrarModal(); alConfirmar(); } }
  ]);
}

function pedirArchivo(accept, alLeer) {
  const inp = $('#filePicker');
  inp.value = '';
  inp.accept = accept;
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => alLeer(String(fr.result), f.name);
    fr.readAsText(f, 'utf-8');
  };
  inp.click();
}

/* ---------------- Constructor de formularios ---------------- */
function campo(c) {
  const id = 'f_' + c.k;
  const val = c.valor ?? '';
  const cls = c.ancho === 'full' ? 'full' : '';
  let control;
  if (c.tipo === 'select') {
    const ops = (c.opciones || []).map(o => {
      const v = typeof o === 'string' ? o : o.v;
      const t = typeof o === 'string' ? o : o.t;
      return `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('');
    control = `<select id="${id}" name="${c.k}">${c.vacio !== false ? `<option value="">${esc(c.vacio || '— ninguno —')}</option>` : ''}${ops}</select>`;
  } else if (c.tipo === 'color') {
    control = `<div class="swatches">${PALETA.map((col, i) =>
      `<label title="${esc(col)}"><input type="radio" name="${c.k}" value="${col}"
        ${(val || PALETA[0]) === col ? 'checked' : ''}><span class="muestra" style="--c:${col}"></span></label>`).join('')}</div>`;
  } else if (c.tipo === 'textarea') {
    control = `<textarea id="${id}" name="${c.k}" placeholder="${esc(c.ph || '')}">${esc(val)}</textarea>`;
  } else {
    const dl = c.lista && c.lista.length ? 'dl_' + c.k : '';
    control = `<input id="${id}" name="${c.k}" type="${c.tipo || 'text'}" value="${esc(val)}"
      placeholder="${esc(c.ph || '')}" ${c.paso ? `step="${c.paso}"` : ''} ${c.req ? 'required' : ''}
      ${dl ? `list="${dl}"` : ''}>` +
      (dl ? `<datalist id="${dl}">${[...new Set(c.lista)].filter(Boolean)
        .map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
  }
  return `<div class="${cls}"><label for="${id}">${esc(c.t)}${c.req ? ' *' : ''}${control}</label></div>`;
}
function formHTML(campos, extra = '') {
  return `<form id="modalForm"><div class="form-grid">${campos.map(campo).join('')}</div>${extra}</form>`;
}
function leerForm() {
  const datos = {};
  $$('#modalForm [name]').forEach(el => {
    if (el.type === 'checkbox') {
      if (!Array.isArray(datos[el.name])) datos[el.name] = [];
      if (el.checked) datos[el.name].push(el.value);
    } else if (el.type === 'radio') {
      if (el.checked) datos[el.name] = el.value;
    } else datos[el.name] = el.value.trim();
  });
  return datos;
}

const esRemolque = u => (u.categoria || '') === 'Remolque';
const opcionesUnidad = (categoria = '') => DB.unidades
  .filter(u => !categoria || (u.categoria || 'Tractor') === categoria)
  .slice().sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }))
  .map(u => ({ v: u.id, t: `${u.numero || '(sin número)'}${u.placa ? ' · ' + u.placa : ''}${u.tipo ? ' · ' + u.tipo : ''}` }));

/* sugerencias para origen / destino / cliente, sacadas del directorio y del historial */
const nombresCliente = () => [...new Set(DB.clientes.map(c => c.nombre).concat(DB.viajes.map(v => v.cliente)))].filter(Boolean).sort();
const lugares = () => [...new Set(
  DB.clientes.map(c => [c.ciudad, c.estado].filter(Boolean).join(', '))
    .concat(DB.clientes.map(c => c.nombre))
    .concat(DB.viajes.flatMap(v => [v.origen, v.destino])))].filter(Boolean).sort();
const opcionesConductor = () => DB.conductores
  .slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
  .map(c => ({ v: c.id, t: c.nombre || '(sin nombre)' }));

/* ---------------- Detección de empalmes ---------------- */
/* Una unidad puede dar dos vueltas el mismo día — eso es normal aquí.
   Ya no se avisa de "empalmes"; solo se informa cuando algo se repite. */
function repeticionesDelDia(viaje) {
  const activo = v => !/cancel/i.test(v.estado || '');
  if (!activo(viaje)) return [];
  return DB.viajes.filter(v =>
    v.id !== viaje.id && v.fecha === viaje.fecha && activo(v) &&
    ((viaje.unidadId && v.unidadId === viaje.unidadId) ||
     (viaje.remolqueId && v.remolqueId === viaje.remolqueId) ||
     (viaje.conductorId && v.conductorId === viaje.conductorId)));
}

/* =========================================================
   VIAJES
   ========================================================= */
function camposViaje(v = {}) {
  return [
    { k: 'fecha', t: 'Fecha', tipo: 'date', valor: v.fecha || hoyISO(), req: true },
    { k: 'estado', t: 'Estado', tipo: 'select', opciones: DB.catalogos.estadosViaje, valor: v.estado || DB.catalogos.estadosViaje[0], vacio: false },
    { k: 'origen', t: 'Origen', valor: v.origen || '', ph: 'Ciudad / planta', req: true, lista: lugares() },
    { k: 'destino', t: 'Destino', valor: v.destino || '', ph: 'Ciudad / cliente', req: true, lista: lugares() },
    { k: 'stop', t: 'Stop', valor: v.stop || '', ph: 'Parada intermedia' },
    { k: 'cliente', t: 'Cliente', valor: v.cliente || '', lista: nombresCliente() },
    { k: 'facturas', t: 'Facturas', valor: v.facturas || '', ph: 'A-4795 // TOD-7165-H1' },
    { k: 'unidadId', t: 'Tractor', tipo: 'select', opciones: opcionesUnidad('Tractor'), valor: v.unidadId || '', vacio: '— sin asignar —' },
    { k: 'remolqueId', t: 'Remolque / caja', tipo: 'select', opciones: opcionesUnidad('Remolque'), valor: v.remolqueId || '', vacio: '— sin asignar —' },
    { k: 'conductorId', t: 'Conductor', tipo: 'select', opciones: opcionesConductor(), valor: v.conductorId || '', vacio: '— sin asignar —' },
    { k: 'carga', t: 'Carga / mercancía', valor: v.carga || '' },
    { k: 'millas', t: 'Millas / km', tipo: 'number', paso: '1', valor: v.millas || '' },
    { k: 'tarifa', t: 'Tarifa ($)', tipo: 'number', paso: '0.01', valor: v.tarifa || '' },
    { k: 'notas', t: 'Notas', tipo: 'textarea', valor: v.notas || '', ancho: 'full' }
  ];
}

/* Papeles → Previo → Cruzó → Entregado: las cuatro etapas de la hoja */
const ETAPAS = [['papeles', 'Papeles'], ['previo', 'Previo'], ['cruzo', 'Cruzó'], ['entregado', 'Entregado']];
const etapasDe = v => (v && v.estatus) || {};

function editarViaje(id, prefill = {}) {
  if (sesion.rol !== 'admin') return;
  const existente = id ? DB.viajes.find(v => v.id === id) : null;
  const base = existente || prefill;
  const est = etapasDe(base);
  const checksEtapas = `<div class="full"><label>Avance del viaje</label><div class="dias-check">${
    ETAPAS.map(([k, t]) => `<label><input type="checkbox" name="etapas" value="${k}" ${est[k] ? 'checked' : ''}> ${t}</label>`).join('')
  }</div></div>`;
  abrirModal(existente ? 'Editar viaje' : 'Nuevo viaje',
    `<form id="modalForm"><div class="form-grid">${camposViaje(base).map(campo).join('')}${checksEtapas}</div></form>`,
    [
      ...(existente ? [{ texto: 'Duplicar', clase: 'ghost', accion: () => { const c = { ...existente }; delete c.id; cerrarModal(); editarViaje(null, c); } }] : []),
      ...(existente ? [{ texto: 'Eliminar', clase: 'danger', accion: () => eliminarViaje(existente.id) }] : []),
      { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
      { texto: 'Guardar', clase: 'primary', accion: () => guardarViaje(existente) }
    ]);
}

function guardarViaje(existente) {
  const d = leerForm();
  if (!d.fecha) return toast('Falta la fecha del viaje.');
  if (!d.origen && !d.destino) return toast('Indica al menos origen y destino.');
  const etapas = {};
  ETAPAS.forEach(([k]) => { etapas[k] = (d.etapas || []).includes(k); });
  delete d.etapas;
  const viaje = Object.assign({ id: existente ? existente.id : uid(), creado: existente?.creado || new Date().toISOString() },
    existente || {}, d, { estatus: etapas });
  viaje.modificado = new Date().toISOString();
  if (etapas.entregado && !/cancel/i.test(viaje.estado || '')) viaje.estado = 'Entregado';

  const aplicar = () => {
    if (existente) {
      const i = DB.viajes.findIndex(v => v.id === existente.id);
      DB.viajes[i] = viaje;
    } else DB.viajes.push(viaje);
    guardar(); cerrarModal(); render();
    toast(existente ? 'Viaje actualizado.' : 'Viaje agregado al schedule.');
  };

  aplicar();
}

function eliminarViaje(id) {
  const v = DB.viajes.find(x => x.id === id);
  confirmar('Eliminar viaje',
    `¿Eliminar el viaje del ${fechaCorta(v.fecha)} (${v.origen || '?'} → ${v.destino || '?'})?`,
    () => {
      DB.viajes = DB.viajes.filter(x => x.id !== id);
      guardar(); cerrarModal(); render(); toast('Viaje eliminado.');
    }, 'Eliminar');
}

function verViaje(id) {
  const v = DB.viajes.find(x => x.id === id);
  if (!v) return;
  const fila = (t, d) => d ? `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>` : '';
  const repes = repeticionesDelDia(v);
  abrirModal('Detalle del viaje',
    `<div class="detalle"><dl>
      ${fila('Fecha', fechaLarga(v.fecha))}
      <dt>Estado</dt><dd><span class="chip ${claseEstado(v.estado)}">${esc(v.estado || '—')}</span></dd>
      ${fila('Ruta', `${v.origen || '?'} → ${v.destino || '?'}`)}
      ${fila('Cliente', v.cliente)}
      ${fila('Stop', v.stop)}
      ${fila('Facturas', v.facturas || v.referencia)}
      ${fila('Tractor', nombreUnidad(v.unidadId))}
      ${fila('Remolque', nombreUnidad(v.remolqueId))}
      ${fila('Conductor', nombreConductor(v.conductorId))}
      ${fila('Carga', v.carga)}
      ${fila('Millas / km', v.millas)}
      ${fila('Tarifa', v.tarifa ? '$' + v.tarifa : '')}
      ${fila('Notas', v.notas)}
      <dt>Avance</dt><dd>${ETAPAS.map(([k, t]) =>
        `<span class="chip ${etapasDe(v)[k] ? 'ok' : ''}" title="${esc(tituloEtapa(v, k, t))}">${etapasDe(v)[k] ? '✓' : '○'} ${esc(t)}</span>`).join(' ')}
        ${ETAPAS.filter(([k]) => (v.estatusMeta || {})[k]).map(([k, t]) =>
          `<div class="hint">${esc(t)}: ${esc(v.estatusMeta[k].por)} · ${esc(fechaCorta(v.estatusMeta[k].en.slice(0, 10)))}</div>`).join('')}</dd>
    </dl>${repes.length ? `<p class="hint">Ese día la misma unidad u operador aparece en ${repes.length} viaje(s) más.</p>` : ''}</div>`,
    [{ texto: 'Cerrar', clase: 'ghost', accion: cerrarModal },
     { texto: 'Editar', clase: 'primary', adminOnly: true, accion: () => editarViaje(id) }]);
}

/* ---------------- Filtros del schedule ---------------- */
let estadoUI = {
  vista: 'hoja',
  ancla: hoyISO(),
  buscar: '', fEstado: '', fUnidad: '', fConductor: '',
  abrirCompletados: {},
  ordenUnidades: { col: 'numero', asc: true },
  ordenConductores: { col: 'nombre', asc: true }
};

function viajesFiltrados() {
  const q = estadoUI.buscar.toLowerCase();
  return DB.viajes.filter(v => {
    if (estadoUI.fEstado && v.estado !== estadoUI.fEstado) return false;
    if (estadoUI.fUnidad && v.unidadId !== estadoUI.fUnidad) return false;
    if (estadoUI.fConductor && v.conductorId !== estadoUI.fConductor) return false;
    if (q) {
      const texto = [v.origen, v.destino, v.cliente, v.referencia, v.carga, v.notas,
        nombreUnidad(v.unidadId), nombreConductor(v.conductorId), v.estado].join(' ').toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}
/* Sin hora, el orden dentro del día es el de captura (lo más viejo arriba) */
const ordenarViajes = arr => arr.slice().sort((a, b) =>
  (a.fecha || '').localeCompare(b.fecha || '') ||
  String(a.creado || '').localeCompare(String(b.creado || '')));

function tarjetaViaje(v) {
  const cls = claseEstado(v.estado);
  const equipo = [nombreUnidad(v.unidadId), nombreUnidad(v.remolqueId)].filter(Boolean).join(' · ');
  const op = nombreConductor(v.conductorId);
  return `<div class="viaje ${/cancel/i.test(v.estado || '') ? 'cancelado' : ''}" data-viaje="${v.id}"
      style="--c:${colorViaje(v) || 'var(--brand)'}" title="${esc(v.notas || '')}">
    <div class="ruta">${esc(v.origen || '?')} → ${esc(v.destino || '?')}</div>
    ${v.cliente ? `<div class="meta"><span class="punto" style="--c:${colorCliente(v.cliente)}"></span>${esc(v.cliente)}</div>` : ''}
    ${op ? `<div class="meta"><span class="punto" style="--c:${colorConductor(v.conductorId)}"></span>${esc(op)}</div>` : ''}
    ${equipo ? `<div class="meta">${esc(equipo)}</div>` : ''}
    <div class="meta"><span class="chip ${cls}">${esc(v.estado || 'Programado')}</span>
      <span class="ticks-mini" title="Papeles · Previo · Cruzó · Entregado">${
        ETAPAS.map(([k]) => `<i class="${etapasDe(v)[k] ? 'on' : ''}"></i>`).join('')}</span></div>
  </div>`;
}

/* Leyenda: los colores que aparecen en el periodo que se está viendo */
function renderLeyenda(viajes) {
  const cont = $('#leyendaColores');
  const clientes = [...new Set(viajes.map(v => v.cliente).filter(Boolean))].sort();
  const operadores = [...new Set(viajes.map(v => v.conductorId).filter(Boolean))]
    .map(id => ({ id, nombre: nombreConductor(id), unidad: nombreUnidad((conductor(id) || {}).unidadId) }))
    .filter(o => o.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!clientes.length && !operadores.length) { cont.innerHTML = ''; return; }
  const item = (color, texto) => `<span class="item"><span class="punto" style="--c:${color}"></span>${esc(texto)}</span>`;
  cont.innerHTML = `<div class="leyenda">
    ${clientes.length ? `<b>Clientes</b>${clientes.map(c => item(colorCliente(c), c)).join('')}` : ''}
    ${operadores.length ? `<b>Operadores</b>${operadores.map(o =>
      item(o.color || colorConductor(o.id), o.nombre + (o.unidad ? ` · ${o.unidad}` : ''))).join('')}` : ''}
  </div>`;
}

/* =========================================================
   HOJA DIARIA — el mismo formato del schedule de siempre,
   editable directamente sobre la tabla
   ========================================================= */
const COLUMNAS_HOJA = [
  { t: 'Cliente', k: 'cliente', ancho: 160, color: v => colorCliente(v.cliente) },
  { t: 'Operador', k: 'conductorId', tipo: 'conductor', ancho: 190 },
  { t: 'Origen', k: 'origen', ancho: 130 },
  { t: 'Destino', k: 'destino', ancho: 130 },
  { t: 'Stop', k: 'stop', ancho: 92 },
  { t: 'Tractor', k: 'unidadId', tipo: 'tractor', ancho: 92 },
  { t: 'Remolque', k: 'remolqueId', tipo: 'remolque', ancho: 108 },
  { t: 'Facturas', k: 'facturas', ancho: 190 }
];

function celdaSelect(v, col) {
  const ops = col.tipo === 'conductor' ? opcionesConductor()
    : opcionesUnidad(col.tipo === 'remolque' ? 'Remolque' : 'Tractor');
  const actual = v[col.k] || '';
  const corto = o => String(o.t).split(' · ')[0];
  return `<select class="cel-sel" data-id="${v.id}" data-campo="${col.k}" ${sesion.rol !== 'admin' ? 'disabled' : ''}>
    <option value="">—</option>
    ${ops.map(o => `<option value="${esc(o.v)}" ${o.v === actual ? 'selected' : ''}>${esc(corto(o))}</option>`).join('')}
  </select>`;
}

function filaHoja(v, primeraColumna = null) {
  const editable = sesion.rol === 'admin';
  const celdas = (primeraColumna !== null ? `<td><span class="cel salio">${esc(primeraColumna)}</span></td>` : '') +
    COLUMNAS_HOJA.map(col => {
    if (col.tipo) return `<td>${celdaSelect(v, col)}</td>`;
    const texto = esc(v[col.k] || '');
    const punto = col.color ? `<span class="punto" style="--c:${col.color(v) || 'transparent'}"></span>` : '';
    return `<td><span class="cel ${col.color ? 'con-color' : ''}" ${editable ? 'contenteditable="true"' : ''}
      data-id="${v.id}" data-campo="${col.k}" data-original="${texto}">${punto}${texto}</span></td>`;
  }).join('');
  const ticks = ETAPAS.map(([k, t]) => `<td class="col-tick">
    <button class="tick" data-id="${v.id}" data-etapa="${k}" aria-pressed="${!!etapasDe(v)[k]}"
      title="${esc(tituloEtapa(v, k, t))}" aria-label="${t}${etapasDe(v)[k] ? ': hecho' : ': pendiente'}">✓</button></td>`).join('');
  return `<tr class="${/cancel/i.test(v.estado || '') ? 'cancelada' : ''}">${celdas}${ticks}
    <td class="col-acc actions"><button class="btn mini" data-viaje="${v.id}">Ver</button>
    ${editable ? `<button class="btn mini" data-borrar-viaje="${v.id}">✕</button>` : ''}</td></tr>`;
}

function tablaHoja(viajes) {
  return `<div class="hoja-wrap"><table class="hoja">
      <thead><tr>
        ${COLUMNAS_HOJA.map(c => `<th style="min-width:${c.ancho}px">${esc(c.t)}</th>`).join('')}
        ${ETAPAS.map(([, t]) => `<th class="col-tick">${esc(t)}</th>`).join('')}
        <th class="col-acc"></th>
      </tr></thead>
      <tbody>${viajes.map(v => filaHoja(v)).join('')}</tbody>
    </table></div>`;
}

function bloqueDia(fecha, viajes) {
  const editable = sesion.rol === 'admin';
  const activos = viajes.filter(v => !estaCompletado(v));
  const listos = viajes.filter(estaCompletado);
  const cabeza = `<div class="dia-titulo">
      <h3>${esc(fechaEncabezado(fecha))}</h3>
      <span class="cuenta">${activos.length} en curso${listos.length ? ` · ${listos.length} completado(s)` : ''}</span>
      ${editable ? `<button class="btn mini" data-nuevo="${fecha}">+ Agregar viaje</button>` : ''}
    </div>`;
  if (!viajes.length) {                       // los días sin viajes no estorban
    return editable
      ? `<div class="dia-vacio"><b>${esc(fechaEncabezado(fecha))}</b><span>sin viajes</span>
         <button class="btn mini" data-nuevo="${fecha}">+ Agregar viaje</button></div>`
      : '';
  }
  /* Lo completado se baja a su propia sección, plegada, para dejar limpio el día */
  const completados = listos.length
    ? `<details class="completados" ${estadoUI.abrirCompletados[fecha] ? 'open' : ''} data-dia-comp="${fecha}">
         <summary>✓ Completados (${listos.length})</summary>
         ${tablaHoja(listos)}
       </details>`
    : '';
  return `<div class="dia-bloque">${cabeza}
    ${activos.length ? tablaHoja(activos) : '<div class="dia-vacio"><span>Todo lo de este día está completado.</span></div>'}
    ${completados}</div>`;
}

/* Guarda una celda editada. Devuelve true si algo cambió. */
function editarCampoViaje(id, campo, valor) {
  const v = DB.viajes.find(x => x.id === id);
  if (!v || String(v[campo] || '') === valor) return false;
  v[campo] = valor;
  v.modificado = new Date().toISOString();
  guardar();
  toast('Guardado.', 1200);
  return true;
}

function marcarEtapa(id, etapa, boton) {
  if (sesion.rol !== 'admin') return;
  const v = DB.viajes.find(x => x.id === id);
  if (!v) return;
  v.estatus = v.estatus || {};
  v.estatusMeta = v.estatusMeta || {};
  const prendido = !v.estatus[etapa];
  v.estatus[etapa] = prendido;
  /* queda constancia de quién marcó y cuándo, por si después hay reclamo */
  v.estatusMeta[etapa] = prendido
    ? { por: sesion.nombre || sesion.usuario, en: new Date().toISOString() } : null;
  if (etapa === 'entregado' && !/cancel/i.test(v.estado || '')) {
    v.estado = prendido ? 'Entregado' : DB.catalogos.estadosViaje[0];
  }
  v.modificado = new Date().toISOString();
  guardar();
  if (etapa === 'entregado') {                 // el viaje se va (o regresa) de los renglones activos
    estadoUI.abrirCompletados[v.fecha] = prendido || estadoUI.abrirCompletados[v.fecha];
    renderSchedule();
    renderPanel();
    return toast(prendido ? 'Viaje completado: se movió a la sección de completados.' : 'El viaje regresó a los renglones activos.', 3000);
  }
  const nombre = (ETAPAS.find(e => e[0] === etapa) || [])[1] || etapa;
  boton.setAttribute('aria-pressed', String(prendido));
  boton.setAttribute('aria-label', `${nombre}: ${prendido ? 'hecho' : 'pendiente'}`);
  boton.title = tituloEtapa(v, etapa, nombre);
  renderPanel();
}

/* Texto del globito de cada casilla: qué es, quién la marcó y cuándo */
function tituloEtapa(v, k, nombre) {
  const m = (v.estatusMeta || {})[k];
  return m && m.por ? `${nombre} — marcado por ${m.por} el ${fechaCorta(m.en.slice(0, 10))}` : nombre;
}

/* Un viaje se da por terminado cuando se marca Entregado */
const estaCompletado = v => !!etapasDe(v).entregado || /cancel/i.test(v.estado || '');

/* Bloque de arriba: lo que salió antes de esta semana y sigue sin entregarse.
   Aquí caen los viajes largos (Marion, Houston) que cruzan de semana. */
function bloquePendientes(datos, desde) {
  const pend = ordenarViajes(datos.filter(v => v.fecha < desde && !estaCompletado(v)));
  if (!pend.length) return '';
  const dias = v => Math.round((fromISO(hoyISO()) - fromISO(v.fecha)) / 86400000);
  const filas = pend.map(v => filaHoja(v, `${fechaCorta(v.fecha)} · ${dias(v)} día(s)`)).join('');
  return `<div class="dia-bloque pendientes">
    <div class="dia-titulo">
      <h3>Pendientes de días anteriores</h3>
      <span class="cuenta">${pend.length} viaje(s) sin entregar</span>
    </div>
    <div class="hoja-wrap"><table class="hoja">
      <thead><tr><th style="min-width:120px">Salió</th>
        ${COLUMNAS_HOJA.map(c => `<th style="min-width:${c.ancho}px">${esc(c.t)}</th>`).join('')}
        ${ETAPAS.map(([, t]) => `<th class="col-tick">${esc(t)}</th>`).join('')}
        <th class="col-acc"></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div></div>`;
}

function renderHoja(datos, cont) {
  const ini = inicioSemana(estadoUI.ancla), fin = addDias(ini, 6);
  $('#periodoLabel').textContent = `Semana del ${fechaCorta(ini)} al ${fechaCorta(fin)}`;
  let html = bloquePendientes(datos, ini);
  for (let i = 0; i < 7; i++) {
    const f = addDias(ini, i);
    html += bloqueDia(f, ordenarViajes(datos.filter(v => v.fecha === f)));
  }
  cont.innerHTML = html || '<div class="panel"><div class="empty">No hay viajes esta semana.</div></div>';
}

/* ---------------- Render: Schedule ---------------- */
function renderSchedule() {
  const cont = $('#scheduleBody');
  const datos = viajesFiltrados();
  const hoy = hoyISO();
  renderLeyenda(datos);

  if (estadoUI.vista === 'hoja') {
    renderHoja(datos, cont);

  } else if (estadoUI.vista === 'semana') {
    const ini = inicioSemana(estadoUI.ancla);
    const fin = addDias(ini, 6);
    $('#periodoLabel').textContent = `Semana del ${fechaCorta(ini)} al ${fechaCorta(fin)}`;
    let html = '<div class="semana">';
    for (let i = 0; i < 7; i++) {
      const f = addDias(ini, i);
      const delDia = ordenarViajes(datos.filter(v => v.fecha === f));
      html += `<div class="dia ${f === hoy ? 'hoy' : ''}">
        <div class="dia-head"><b>${DIAS_CORTO[i]} ${fromISO(f).getDate()}</b><span class="muted small">${delDia.length}</span></div>
        <div class="dia-body">
          ${delDia.map(tarjetaViaje).join('') || '<span class="muted small">Sin viajes</span>'}
          ${sesion.rol === 'admin' ? `<button class="dia-add" data-nuevo="${f}">+ Agregar</button>` : ''}
        </div></div>`;
    }
    cont.innerHTML = html + '</div>';

  } else if (estadoUI.vista === 'mes') {
    const d = fromISO(estadoUI.ancla);
    const primero = new Date(d.getFullYear(), d.getMonth(), 1);
    const ini = inicioSemana(toISO(primero));
    $('#periodoLabel').textContent = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
    let html = '<div class="panel"><div class="mes">' +
      DIAS_CORTO.map(x => `<div class="mes-dow">${x}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const f = addDias(ini, i);
      const fd = fromISO(f);
      const fuera = fd.getMonth() !== d.getMonth();
      if (i >= 35 && fuera) continue;
      const delDia = ordenarViajes(datos.filter(v => v.fecha === f));
      const items = delDia.slice(0, 3).map(v =>
        `<button class="mes-item" data-viaje="${v.id}" style="--c:${colorViaje(v) || 'var(--line)'}"
          >${esc(v.cliente || v.destino || v.origen || 'Viaje')}</button>`).join('');
      html += `<div class="mes-dia ${fuera ? 'fuera' : ''} ${f === hoy ? 'hoy' : ''}" data-dia="${f}">
        <span class="n">${fd.getDate()}</span>${items}
        ${delDia.length > 3 ? `<span class="mes-mas">+${delDia.length - 3} más</span>` : ''}
      </div>`;
    }
    cont.innerHTML = html + '</div></div>';

  } else {
    $('#periodoLabel').textContent = 'Todos los viajes';
    const lista = ordenarViajes(datos);
    cont.innerHTML = `<div class="panel"><div class="tbl-wrap">${tabla(
      [
        { t: 'Fecha', v: v => fechaCorta(v.fecha) },
        { t: 'Origen', v: v => esc(v.origen) },
        { t: 'Destino', v: v => esc(v.destino) },
        { t: 'Cliente', v: v => conPunto(colorCliente(v.cliente), v.cliente) },
        { t: 'Facturas', v: v => esc(v.facturas || v.referencia) },
        { t: 'Tractor', v: v => esc(nombreUnidad(v.unidadId)) },
        { t: 'Remolque', v: v => esc(nombreUnidad(v.remolqueId)) },
        { t: 'Operador', v: v => conPunto(colorConductor(v.conductorId), nombreConductor(v.conductorId)) },
        { t: 'Estado', v: v => `<span class="chip ${claseEstado(v.estado)}">${esc(v.estado || '')}</span>` }
      ], lista, v => `<button class="btn mini" data-viaje="${v.id}">Ver</button>` +
        (sesion.rol === 'admin' ? ` <button class="btn mini admin-only" data-editar-viaje="${v.id}">Editar</button>` : ''),
      'No hay viajes que coincidan con el filtro.')}</div>
      <p class="hint">${lista.length} viaje(s)</p></div>`;
  }

}

/* Los manejadores se enganchan una sola vez al contenedor, que no se
   reemplaza entre dibujados (focusout no funciona como propiedad onX). */
function conectarSchedule() {
  const cont = $('#scheduleBody');

  cont.addEventListener('click', e => {
    const tick = e.target.closest('.tick');
    if (tick) return marcarEtapa(tick.dataset.id, tick.dataset.etapa, tick);
    const borrar = e.target.closest('[data-borrar-viaje]');
    if (borrar) return eliminarViaje(borrar.dataset.borrarViaje);
    const ver = e.target.closest('[data-viaje]');
    if (ver) return verViaje(ver.dataset.viaje);
    const ed = e.target.closest('[data-editar-viaje]');
    if (ed) return editarViaje(ed.dataset.editarViaje);
    const nuevo = e.target.closest('[data-nuevo]');
    if (nuevo) return editarViaje(null, { fecha: nuevo.dataset.nuevo });
    const dia = e.target.closest('[data-dia]');
    if (dia && sesion.rol === 'admin') return editarViaje(null, { fecha: dia.dataset.dia });
  });

  /* Edición directa sobre la hoja: se guarda al salir de la celda */
  cont.addEventListener('focusout', e => {
    const cel = e.target.closest && e.target.closest('.cel[contenteditable]');
    if (!cel) return;
    const valor = cel.textContent.replace(/\s+/g, ' ').trim();
    if (valor === cel.dataset.original) return;
    if (editarCampoViaje(cel.dataset.id, cel.dataset.campo, valor)) {
      cel.dataset.original = valor;
      if (cel.dataset.campo === 'cliente') {                      // el color sigue al cliente
        cel.innerHTML = `<span class="punto" style="--c:${colorCliente(valor) || 'transparent'}"></span>${esc(valor)}`;
        renderLeyenda(viajesFiltrados());
      }
    }
  });
  cont.addEventListener('keydown', e => {
    const cel = e.target.closest && e.target.closest('.cel[contenteditable]');
    if (!cel) return;
    if (e.key === 'Enter') { e.preventDefault(); cel.blur(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      cel.textContent = cel.dataset.original;
      cel.blur();
    }
  });
  cont.addEventListener('change', e => {
    const sel = e.target.closest && e.target.closest('select[data-campo]');
    if (sel) editarCampoViaje(sel.dataset.id, sel.dataset.campo, sel.value);
  });
  cont.addEventListener('toggle', e => {
    const det = e.target.closest && e.target.closest('[data-dia-comp]');
    if (det) estadoUI.abrirCompletados[det.dataset.diaComp] = det.open;
  }, true);
}

const conPunto = (color, texto) => texto
  ? `<span style="display:inline-flex;align-items:center;gap:6px"><span class="punto" style="--c:${color}"></span>${esc(texto)}</span>`
  : '';

function tabla(cols, filas, accionesFn, vacio = 'Sin registros.') {
  if (!filas.length) return `<div class="empty">${esc(vacio)}</div>`;
  return `<table><thead><tr>${cols.map(c => `<th>${esc(c.t)}</th>`).join('')}${accionesFn ? '<th></th>' : ''}</tr></thead>
  <tbody>${filas.map(f => `<tr>${cols.map(c => `<td>${c.v(f) ?? ''}</td>`).join('')}${accionesFn ? `<td class="actions">${accionesFn(f)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}

/* =========================================================
   INVENTARIO (unidades)
   ========================================================= */
function camposUnidad(u = {}) {
  return [
    { k: 'numero', t: 'Número económico', valor: u.numero || '', req: true, ph: 'Ej. T-14 / AXL-1917' },
    { k: 'categoria', t: 'Categoría', tipo: 'select', opciones: CATEGORIAS, valor: u.categoria || 'Tractor', vacio: false },
    { k: 'placa', t: 'Placas (USA)', valor: u.placa || '' },
    { k: 'placaMx', t: 'Placas (México)', valor: u.placaMx || '' },
    { k: 'tipo', t: 'Tipo', tipo: 'select', opciones: DB.catalogos.tiposUnidad, valor: u.tipo || '', vacio: '— sin tipo —' },
    { k: 'estado', t: 'Estado', tipo: 'select', opciones: DB.catalogos.estadosUnidad, valor: u.estado || DB.catalogos.estadosUnidad[0], vacio: false },
    { k: 'marca', t: 'Marca', valor: u.marca || '' },
    { k: 'modelo', t: 'Modelo', valor: u.modelo || '' },
    { k: 'anio', t: 'Año', tipo: 'number', valor: u.anio || '' },
    { k: 'vin', t: 'VIN / serie', valor: u.vin || '' },
    { k: 'capacidad', t: 'Capacidad', valor: u.capacidad || '', ph: 'Ej. 24 ton / 53 ft' },
    { k: 'odometro', t: 'Odómetro', tipo: 'number', valor: u.odometro || '' },
    { k: 'ubicacion', t: 'Ubicación / patio', valor: u.ubicacion || '' },
    { k: 'seguro', t: 'Vence seguro', tipo: 'date', valor: u.seguro || '' },
    { k: 'verificacion', t: 'Vence verificación / DOT', tipo: 'date', valor: u.verificacion || '' },
    { k: 'proxServicio', t: 'Próximo servicio', tipo: 'date', valor: u.proxServicio || '' },
    { k: 'notas', t: 'Notas', tipo: 'textarea', valor: u.notas || '', ancho: 'full' }
  ];
}
function editarUnidad(id) {
  if (sesion.rol !== 'admin') return;
  const ex = id ? unidad(id) : null;
  abrirModal(ex ? `Unidad ${ex.numero || ''}` : 'Nueva unidad', formHTML(camposUnidad(ex || {})), [
    ...(ex ? [{ texto: 'Eliminar', clase: 'danger', accion: () => eliminarUnidad(ex.id) }] : []),
    { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
    { texto: 'Guardar', clase: 'primary', accion: () => {
      const d = leerForm();
      if (!d.numero && !d.placa) return toast('Pon al menos número económico o placas.');
      if (ex) Object.assign(ex, d);
      else DB.unidades.push(Object.assign({ id: uid() }, d));
      guardar(); cerrarModal(); render(); toast('Unidad guardada.');
    } }
  ]);
}
function eliminarUnidad(id) {
  const u = unidad(id);
  const usos = DB.viajes.filter(v => v.unidadId === id).length;
  confirmar('Eliminar unidad',
    `¿Eliminar la unidad ${u.numero || u.placa}?` + (usos ? ` Está asignada en ${usos} viaje(s); quedarán sin unidad.` : ''),
    () => {
      DB.unidades = DB.unidades.filter(x => x.id !== id);
      DB.viajes.forEach(v => { if (v.unidadId === id) v.unidadId = ''; });
      DB.plantillas.forEach(p => { if (p.unidadId === id) p.unidadId = ''; });
      guardar(); cerrarModal(); render(); toast('Unidad eliminada.');
    }, 'Eliminar');
}

function renderInventario() {
  const q = ($('#buscarUnidad').value || '').toLowerCase();
  const fe = $('#filtroEstadoUnidad').value;
  const fc = $('#filtroCategoria').value;
  const hoy = hoyISO();
  let filas = DB.unidades.filter(u => {
    if (fe && u.estado !== fe) return false;
    if (fc && (u.categoria || 'Tractor') !== fc) return false;
    if (!q) return true;
    return [u.numero, u.placa, u.placaMx, u.tipo, u.marca, u.modelo, u.vin, u.ubicacion, u.capacidad, u.notas]
      .join(' ').toLowerCase().includes(q);
  });
  const o = estadoUI.ordenUnidades;
  filas.sort((a, b) => String(a[o.col] ?? '').localeCompare(String(b[o.col] ?? ''), 'es', { numeric: true }) * (o.asc ? 1 : -1));

  const vence = f => {
    if (!f) return '';
    const dias = Math.round((fromISO(f) - fromISO(hoy)) / 86400000);
    const cls = dias < 0 ? 'bad' : dias <= 30 ? 'warn' : '';
    return `<span class="chip ${cls}">${fechaCorta(f)}</span>`;
  };
  const cols = [
    { t: 'Número', v: u => `<strong>${esc(u.numero || '—')}</strong>` },
    { t: 'Categoría', v: u => `<span class="chip ${esRemolque(u) ? '' : 'info'}">${esc(u.categoria || 'Tractor')}</span>` },
    { t: 'Tipo', v: u => esc(u.tipo) },
    { t: 'Placas USA', v: u => esc(u.placa) },
    { t: 'Placas MX', v: u => esc(u.placaMx) },
    { t: 'Marca / modelo', v: u => esc([u.marca, u.modelo, u.anio].filter(Boolean).join(' ')) },
    { t: 'VIN', v: u => esc(u.vin) },
    { t: 'Operador', v: u => conPunto(colorUnidad(u.id), (DB.conductores.find(c => c.unidadId === u.id) || {}).nombre || '') },
    { t: 'Seguro', v: u => vence(u.seguro) },
    { t: 'Servicio', v: u => vence(u.proxServicio) },
    { t: 'Estado', v: u => `<span class="chip ${claseEstado(u.estado)}">${esc(u.estado || '')}</span>` }
  ];
  const cont = $('#tablaUnidades');
  cont.innerHTML = `<div class="tbl-wrap">${tabla(cols, filas,
    u => `<button class="btn mini" data-ver-unidad="${u.id}">Ver</button>` +
      (sesion.rol === 'admin' ? ` <button class="btn mini" data-editar-unidad="${u.id}">Editar</button>` : ''),
    'No hay unidades. Importa tu inventario en CSV o agrégalas una por una.')}</div>
    <p class="hint">${filas.length} de ${DB.unidades.length} unidad(es)</p>`;
  cont.onclick = e => {
    const ed = e.target.closest('[data-editar-unidad]');
    if (ed) return editarUnidad(ed.dataset.editarUnidad);
    const ver = e.target.closest('[data-ver-unidad]');
    if (ver) return verUnidad(ver.dataset.verUnidad);
  };
}

function verUnidad(id) {
  const u = unidad(id);
  if (!u) return;
  const prox = ordenarViajes(DB.viajes.filter(v => (v.unidadId === id || v.remolqueId === id) && v.fecha >= hoyISO())).slice(0, 6);
  const fila = (t, d) => d ? `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>` : '';
  abrirModal(`Unidad ${u.numero || u.placa || ''}`,
    `<div class="detalle"><dl>
      <dt>Estado</dt><dd><span class="chip ${claseEstado(u.estado)}">${esc(u.estado || '—')}</span></dd>
      ${fila('Categoría', u.categoria || 'Tractor')}${fila('Tipo', u.tipo)}
      ${fila('Placas USA', u.placa)}${fila('Placas México', u.placaMx)}
      ${fila('Operador asignado', (DB.conductores.find(c => c.unidadId === u.id) || {}).nombre || '')}
      ${fila('Marca / modelo', [u.marca, u.modelo, u.anio].filter(Boolean).join(' '))}
      ${fila('VIN', u.vin)}${fila('Capacidad', u.capacidad)}${fila('Odómetro', u.odometro)}
      ${fila('Ubicación', u.ubicacion)}${fila('Vence seguro', u.seguro && fechaCorta(u.seguro))}
      ${fila('Vence verificación', u.verificacion && fechaCorta(u.verificacion))}
      ${fila('Próximo servicio', u.proxServicio && fechaCorta(u.proxServicio))}
      ${fila('Notas', u.notas)}
    </dl></div>
    <h3 style="margin-top:14px">Próximos viajes</h3>
    ${prox.length ? '<ul>' + prox.map(v => `<li>${fechaCorta(v.fecha)} — ${esc(v.origen)} → ${esc(v.destino)}</li>`).join('') + '</ul>'
      : '<p class="muted">Sin viajes programados.</p>'}`,
    [{ texto: 'Cerrar', clase: 'ghost', accion: cerrarModal },
     { texto: 'Editar', clase: 'primary', adminOnly: true, accion: () => editarUnidad(id) }]);
}

/* =========================================================
   CONDUCTORES
   ========================================================= */
function camposConductor(c = {}) {
  return [
    { k: 'nombre', t: 'Nombre completo', valor: c.nombre || '', req: true, ancho: 'full' },
    { k: 'telefono', t: 'Teléfono', valor: c.telefono || '' },
    { k: 'estado', t: 'Estado', tipo: 'select', opciones: DB.catalogos.estadosConductor, valor: c.estado || DB.catalogos.estadosConductor[0], vacio: false },
    { k: 'licencia', t: 'Licencia', valor: c.licencia || '' },
    { k: 'tipoLicencia', t: 'Tipo de licencia', valor: c.tipoLicencia || '', ph: 'Ej. Federal E / CDL-A' },
    { k: 'venceLicencia', t: 'Vence licencia', tipo: 'date', valor: c.venceLicencia || '' },
    { k: 'venceMedico', t: 'Vence examen médico', tipo: 'date', valor: c.venceMedico || '' },
    { k: 'unidadId', t: 'Tractor asignado', tipo: 'select', opciones: opcionesUnidad('Tractor'), valor: c.unidadId || '', vacio: '— sin asignar —' },
    { k: 'base', t: 'Base / patio', valor: c.base || '' },
    { k: 'color', t: 'Color del operador y su unidad', tipo: 'color', valor: c.color || '', ancho: 'full' },
    { k: 'notas', t: 'Notas', tipo: 'textarea', valor: c.notas || '', ancho: 'full' }
  ];
}
function editarConductor(id) {
  if (sesion.rol !== 'admin') return;
  const ex = id ? conductor(id) : null;
  abrirModal(ex ? ex.nombre : 'Nuevo conductor', formHTML(camposConductor(ex || {})), [
    ...(ex ? [{ texto: 'Eliminar', clase: 'danger', accion: () => eliminarConductor(ex.id) }] : []),
    { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
    { texto: 'Guardar', clase: 'primary', accion: () => {
      const d = leerForm();
      if (!d.nombre) return toast('El nombre es obligatorio.');
      if (ex) Object.assign(ex, d); else DB.conductores.push(Object.assign({ id: uid() }, d));
      guardar(); cerrarModal(); render(); toast('Conductor guardado.');
    } }
  ]);
}
function eliminarConductor(id) {
  const c = conductor(id);
  const usos = DB.viajes.filter(v => v.conductorId === id).length;
  confirmar('Eliminar conductor',
    `¿Eliminar a ${c.nombre}?` + (usos ? ` Está asignado en ${usos} viaje(s); quedarán sin conductor.` : ''),
    () => {
      DB.conductores = DB.conductores.filter(x => x.id !== id);
      DB.viajes.forEach(v => { if (v.conductorId === id) v.conductorId = ''; });
      DB.plantillas.forEach(p => { if (p.conductorId === id) p.conductorId = ''; });
      guardar(); cerrarModal(); render(); toast('Conductor eliminado.');
    }, 'Eliminar');
}
function renderConductores() {
  const q = ($('#buscarConductor').value || '').toLowerCase();
  const fe = $('#filtroEstadoConductor').value;
  const hoy = hoyISO();
  let filas = DB.conductores.filter(c => {
    if (fe && c.estado !== fe) return false;
    if (!q) return true;
    return [c.nombre, c.licencia, c.telefono, c.base, c.tipoLicencia, c.notas].join(' ').toLowerCase().includes(q);
  });
  const o = estadoUI.ordenConductores;
  filas.sort((a, b) => String(a[o.col] ?? '').localeCompare(String(b[o.col] ?? ''), 'es', { numeric: true }) * (o.asc ? 1 : -1));
  const vence = f => {
    if (!f) return '';
    const dias = Math.round((fromISO(f) - fromISO(hoy)) / 86400000);
    return `<span class="chip ${dias < 0 ? 'bad' : dias <= 30 ? 'warn' : ''}">${fechaCorta(f)}</span>`;
  };
  const cols = [
    { t: 'Nombre', v: c => conPunto(c.color || colorAuto(c.nombre), c.nombre) },
    { t: 'Teléfono', v: c => esc(c.telefono) },
    { t: 'Licencia', v: c => esc([c.licencia, c.tipoLicencia].filter(Boolean).join(' · ')) },
    { t: 'Vence licencia', v: c => vence(c.venceLicencia) },
    { t: 'Vence médico', v: c => vence(c.venceMedico) },
    { t: 'Unidad', v: c => esc(nombreUnidad(c.unidadId)) },
    { t: 'Base', v: c => esc(c.base) },
    { t: 'Estado', v: c => `<span class="chip ${claseEstado(c.estado)}">${esc(c.estado || '')}</span>` }
  ];
  const cont = $('#tablaConductores');
  cont.innerHTML = `<div class="tbl-wrap">${tabla(cols, filas,
    c => sesion.rol === 'admin' ? `<button class="btn mini" data-editar-conductor="${c.id}">Editar</button>` : '',
    'No hay conductores registrados.')}</div>
    <p class="hint">${filas.length} de ${DB.conductores.length} conductor(es)</p>`;
  cont.onclick = e => {
    const ed = e.target.closest('[data-editar-conductor]');
    if (ed) editarConductor(ed.dataset.editarConductor);
  };
}

/* =========================================================
   CLIENTES (directorio de direcciones de entrega)
   ========================================================= */
function editarCliente(id) {
  if (sesion.rol !== 'admin') return;
  const ex = id ? DB.clientes.find(c => c.id === id) : null;
  const c = ex || {};
  const campos = [
    { k: 'nombre', t: 'Nombre del cliente', valor: c.nombre || '', req: true, ancho: 'full' },
    { k: 'direccion', t: 'Dirección', valor: c.direccion || '', ancho: 'full' },
    { k: 'ciudad', t: 'Ciudad', valor: c.ciudad || '' },
    { k: 'estado', t: 'Estado', valor: c.estado || '', ph: 'CA, TX, AZ…',
      lista: [...new Set(DB.clientes.map(x => x.estado))].filter(Boolean) },
    { k: 'cp', t: 'Código postal', valor: c.cp || '' },
    { k: 'contacto', t: 'Contacto', valor: c.contacto || '' },
    { k: 'telefono', t: 'Teléfono', valor: c.telefono || '' },
    { k: 'horario', t: 'Horario de recibo', valor: c.horario || '', ph: 'Ej. 7:00–15:00' },
    { k: 'color', t: 'Color en el schedule', tipo: 'color', valor: c.color || '', ancho: 'full' },
    { k: 'notas', t: 'Notas', tipo: 'textarea', valor: c.notas || '', ancho: 'full' }
  ];
  abrirModal(ex ? c.nombre : 'Nuevo cliente', formHTML(campos), [
    ...(ex ? [{ texto: 'Eliminar', clase: 'danger', accion: () => {
      confirmar('Eliminar cliente', `¿Eliminar a ${ex.nombre} del directorio?`, () => {
        DB.clientes = DB.clientes.filter(x => x.id !== ex.id);
        guardar(); cerrarModal(); render(); toast('Cliente eliminado.');
      }, 'Eliminar');
    } }] : []),
    { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
    { texto: 'Guardar', clase: 'primary', accion: () => {
      const d = leerForm();
      if (!d.nombre) return toast('El nombre del cliente es obligatorio.');
      if (ex) Object.assign(ex, d); else DB.clientes.push(Object.assign({ id: uid() }, d));
      guardar(); cerrarModal(); render(); toast('Cliente guardado.');
    } }
  ]);
}

function renderClientes() {
  const q = ($('#buscarCliente').value || '').toLowerCase();
  const fe = $('#filtroEstadoUS').value;
  const filas = DB.clientes.filter(c => {
    if (fe && c.estado !== fe) return false;
    if (!q) return true;
    return [c.nombre, c.direccion, c.ciudad, c.estado, c.contacto, c.telefono, c.notas]
      .join(' ').toLowerCase().includes(q);
  }).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  const cols = [
    { t: 'Cliente', v: c => conPunto(c.color || colorAuto(c.nombre), c.nombre) },
    { t: 'Dirección', v: c => esc(c.direccion) },
    { t: 'Ciudad', v: c => esc(c.ciudad) },
    { t: 'Estado', v: c => c.estado ? `<span class="chip">${esc(c.estado)}</span>` : '' },
    { t: 'Contacto', v: c => esc([c.contacto, c.telefono].filter(Boolean).join(' · ')) },
    { t: 'Horario', v: c => esc(c.horario) },
    { t: 'Notas', v: c => esc(c.notas) }
  ];
  const cont = $('#tablaClientes');
  cont.innerHTML = `<div class="tbl-wrap">${tabla(cols, filas,
    c => sesion.rol === 'admin' ? `<button class="btn mini" data-editar-cliente="${c.id}">Editar</button>` : '',
    'El directorio está vacío. Importa tu lista de clientes en CSV.')}</div>
    <p class="hint">${filas.length} de ${DB.clientes.length} cliente(s)</p>`;
  cont.onclick = e => {
    const ed = e.target.closest('[data-editar-cliente]');
    if (ed) editarCliente(ed.dataset.editarCliente);
  };
}

function importarClientes(texto) {
  const { registros } = deCSV(texto);
  if (!registros.length) return toast('El archivo no tiene filas de datos.');
  let nuevos = 0, actualizados = 0;
  registros.forEach(r => {
    const nombre = campoCSV(r, 'nombre', 'cliente', 'empresa', 'company', 'name', 'customer');
    if (!nombre) return;
    const datos = {
      nombre,
      direccion: campoCSV(r, 'direccion', 'domicilio', 'address', 'street'),
      ciudad: campoCSV(r, 'ciudad', 'city'),
      estado: campoCSV(r, 'estado', 'state'),
      cp: campoCSV(r, 'cp', 'codigo postal', 'zip', 'zipcode'),
      contacto: campoCSV(r, 'contacto', 'contact'),
      telefono: campoCSV(r, 'telefono', 'tel', 'phone'),
      horario: campoCSV(r, 'horario', 'hours', 'receiving'),
      color: campoCSV(r, 'color'),
      notas: campoCSV(r, 'notas', 'observaciones', 'notes')
    };
    Object.keys(datos).forEach(k => { if (datos[k] === '') delete datos[k]; });
    const clave = (n, ciu) => (String(n) + '|' + String(ciu || '')).toLowerCase();
    const ex = DB.clientes.find(c => clave(c.nombre, c.ciudad) === clave(nombre, datos.ciudad));
    if (ex) { Object.assign(ex, datos); actualizados++; }
    else { DB.clientes.push(Object.assign({ id: uid(), nombre }, datos)); nuevos++; }
  });
  guardar(); render();
  toast(`Clientes: ${nuevos} nuevo(s), ${actualizados} actualizado(s).`);
}

/* =========================================================
   PLANTILLAS
   ========================================================= */
function editarPlantilla(id) {
  if (sesion.rol !== 'admin') return;
  const ex = id ? DB.plantillas.find(p => p.id === id) : null;
  const p = ex || {};
  const dias = Array.isArray(p.dias) ? p.dias.map(String) : [];
  const checks = `<div class="full"><label>Días de la semana</label><div class="dias-check">${
    DIAS.map((d, i) => `<label><input type="checkbox" name="dias" value="${i}" ${dias.includes(String(i)) ? 'checked' : ''}> ${d}</label>`).join('')
  }</div></div>`;
  const campos = [
    { k: 'nombre', t: 'Nombre de la plantilla', valor: p.nombre || '', req: true, ph: 'Ej. Ruta diaria Hermosillo–Nogales', ancho: 'full' },
    { k: 'origen', t: 'Origen', valor: p.origen || '', req: true, lista: lugares() },
    { k: 'destino', t: 'Destino', valor: p.destino || '', req: true, lista: lugares() },
    { k: 'cliente', t: 'Cliente', valor: p.cliente || '', lista: nombresCliente() },
    { k: 'stop', t: 'Stop', valor: p.stop || '' },
    { k: 'estado', t: 'Estado inicial', tipo: 'select', opciones: DB.catalogos.estadosViaje, valor: p.estado || DB.catalogos.estadosViaje[0], vacio: false },
    { k: 'unidadId', t: 'Tractor', tipo: 'select', opciones: opcionesUnidad('Tractor'), valor: p.unidadId || '', vacio: '— sin asignar —' },
    { k: 'remolqueId', t: 'Remolque / caja', tipo: 'select', opciones: opcionesUnidad('Remolque'), valor: p.remolqueId || '', vacio: '— sin asignar —' },
    { k: 'conductorId', t: 'Conductor', tipo: 'select', opciones: opcionesConductor(), valor: p.conductorId || '', vacio: '— sin asignar —' },
    { k: 'carga', t: 'Carga', valor: p.carga || '' },
    { k: 'tarifa', t: 'Tarifa ($)', tipo: 'number', paso: '0.01', valor: p.tarifa || '' },
    { k: 'notas', t: 'Notas', tipo: 'textarea', valor: p.notas || '', ancho: 'full' }
  ];
  abrirModal(ex ? 'Editar plantilla' : 'Nueva plantilla',
    `<form id="modalForm"><div class="form-grid">${campos.map(campo).join('')}${checks}</div></form>`, [
      ...(ex ? [{ texto: 'Eliminar', clase: 'danger', accion: () => {
        confirmar('Eliminar plantilla', `¿Eliminar "${ex.nombre}"? Los viajes ya generados no se borran.`, () => {
          DB.plantillas = DB.plantillas.filter(x => x.id !== ex.id);
          guardar(); cerrarModal(); render(); toast('Plantilla eliminada.');
        }, 'Eliminar');
      } }] : []),
      { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
      { texto: 'Guardar', clase: 'primary', accion: () => {
        const d = leerForm();
        if (!d.nombre) return toast('Ponle un nombre a la plantilla.');
        if (!d.dias || !d.dias.length) return toast('Elige al menos un día de la semana.');
        if (ex) Object.assign(ex, d); else DB.plantillas.push(Object.assign({ id: uid() }, d));
        guardar(); cerrarModal(); render(); toast('Plantilla guardada.');
      } }
    ]);
}

function renderPlantillas() {
  const cols = [
    { t: 'Plantilla', v: p => `<strong>${esc(p.nombre)}</strong>` },
    { t: 'Días', v: p => esc((p.dias || []).map(i => DIAS_CORTO[i]).join(', ')) },
    { t: 'Ruta', v: p => esc(`${p.origen || '?'} → ${p.destino || '?'}`) },
    { t: 'Cliente', v: p => esc(p.cliente) },
    { t: 'Unidad', v: p => esc(nombreUnidad(p.unidadId)) },
    { t: 'Conductor', v: p => esc(nombreConductor(p.conductorId)) }
  ];
  const cont = $('#tablaPlantillas');
  cont.innerHTML = `<div class="tbl-wrap">${tabla(cols, DB.plantillas,
    p => sesion.rol === 'admin'
      ? `<button class="btn mini" data-generar="${p.id}">Generar</button> <button class="btn mini" data-editar-plantilla="${p.id}">Editar</button>`
      : '',
    'Todavía no hay plantillas. Crea una para repetir rutas fijas cada semana.')}</div>`;
  cont.onclick = e => {
    const ed = e.target.closest('[data-editar-plantilla]');
    if (ed) return editarPlantilla(ed.dataset.editarPlantilla);
    const g = e.target.closest('[data-generar]');
    if (g) return dialogoGenerar(g.dataset.generar);
  };
}

/* Generar viajes a partir de plantillas */
function dialogoGenerar(plantillaId = '') {
  if (sesion.rol !== 'admin') return;
  if (!DB.plantillas.length) {
    return abrirModal('Sin plantillas', '<p>Primero crea una plantilla en la pestaña <b>Plantillas</b>.</p>',
      [{ texto: 'Cerrar', clase: 'ghost', accion: cerrarModal }]);
  }
  const ini = inicioSemana(hoyISO());
  const campos = [
    { k: 'plantillaId', t: 'Plantilla', tipo: 'select', valor: plantillaId, vacio: '— todas las plantillas —',
      opciones: DB.plantillas.map(p => ({ v: p.id, t: p.nombre })), ancho: 'full' },
    { k: 'desde', t: 'Desde', tipo: 'date', valor: ini },
    { k: 'hasta', t: 'Hasta', tipo: 'date', valor: addDias(ini, 27) }
  ];
  abrirModal('Generar viajes desde plantilla',
    formHTML(campos) + '<p class="hint">No se duplican viajes: si ya existe uno igual (misma plantilla, fecha y hora) se omite.</p>',
    [{ texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
     { texto: 'Generar', clase: 'primary', accion: () => {
       const d = leerForm();
       if (!d.desde || !d.hasta || d.hasta < d.desde) return toast('Revisa el rango de fechas.');
       const plantillas = d.plantillaId ? DB.plantillas.filter(p => p.id === d.plantillaId) : DB.plantillas;
       let creados = 0, omitidos = 0;
       for (let f = d.desde; f <= d.hasta; f = addDias(f, 1)) {
         const dow = dowLunes(f);
         plantillas.forEach(p => {
           if (!(p.dias || []).map(String).includes(String(dow))) return;
           const yaExiste = DB.viajes.some(v => v.plantillaId === p.id && v.fecha === f);
           if (yaExiste) { omitidos++; return; }
           DB.viajes.push({
             id: uid(), plantillaId: p.id, fecha: f,
             origen: p.origen || '', destino: p.destino || '', cliente: p.cliente || '',
             unidadId: p.unidadId || '', remolqueId: p.remolqueId || '', conductorId: p.conductorId || '',
             carga: p.carga || '', tarifa: p.tarifa || '', notas: p.notas || '',
             stop: p.stop || '', facturas: '', estatus: {},
             estado: p.estado || DB.catalogos.estadosViaje[0],
             creado: new Date().toISOString()
           });
           creados++;
         });
       }
       guardar(); cerrarModal(); render();
       toast(`${creados} viaje(s) generados${omitidos ? `, ${omitidos} ya existían` : ''}.`);
     } }]);
}

/* =========================================================
   CAPTURA RÁPIDA — escribir un viaje en una línea
   ========================================================= */
const sinAcentos = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Convierte texto libre en un viaje. Lo que no reconoce lo deja vacío. */
function interpretarLinea(texto, fechaBase = hoyISO()) {
  let t = ' ' + String(texto).replace(/\s+/g, ' ').trim() + ' ';
  const v = { fecha: '', horaSalida: '', horaLlegada: '', origen: '', destino: '', cliente: '',
    unidadId: '', remolqueId: '', conductorId: '', stop: '', facturas: '', notas: '', estatus: {}, _texto: texto };
  const sacar = re => { const m = t.match(re); if (m) t = t.replace(m[0], ' '); return m; };

  /* --- unidades por número económico --- */
  DB.unidades.forEach(u => {
    if (!u.numero) return;
    const clave = esRemolque(u) ? 'remolqueId' : 'unidadId';
    if (v[clave]) return;
    const m = sacar(new RegExp('(?:^|[\\s,;(])' + escRe(u.numero) + '(?=[\\s,;.)]|$)', 'i'));
    if (m) v[clave] = u.id;
  });

  /* --- operador por nombre o apellido --- */
  const apellidos = {};
  DB.conductores.forEach(c => sinAcentos(c.nombre).split(' ').filter(p => p.length > 3)
    .forEach(p => { (apellidos[p] = apellidos[p] || []).push(c.id); }));
  for (const c of DB.conductores) {
    if (v.conductorId) break;
    if (sinAcentos(t).includes(sinAcentos(c.nombre))) {
      v.conductorId = c.id;
      t = t.replace(new RegExp(escRe(c.nombre), 'i'), ' ');
    }
  }
  if (!v.conductorId) {
    for (const [palabra, ids] of Object.entries(apellidos)) {
      if (ids.length !== 1) continue;                     // solo si el apellido es único
      const m = sacar(new RegExp('(?:^|\\s)' + escRe(palabra) + '(?=\\s|$)', 'i'));
      if (m) { v.conductorId = ids[0]; break; }
    }
  }

  /* --- cliente del directorio ---
     Se deja una marca en su lugar para no romper la ruta: el cliente puede
     ser justamente el destino ("Ontario a NPT Houston"). */
  const MARCA = '';
  for (const c of DB.clientes) {
    if (!c.nombre || c.nombre.length < 4) continue;
    if (sinAcentos(t).includes(sinAcentos(c.nombre))) {
      v.cliente = c.nombre;
      t = t.replace(new RegExp(escRe(c.nombre), 'i'), ' ' + MARCA + ' ');
      break;
    }
  }

  /* --- fecha --- */
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  if (sacar(/\bpasado\s+ma[nñ]ana\b/i)) v.fecha = addDias(fechaBase, 2);
  else if (sacar(/\bma[nñ]ana\b/i)) v.fecha = addDias(fechaBase, 1);
  else if (sacar(/\bhoy\b/i)) v.fecha = fechaBase;
  if (!v.fecha) {
    const iso = sacar(/\b(\d{4}-\d{1,2}-\d{1,2})\b/);
    if (iso) v.fecha = normalizarFecha(iso[1]);
  }
  if (!v.fecha) {
    const dm = sacar(/\b(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\b/);
    if (dm) {
      v.fecha = /[/.-]\d{2,4}$/.test(dm[1].replace(/^\d{1,2}[/.-]\d{1,2}/, ''))
        ? normalizarFecha(dm[1]) : normalizarFecha(dm[1] + '/' + fromISO(fechaBase).getFullYear());
    }
  }
  if (!v.fecha) {
    const dow = dias.findIndex(d => new RegExp('\\b' + d.slice(0, 3) + '[a-zé]*\\b', 'i').test(sinAcentos(t)));
    if (dow >= 0) {
      sacar(new RegExp('\\b' + dias[dow].slice(0, 3) + '[a-zéA-ZÉ]*\\b', 'i'));
      let f = fechaBase;
      for (let i = 0; i < 7; i++) { if (fromISO(f).getDay() === dow && (i > 0 || true)) break; f = addDias(f, 1); }
      while (fromISO(f).getDay() !== dow) f = addDias(f, 1);
      v.fecha = f;
    }
  }
  if (!v.fecha) v.fecha = fechaBase;

  /* --- horas (necesitan ':' o am/pm/hrs para no confundirse con otros números) --- */
  const horas = [];
  t = t.replace(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|hrs?|horas)\b|\b(\d{1,2}):(\d{2})\b/gi,
    (todo, h1, m1, suf, h2, m2) => {
      let h = parseInt(h1 ?? h2, 10);
      const min = (m1 ?? m2 ?? '00');
      const s = (suf || '').toLowerCase().replace(/\./g, '');
      if (s.startsWith('p') && h < 12) h += 12;
      if (s.startsWith('a') && h === 12) h = 0;
      if (h <= 23) horas.push(`${pad(h)}:${pad(parseInt(min, 10))}`);
      return ' ';
    });
  v.horaSalida = horas[0] || '';
  v.horaLlegada = horas[1] || '';

  /* --- ruta --- */
  const limpiar = s => String(s || '').replace(/^[\s,;.:–-]+|[\s,;.:–-]+$/g, '').trim();
  let resto = limpiar(t.replace(/\s+/g, ' '));
  const flecha = resto.match(/^(.*?)\s*(?:->|-->|→|=>)\s*(.*)$/);
  const conA = resto.match(/^(?:de\s+)?(.+?)\s+(?:a|hacia|hasta|para)\s+(.+)$/i);
  if (flecha) { v.origen = limpiar(flecha[1]); v.destino = limpiar(flecha[2]); }
  else if (conA) { v.origen = limpiar(conA[1]); v.destino = limpiar(conA[2]); }
  else v.destino = resto;

  /* devuelve el nombre del cliente a su lugar; si quedó colgando al final
     de la ruta (", Ford") se quita para no repetirlo */
  const restaurar = s => limpiar(String(s || '').split(MARCA).join(v.cliente || '')
    .replace(new RegExp('[,;]\\s*' + escRe(v.cliente || '\0') + '\\s*$', 'i'), ''));
  v.origen = restaurar(v.origen);
  v.destino = restaurar(v.destino);
  if (!v.destino && v.cliente) v.destino = v.cliente;

  /* --- rellenos automáticos --- */
  if (v.unidadId && !v.conductorId) {
    const op = DB.conductores.find(c => c.unidadId === v.unidadId);
    if (op) v.conductorId = op.id;
  }
  if (!v.unidadId && v.conductorId) {
    const c = conductor(v.conductorId);
    if (c && c.unidadId) v.unidadId = c.unidadId;
  }
  if (!v.cliente && v.destino) {
    const c = DB.clientes.find(x => sinAcentos(x.nombre) === sinAcentos(v.destino));
    if (c) v.cliente = c.nombre;
  }
  v.estado = DB.catalogos.estadosViaje[0];
  return v;
}

/* =========================================================
   VISTA PREVIA antes de agregar viajes (captura rápida y foto)
   ========================================================= */
let previoLista = [];
function vistaPrevia(viajes, titulo, subtitulo = '') {
  previoLista = viajes.filter(Boolean);
  if (!previoLista.length) {
    return abrirModal(titulo, '<p>No se reconoció ningún viaje. Revisa el texto o la foto e inténtalo de nuevo.</p>',
      [{ texto: 'Cerrar', clase: 'ghost', accion: cerrarModal }]);
  }
  const pinta = () => {
    const filas = previoLista.map((v, i) => {
      const faltan = [];
      if (!v.origen) faltan.push('origen');
      if (!v.destino) faltan.push('destino');
      if (!v.unidadId) faltan.push('tractor');
      if (!v.conductorId) faltan.push('operador');
      return `<tr>
        <td>${esc(fechaCorta(v.fecha))}</td>
        <td>${esc(v.origen || '—')} → ${esc(v.destino || '—')}</td>
        <td>${v.cliente ? conPunto(colorCliente(v.cliente), v.cliente) : '—'}</td>
        <td>${esc(nombreUnidad(v.unidadId) || '—')}</td>
        <td>${v.conductorId ? conPunto(colorConductor(v.conductorId), nombreConductor(v.conductorId)) : '—'}</td>
        <td>${faltan.length ? `<span class="aviso">falta ${esc(faltan.join(', '))}</span>` : '<span class="chip ok">listo</span>'}</td>
        <td class="actions"><button class="btn mini" data-editar-previo="${i}">Editar</button>
          <button class="btn mini" data-quitar-previo="${i}">Quitar</button></td>
      </tr>`;
    }).join('');
    $('#modalBody').innerHTML = `${subtitulo ? `<p class="muted">${esc(subtitulo)}</p>` : ''}
      <div class="previo tbl-wrap"><table>
        <thead><tr><th>Fecha</th><th>Ruta</th><th>Cliente</th><th>Tractor</th><th>Operador</th><th>Revisar</th><th></th></tr></thead>
        <tbody>${filas}</tbody></table></div>
      <p class="hint">Lo que falte se puede completar aquí o después, desde el schedule.</p>`;
    $('#modalFoot').firstChild && ($('#modalFoot').lastChild.textContent = `Agregar ${previoLista.length} viaje(s)`);
  };

  abrirModal(titulo, '', [
    { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
    { texto: `Agregar ${previoLista.length} viaje(s)`, clase: 'primary', accion: () => {
      previoLista.forEach(v => {
        const { _texto, ...datos } = v;
        DB.viajes.push(Object.assign({ id: uid(), creado: new Date().toISOString() }, datos));
      });
      const n = previoLista.length;
      previoLista = [];
      guardar(); cerrarModal(); render();
      toast(`${n} viaje(s) agregados al schedule.`);
    } }
  ]);
  pinta();

  $('#modalBody').onclick = e => {
    const q = e.target.closest('[data-quitar-previo]');
    if (q) {
      previoLista.splice(+q.dataset.quitarPrevio, 1);
      if (!previoLista.length) return cerrarModal();
      return pinta();
    }
    const ed = e.target.closest('[data-editar-previo]');
    if (ed) {
      const i = +ed.dataset.editarPrevio;
      const guardados = previoLista.slice();
      abrirModal('Revisar viaje', formHTML(camposViaje(guardados[i])), [
        { texto: 'Regresar', clase: 'ghost', accion: () => vistaPrevia(guardados, titulo, subtitulo) },
        { texto: 'Aplicar', clase: 'primary', accion: () => {
          guardados[i] = Object.assign({}, guardados[i], leerForm());
          vistaPrevia(guardados, titulo, subtitulo);
        } }
      ]);
    }
  };
}

/* Captura de una línea, desde la barra del schedule */
function capturaRapida() {
  const campo = $('#capturaRapida');
  const texto = campo.value.trim();
  if (!texto) return;
  const v = interpretarLinea(texto);
  campo.value = '';
  vistaPrevia([v], 'Revisar el viaje capturado',
    'Esto es lo que se entendió de lo que escribiste. Corrige lo que haga falta antes de agregarlo.');
}

/* Pegar una lista completa (de Excel, WhatsApp o correo): una línea por viaje */
function dialogoPegarTexto() {
  if (sesion.rol !== 'admin') return;
  abrirModal('Pegar una lista de viajes',
    `<p>Pega aquí tu lista: <b>un viaje por renglón</b>. Se reconocen fechas, horas, unidades, operadores y clientes que ya estén capturados.</p>
     <form id="modalForm"><label>Lista de viajes
       <textarea name="texto" style="min-height:180px" placeholder="lunes 6:00 am T-14 Ontario a Phoenix, NPT Ontario
martes 5:30 T-15 Hermosillo a Nogales, Ford
15/08 07:00 T-19 Guaymas a Obregón"></textarea></label></form>`,
    [{ texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
     { texto: 'Interpretar', clase: 'primary', accion: () => {
       const lineas = (leerForm().texto || '').split('\n').map(l => l.trim()).filter(Boolean);
       if (!lineas.length) return toast('No hay nada que interpretar.');
       vistaPrevia(lineas.map(l => interpretarLinea(l)), 'Revisar los viajes de la lista',
         `Se interpretaron ${lineas.length} renglón(es).`);
     } }]);
}

/* =========================================================
   LECTURA DE FOTOS Y CAPTURAS DE PANTALLA CON IA
   ========================================================= */
const CLAVE_API = 'axl_api_key';
const MODELO_IA = 'claude-opus-5';

const ESQUEMA_VIAJES = {
  type: 'object',
  properties: {
    viajes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'AAAA-MM-DD. Si la imagen no trae año, usa el año en curso.' },
          horaSalida: { type: 'string', description: 'HH:MM en 24 horas, o cadena vacía.' },
          horaLlegada: { type: 'string', description: 'HH:MM en 24 horas, o cadena vacía.' },
          origen: { type: 'string' },
          destino: { type: 'string' },
          cliente: { type: 'string', description: 'Nombre exacto del directorio si corresponde.' },
          unidad: { type: 'string', description: 'Número económico del tractor, tal como aparece en el inventario.' },
          remolque: { type: 'string', description: 'Número de la caja o plataforma.' },
          conductor: { type: 'string', description: 'Nombre completo del operador, tal como aparece en la lista.' },
          carga: { type: 'string' },
          referencia: { type: 'string' },
          notas: { type: 'string' }
        },
        required: ['fecha', 'horaSalida', 'horaLlegada', 'origen', 'destino', 'cliente',
          'unidad', 'remolque', 'conductor', 'carga', 'referencia', 'notas'],
        additionalProperties: false
      }
    },
    observaciones: { type: 'string', description: 'Qué no se pudo leer con seguridad.' }
  },
  required: ['viajes', 'observaciones'],
  additionalProperties: false
};

function promptIA() {
  const lista = (arr, f) => arr.map(f).filter(Boolean).join(' | ') || '(ninguno)';
  return `Eres el auxiliar de dispatch de ${DB.empresa.nombre || 'una compañía de transportes'}.
En la imagen viene un schedule de viajes (puede ser una foto, una captura de pantalla, una hoja de Excel o una lista escrita a mano).
Extrae TODOS los viajes que aparezcan, uno por renglón de la imagen.

Reglas:
- La fecha de hoy es ${hoyISO()} (${fechaLarga(hoyISO())}). Si la imagen indica solo día y mes, usa el año que corresponda a esa fecha más cercana.
- Las horas van en formato de 24 horas (06:00, 18:30). Si no hay hora, deja la cadena vacía.
- Para unidad, remolque, conductor y cliente usa EXACTAMENTE los nombres de las listas de abajo cuando reconozcas a cuál se refiere. Si no corresponde a ninguno, copia lo que dice la imagen.
- Nunca inventes datos que no estén en la imagen: si un campo no aparece, déjalo como cadena vacía.
- Si la imagen no contiene ningún viaje, devuelve la lista vacía y explícalo en observaciones.

Tractores: ${lista(DB.unidades.filter(u => !esRemolque(u)), u => u.numero)}
Remolques: ${lista(DB.unidades.filter(esRemolque), u => u.numero)}
Operadores: ${lista(DB.conductores, c => c.nombre)}
Clientes: ${lista(DB.clientes, c => c.nombre)}`;
}

/* Reduce la imagen si viene enorme, para no gastar de más */
function prepararImagen(dataUrl, maxLado = 2200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const lado = Math.max(img.width, img.height);
      if (lado <= maxLado) {
        const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
        return m ? resolve({ tipo: m[1], datos: m[2] }) : reject(new Error('Formato de imagen no reconocido.'));
      }
      const escala = maxLado / lado;
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      const salida = lienzo.toDataURL('image/jpeg', 0.92);
      resolve({ tipo: 'image/jpeg', datos: salida.split(',')[1] });
    };
    img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
    img.src = dataUrl;
  });
}

/* Llamada a la API de Claude. Se hace con fetch porque la página no usa
   empaquetador y el SDK oficial no se puede cargar en un archivo suelto. */
async function pedirLecturaIA(dataUrl) {
  const llave = localStorage.getItem(CLAVE_API);
  if (!llave) throw new Error('Falta la llave de API. Configúrala en "Datos y Ajustes".');
  const img = await prepararImagen(dataUrl);
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': llave,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODELO_IA,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_VIAJES } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.tipo, data: img.datos } },
            { type: 'text', text: promptIA() }
          ]
        }]
      })
    });
  } catch (e) {
    throw new Error('No se pudo conectar con Claude. Si abriste la página desde la liga de claude.ai, ' +
      'el navegador bloquea esta conexión: usa la versión de tu computadora o de GitHub Pages.');
  }
  if (!r.ok) {
    let detalle = '';
    try { detalle = (await r.json()).error?.message || ''; } catch { /* respuesta sin JSON */ }
    if (r.status === 401) throw new Error('La llave de API no es válida.');
    if (r.status === 429) throw new Error('Se alcanzó el límite de la cuenta de Claude. Espera un momento y reintenta.');
    throw new Error(`Claude respondió con error ${r.status}. ${detalle}`);
  }
  const datos = await r.json();
  if (datos.stop_reason === 'refusal') throw new Error('Claude no pudo procesar esta imagen.');
  const texto = (datos.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!texto) throw new Error('Claude no devolvió información de la imagen.');
  try { return JSON.parse(texto); }
  catch { throw new Error('La respuesta de Claude no se pudo leer. Vuelve a intentar.'); }
}

/* Convierte lo que devolvió la IA en viajes de la aplicación */
function mapearViajeIA(r) {
  const buscaUnidad = (txt, categoria) => {
    if (!txt) return '';
    const u = DB.unidades.find(x => (x.categoria || 'Tractor') === categoria &&
      sinAcentos(x.numero) === sinAcentos(txt)) ||
      DB.unidades.find(x => (x.categoria || 'Tractor') === categoria && sinAcentos(x.placa || '') === sinAcentos(txt));
    return u ? u.id : '';
  };
  const c = r.conductor ? DB.conductores.find(x => sinAcentos(x.nombre) === sinAcentos(r.conductor)) ||
    DB.conductores.find(x => sinAcentos(x.nombre).includes(sinAcentos(r.conductor))) : null;
  const cli = r.cliente ? DB.clientes.find(x => sinAcentos(x.nombre) === sinAcentos(r.cliente)) : null;
  const v = {
    fecha: normalizarFecha(r.fecha) || hoyISO(),
    horaSalida: r.horaSalida || '', horaLlegada: r.horaLlegada || '',
    origen: r.origen || '', destino: r.destino || '',
    cliente: cli ? cli.nombre : (r.cliente || ''),
    unidadId: buscaUnidad(r.unidad, 'Tractor'),
    remolqueId: buscaUnidad(r.remolque, 'Remolque'),
    conductorId: c ? c.id : '',
    carga: r.carga || '', facturas: r.referencia || '', stop: '',
    notas: [r.notas, !c && r.conductor ? `Operador según la foto: ${r.conductor}` : '',
      !buscaUnidad(r.unidad, 'Tractor') && r.unidad ? `Unidad según la foto: ${r.unidad}` : '']
      .filter(Boolean).join(' — '),
    estado: DB.catalogos.estadosViaje[0]
  };
  if (v.unidadId && !v.conductorId) {
    const op = DB.conductores.find(x => x.unidadId === v.unidadId);
    if (op) v.conductorId = op.id;
  }
  return v;
}

function dialogoLeerFoto() {
  if (sesion.rol !== 'admin') return;
  if (!localStorage.getItem(CLAVE_API)) {
    return abrirModal('Falta configurar la llave',
      `<p>Para leer fotos hace falta una llave de la API de Claude. Se configura una sola vez en
       <b>Datos y Ajustes → Leer fotos y capturas con IA</b>, y se guarda solo en este navegador.</p>`,
      [{ texto: 'Cerrar', clase: 'ghost', accion: cerrarModal },
       { texto: 'Ir a Ajustes', clase: 'primary', accion: () => { cerrarModal(); irA('datos'); } }]);
  }
  abrirModal('Leer un schedule desde una foto',
    `<div class="zona-imagen" id="zonaImagen">
       <b>Arrastra aquí la foto o la captura</b><br>
       o pégala con Ctrl+V, o haz clic para elegir el archivo
     </div>
     <p class="hint">Funciona con fotos de una hoja, capturas de Excel o de WhatsApp. Cada lectura se cobra a tu cuenta de Claude.</p>`,
    [{ texto: 'Cancelar', clase: 'ghost', accion: cerrarModal }]);

  const zona = $('#zonaImagen');
  const procesar = dataUrl => {
    zona.innerHTML = `<div class="cargando"><span class="spinner"></span> Leyendo la imagen…</div>
      <img src="${dataUrl}" alt="Imagen que se está leyendo">`;
    pedirLecturaIA(dataUrl)
      .then(res => {
        const viajes = (res.viajes || []).map(mapearViajeIA);
        cerrarModal();
        vistaPrevia(viajes, 'Viajes leídos de la imagen',
          res.observaciones ? `Nota de la lectura: ${res.observaciones}` : 'Revisa que todo esté correcto antes de agregarlos.');
      })
      .catch(err => {
        zona.innerHTML = `<p class="error">${esc(err.message)}</p><p>Haz clic para intentar con otra imagen.</p>`;
      });
  };
  const leerArchivo = f => {
    if (!f || !/^image\//.test(f.type)) return toast('Elige un archivo de imagen.');
    const fr = new FileReader();
    fr.onload = () => procesar(String(fr.result));
    fr.readAsDataURL(f);
  };
  const selector = $('#imgPicker');
  selector.value = '';
  selector.onchange = () => leerArchivo(selector.files[0]);
  zona.onclick = () => { selector.value = ''; selector.click(); };
  zona.ondragover = e => { e.preventDefault(); zona.classList.add('sobre'); };
  zona.ondragleave = () => zona.classList.remove('sobre');
  zona.ondrop = e => { e.preventDefault(); zona.classList.remove('sobre'); leerArchivo(e.dataTransfer.files[0]); };
  const alPegar = e => {
    const item = [...(e.clipboardData?.items || [])].find(i => /^image\//.test(i.type));
    if (item) { e.preventDefault(); leerArchivo(item.getAsFile()); }
  };
  document.addEventListener('paste', alPegar);
  $('#modalClose').addEventListener('click', () => document.removeEventListener('paste', alPegar), { once: true });
}

/* =========================================================
   PANEL
   ========================================================= */
function renderPanel() {
  const hoy = hoyISO();
  const iniSem = inicioSemana(hoy), finSem = addDias(iniSem, 6);
  const enSemana = DB.viajes.filter(v => v.fecha >= iniSem && v.fecha <= finSem);
  const activo = v => !/cancel/i.test(v.estado || '');
  const disponibles = DB.unidades.filter(u => /disponible/i.test(u.estado || '')).length;

  $('#kpis').innerHTML = [
    ['Viajes hoy', DB.viajes.filter(v => v.fecha === hoy && activo(v)).length],
    ['Viajes esta semana', enSemana.filter(activo).length],
    ['Pendientes de días pasados', DB.viajes.filter(v => v.fecha < hoy && !estaCompletado(v)).length],
    ['Tractores', DB.unidades.filter(u => !esRemolque(u)).length],
    ['Remolques', DB.unidades.filter(esRemolque).length],
    ['Unidades disponibles', disponibles],
    ['Operadores', DB.conductores.length],
    ['Ingreso semana', '$' + enSemana.filter(activo).reduce((s, v) => s + (parseFloat(v.tarifa) || 0), 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })]
  ].map(([t, n]) => `<div class="kpi"><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join('');

  const manana = addDias(hoy, 1);
  const prox = ordenarViajes(DB.viajes.filter(v => v.fecha === hoy || v.fecha === manana));
  $('#panelHoy').innerHTML = prox.length
    ? `<div class="tbl-wrap">${tabla([
        { t: 'Día', v: v => v.fecha === hoy ? 'Hoy' : 'Mañana' },
        { t: 'Ruta', v: v => esc(`${v.origen || '?'} → ${v.destino || '?'}`) },
        { t: 'Unidad', v: v => esc(nombreUnidad(v.unidadId)) },
        { t: 'Operador', v: v => conPunto(colorConductor(v.conductorId), nombreConductor(v.conductorId)) },
        { t: 'Estado', v: v => `<span class="chip ${claseEstado(v.estado)}">${esc(v.estado || '')}</span>` }
      ], prox, v => `<button class="btn mini" data-viaje="${v.id}">Ver</button>`)}</div>`
    : '<p class="muted">No hay viajes programados para hoy ni mañana.</p>';
  $('#panelHoy').onclick = e => {
    const b = e.target.closest('[data-viaje]'); if (b) verViaje(b.dataset.viaje);
  };

  const ocupadasHoy = new Set(DB.viajes.filter(v => v.fecha === hoy && activo(v))
    .flatMap(v => [v.unidadId, v.remolqueId]).filter(Boolean));
  const libres = DB.unidades.filter(u => !ocupadasHoy.has(u.id) && !/fuera|mantenim/i.test(u.estado || ''));
  const bloque = (titulo, lista) => `
    <p class="muted">${titulo} (${lista.length}):</p>
    ${lista.length ? '<div class="row">' + lista.map(u =>
      `<span class="chip ${claseEstado(u.estado)}">${esc(u.numero || u.placa)}${u.tipo ? ' · ' + esc(u.tipo) : ''}</span>`).join('') + '</div>'
      : '<p class="muted">Ninguno libre: todos tienen viaje o están fuera de servicio.</p>'}`;
  $('#panelDisp').innerHTML =
    bloque('Tractores sin viaje hoy', libres.filter(u => !esRemolque(u))) +
    bloque('Remolques sin viaje hoy', libres.filter(esRemolque));

  /* Avisos: vencimientos y empalmes */
  const avisos = [];
  const dias = f => Math.round((fromISO(f) - fromISO(hoy)) / 86400000);
  DB.unidades.forEach(u => {
    [['seguro', 'seguro'], ['verificacion', 'verificación'], ['proxServicio', 'servicio']].forEach(([k, et]) => {
      if (!u[k]) return;
      const d = dias(u[k]);
      if (d < 0) avisos.push(['bad', `Unidad ${u.numero || u.placa}: ${et} vencido desde el ${fechaCorta(u[k])}.`]);
      else if (d <= 30) avisos.push(['warn', `Unidad ${u.numero || u.placa}: ${et} vence en ${d} día(s) (${fechaCorta(u[k])}).`]);
    });
  });
  DB.conductores.forEach(c => {
    [['venceLicencia', 'licencia'], ['venceMedico', 'examen médico']].forEach(([k, et]) => {
      if (!c[k]) return;
      const d = dias(c[k]);
      if (d < 0) avisos.push(['bad', `${c.nombre}: ${et} vencida desde el ${fechaCorta(c[k])}.`]);
      else if (d <= 30) avisos.push(['warn', `${c.nombre}: ${et} vence en ${d} día(s).`]);
    });
  });
  DB.viajes.filter(v => v.fecha >= hoy && v.fecha <= addDias(hoy, 7) && !/cancel/i.test(v.estado || ''))
    .forEach(v => {
      if (!v.unidadId || !v.conductorId)
        avisos.push(['warn', `Viaje del ${fechaCorta(v.fecha)} (${v.origen}→${v.destino}) sin ${!v.unidadId ? 'unidad' : ''}${!v.unidadId && !v.conductorId ? ' ni ' : ''}${!v.conductorId ? 'conductor' : ''} asignado.`]);
    });

  $('#panelAvisos').innerHTML = avisos.length
    ? '<ul>' + avisos.slice(0, 40).map(([c, t]) => `<li><span class="chip ${c}">${c === 'bad' ? 'Vencido' : 'Atención'}</span> ${esc(t)}</li>`).join('') + '</ul>'
      + (avisos.length > 40 ? `<p class="hint">y ${avisos.length - 40} aviso(s) más…</p>` : '')
    : '<p class="muted">Todo en orden: sin vencimientos próximos ni empalmes.</p>';
}

/* =========================================================
   PAPELES — comandos que arman el texto para copiar y pegar
   ========================================================= */
const FORMATOS_DEF = [
  {
    clave: 'expo', nombre: 'Expo (exportación con carga)', creaViaje: true,
    texto: `Buenos días,

Favor de usar datos para expo a {{destino}},

• Compañía: {{empresa}}
• Operador: {{operador}}
• Unidad: {{tractor}}
• Placas Tractor: {{tractor.placa}}

• Equipo: {{remolque.tipo}}
• Económico: {{remolque}}
• Placas: {{remolque.placa}}

• CAAT: {{caat}}
• SCAC: {{scac}}

• Dirección:
{{cliente}}
{{cliente.direccion}}
{{cliente.ciudad}}, {{cliente.estado}} {{cliente.cp}}`
  },
  {
    clave: 'vacio', nombre: 'Entrada vacío', creaViaje: false,
    texto: `Buenos días,

Adjunto la información para la entrada vacío,

Compañía: {{empresa}}
Chofer: {{operador}}
Placas: {{tractor.placa}}
Económico: {{tractor}}
SCAC: {{scac}}

Gracias de antemano.

Saludos,`
  }
];

const VARIABLES = [
  ['empresa', 'Nombre de la compañía'], ['caat', 'CAAT'], ['scac', 'SCAC'],
  ['operador', 'Nombre del operador'], ['operador.licencia', 'Licencia del operador'],
  ['operador.telefono', 'Teléfono del operador'],
  ['tractor', 'Número económico del tractor'], ['tractor.placa', 'Placas del tractor (USA)'],
  ['tractor.placaMx', 'Placas del tractor (México)'], ['tractor.vin', 'VIN del tractor'],
  ['tractor.marca', 'Marca y año del tractor'],
  ['remolque', 'Número de la caja o plataforma'], ['remolque.tipo', 'Tipo de equipo'],
  ['remolque.placa', 'Placas del remolque (USA)'], ['remolque.placaMx', 'Placas del remolque (México)'],
  ['cliente', 'Nombre del cliente'], ['cliente.direccion', 'Dirección del cliente'],
  ['cliente.ciudad', 'Ciudad'], ['cliente.estado', 'Estado'], ['cliente.cp', 'Código postal'],
  ['cliente.ciudadEstado', 'Ciudad, Estado CP en un renglón'],
  ['origen', 'Origen del viaje'], ['destino', 'Destino'], ['fecha', 'Fecha del viaje'],
  ['facturas', 'Facturas / referencia']
];

/* Ciudad y estado como se escriben en la hoja: "Ontario Ca", "Houston Tx" */
function lugarDeCliente(cli) {
  if (!cli || !cli.ciudad) return '';
  const edo = String(cli.estado || '').trim();
  return (cli.ciudad + ' ' + (edo ? edo[0].toUpperCase() + edo.slice(1).toLowerCase() : '')).trim();
}

/* Arma los datos con los que se llena un formato */
function datosDelComando(v) {
  const u = unidad(v.unidadId) || {}, r = unidad(v.remolqueId) || {}, c = conductor(v.conductorId) || {};
  const cli = DB.clientes.find(x => sinAcentos(x.nombre) === sinAcentos(v.cliente)) || {};
  const ciudadEstado = [cli.ciudad, [cli.estado, cli.cp].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    empresa: DB.empresa.nombre || '', caat: DB.empresa.caat || '', scac: DB.empresa.scac || '',
    operador: c.nombre || '', 'operador.licencia': c.licencia || '', 'operador.telefono': c.telefono || '',
    tractor: u.numero || '', 'tractor.placa': u.placa || '', 'tractor.placaMx': u.placaMx || '',
    'tractor.vin': u.vin || '', 'tractor.marca': [u.marca, u.anio].filter(Boolean).join(' '),
    remolque: r.numero || '', 'remolque.tipo': r.tipo || '',
    'remolque.placa': r.placa || '', 'remolque.placaMx': r.placaMx || '',
    cliente: cli.nombre || v.cliente || '', 'cliente.direccion': cli.direccion || '',
    'cliente.ciudad': cli.ciudad || '', 'cliente.estado': cli.estado || '', 'cliente.cp': cli.cp || '',
    'cliente.ciudadEstado': ciudadEstado,
    origen: v.origen || '', destino: v.destino || lugarDeCliente(cli), fecha: fechaCorta(v.fecha),
    facturas: v.facturas || ''
  };
}

/* Sustituye {{campos}}; los renglones que se quedan sin ningún dato se caen solos */
function armarTexto(plantilla, datos) {
  const faltantes = new Set();
  const lineas = String(plantilla).split('\n').map(linea => {
    let uso = 0, lleno = 0;
    const salida = linea.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, clave) => {
      uso++;
      const val = datos[clave];
      if (val) { lleno++; return val; }
      faltantes.add(clave);
      return '';
    });
    if (uso && !lleno) return null;                       // renglón sin datos: se quita
    /* La limpieza de comas sueltas solo aplica donde faltó un dato,
       para no comerse las comas que el formato lleva a propósito. */
    return (uso > lleno ? salida.replace(/\s+,/g, ',').replace(/,\s*$/, '') : salida).replace(/[ \t]+$/, '');
  }).filter(l => l !== null);
  return { texto: lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim(), faltantes: [...faltantes] };
}

let ultimoViajeGenerado = null;

function ejecutarComando(textoComando) {
  const cont = $('#resultadoPapeles');
  const bruto = String(textoComando || '').trim();
  if (!bruto) return;
  const partes = bruto.split(/\s+/);
  const clave = sinAcentos(partes[0]);
  const formato = DB.formatos.find(f => sinAcentos(f.clave) === clave);
  if (!formato) {
    cont.innerHTML = `<div class="panel"><p class="error">No conozco el comando "${esc(partes[0])}".</p>
      <p class="muted">Comandos disponibles: ${DB.formatos.map(f => `<code>${esc(f.clave)}</code>`).join(', ')}.</p></div>`;
    return;
  }
  const resto = partes.slice(1).join(' ');
  const v = interpretarLinea(resto);
  if (!v.origen && DB.preferencias.origenPorDefecto) v.origen = DB.preferencias.origenPorDefecto;
  /* si el destino quedó siendo el nombre del cliente, se cambia por su ciudad */
  const cliDir = DB.clientes.find(x => sinAcentos(x.nombre) === sinAcentos(v.destino));
  if (cliDir && lugarDeCliente(cliDir)) v.destino = lugarDeCliente(cliDir);
  const datos = datosDelComando(v);
  const { texto, faltantes } = armarTexto(formato.texto, datos);

  /* El viaje se agrega solo, salvo en los formatos que no lo llevan (vacío) */
  let nota = '';
  ultimoViajeGenerado = null;
  if (formato.creaViaje && sesion.rol === 'admin') {
    const viaje = Object.assign({ id: uid(), creado: new Date().toISOString(), estatus: {} },
      (({ _texto, ...r }) => r)(v), { notas: `Generado con el comando "${formato.clave}"` });
    DB.viajes.push(viaje);
    guardar(); renderSchedule(); renderPanel(); renderLeyenda(viajesFiltrados());
    ultimoViajeGenerado = viaje.id;
    nota = `<p class="chip ok">✓ El viaje quedó agregado al schedule del ${esc(fechaCorta(viaje.fecha))}</p>
      <button class="btn mini" id="deshacerViajeBtn">Deshacer</button>`;
  } else if (formato.creaViaje) {
    nota = '<p class="hint">Tu cuenta es de consulta: el texto se genera, pero el viaje no se agrega al schedule.</p>';
  } else {
    nota = '<p class="hint">Este formato no agrega viaje al schedule.</p>';
  }

  cont.innerHTML = `<div class="panel resultado">
      <div class="row">
        <h2 style="margin:0">${esc(formato.nombre)}</h2>
        <div class="spacer"></div>
        <button class="btn primary" id="copiarBtn">Copiar texto</button>
      </div>
      <pre id="textoGenerado" class="salida">${esc(texto)}</pre>
      <div class="row">${nota}</div>
      ${faltantes.length ? `<p class="hint">Faltó información para: ${faltantes.map(f => `<code>${esc(f)}</code>`).join(', ')}.
        Complétala en la ficha del cliente, de la unidad o del operador y vuelve a generar.</p>` : ''}
    </div>`;

  $('#copiarBtn').onclick = () => copiarTexto(texto);
  const deshacer = $('#deshacerViajeBtn');
  if (deshacer) deshacer.onclick = () => {
    if (!ultimoViajeGenerado) return;
    DB.viajes = DB.viajes.filter(x => x.id !== ultimoViajeGenerado);
    ultimoViajeGenerado = null;
    guardar(); render();
    irA('papeles');
    toast('El viaje se quitó del schedule.');
  };
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Texto copiado: ya lo puedes pegar en el correo.');
  } catch {
    const pre = $('#textoGenerado');
    const sel = window.getSelection();
    const rango = document.createRange();
    rango.selectNodeContents(pre);
    sel.removeAllRanges(); sel.addRange(rango);
    toast('El navegador no dejó copiar solo: el texto ya quedó seleccionado, presiona Ctrl+C.', 5000);
  }
}

function editarFormato(id) {
  if (sesion.rol !== 'admin') return;
  const ex = id ? DB.formatos.find(f => f.id === id) : null;
  const f = ex || {};
  const campos = [
    { k: 'clave', t: 'Comando (una palabra)', valor: f.clave || '', req: true, ph: 'expo, vacio, pedimento…' },
    { k: 'nombre', t: 'Nombre del formato', valor: f.nombre || '', req: true },
    { k: 'creaViaje', t: '¿Agrega el viaje al schedule?', tipo: 'select', vacio: false,
      valor: f.creaViaje ? 'si' : 'no', opciones: [{ v: 'si', t: 'Sí, agrégalo' }, { v: 'no', t: 'No (como el vacío)' }] },
    { k: 'texto', t: 'Texto del formato', tipo: 'textarea', valor: f.texto || '', ancho: 'full', req: true }
  ];
  abrirModal(ex ? `Formato: ${ex.nombre}` : 'Nuevo formato',
    formHTML(campos) + '<p class="hint">Los datos se meten entre llaves dobles, por ejemplo <code>{{operador}}</code>. ' +
    'La lista completa está abajo, en la pestaña de Papeles.</p>', [
      ...(ex ? [{ texto: 'Eliminar', clase: 'danger', accion: () => {
        confirmar('Eliminar formato', `¿Eliminar "${ex.nombre}"?`, () => {
          DB.formatos = DB.formatos.filter(x => x.id !== ex.id);
          guardar(); cerrarModal(); render(); toast('Formato eliminado.');
        }, 'Eliminar');
      } }] : []),
      { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
      { texto: 'Guardar', clase: 'primary', accion: () => {
        const d = leerForm();
        const clave = sinAcentos(d.clave).replace(/[^a-z0-9]/g, '');
        if (!clave) return toast('El comando debe ser una palabra sin espacios.');
        if (DB.formatos.some(x => sinAcentos(x.clave) === clave && x.id !== (ex && ex.id)))
          return toast('Ya existe otro formato con ese comando.');
        const datos = { clave, nombre: d.nombre || clave, creaViaje: d.creaViaje === 'si', texto: d.texto };
        if (ex) Object.assign(ex, datos); else DB.formatos.push(Object.assign({ id: uid() }, datos));
        guardar(); cerrarModal(); render(); toast('Formato guardado.');
      } }
    ]);
}

function renderPapeles() {
  const ayuda = $('#ayudaComandos');
  if (!ayuda) return;
  ayuda.innerHTML = 'Escribe el comando y luego los datos del viaje, en cualquier orden: ' +
    DB.formatos.map(f => `<code>${esc(f.clave)}</code>`).join(', ') +
    '. Ejemplos: <code>expo T-15 AXL-4680 Premium Pool Finishes</code> · <code>vacio T-19</code>';

  const cont = $('#tablaFormatos');
  cont.innerHTML = `<div class="tbl-wrap">${tabla([
    { t: 'Comando', v: f => `<code>${esc(f.clave)}</code>` },
    { t: 'Formato', v: f => esc(f.nombre) },
    { t: 'Agrega viaje', v: f => f.creaViaje ? '<span class="chip ok">Sí</span>' : '<span class="chip">No</span>' },
    { t: 'Empieza con', v: f => esc(String(f.texto).split('\n').filter(Boolean)[1] || '').slice(0, 60) }
  ], DB.formatos,
    f => `<button class="btn mini" data-usar-formato="${esc(f.clave)}">Usar</button>` +
      (sesion.rol === 'admin' ? ` <button class="btn mini" data-editar-formato="${f.id}">Editar</button>` : ''),
    'No hay formatos.')}</div>`;
  cont.onclick = e => {
    const ed = e.target.closest('[data-editar-formato]');
    if (ed) return editarFormato(ed.dataset.editarFormato);
    const us = e.target.closest('[data-usar-formato]');
    if (us) {
      const campo = $('#comandoPapeles');
      campo.value = us.dataset.usarFormato + ' ';
      campo.focus();
    }
  };

  $('#listaVariables').innerHTML = `<div class="tbl-wrap">${tabla([
    { t: 'Se escribe', v: x => `<code>{{${esc(x[0])}}}</code>` },
    { t: 'Y aparece', v: x => esc(x[1]) }
  ], VARIABLES)}</div>`;
}

/* =========================================================
   USUARIOS — alta, permisos y contraseñas
   ========================================================= */
function renderUsuarios() {
  const cont = $('#tablaUsuarios');
  if (!cont) return;
  const cols = [
    { t: 'Usuario', v: u => `<strong>${esc(u.usuario)}</strong>${u.id === sesion.id ? ' <span class="chip info">tú</span>' : ''}` },
    { t: 'Nombre', v: u => esc(u.nombre) },
    { t: 'Permiso', v: u => `<span class="chip ${u.rol === 'admin' ? 'ok' : ''}">${esc(ROLES[u.rol] || u.rol)}</span>` },
    { t: 'Nota', v: u => esc(u.notaClave || '') }
  ];
  cont.innerHTML = `<div class="tbl-wrap">${tabla(cols, DB.usuarios,
    u => `<button class="btn mini" data-editar-usuario="${u.id}">Editar</button>
          <button class="btn mini" data-clave-usuario="${u.id}">Cambiar clave</button>
          ${u.id === sesion.id ? '' : `<button class="btn mini" data-borrar-usuario="${u.id}">✕</button>`}`,
    'No hay usuarios.')}</div>`;
  cont.onclick = e => {
    const ed = e.target.closest('[data-editar-usuario]');
    if (ed) return editarUsuario(ed.dataset.editarUsuario);
    const cl = e.target.closest('[data-clave-usuario]');
    if (cl) return dialogoClave(cl.dataset.claveUsuario);
    const bo = e.target.closest('[data-borrar-usuario]');
    if (bo) return borrarUsuario(bo.dataset.borrarUsuario);
  };
}

function editarUsuario(id) {
  if (sesion.rol !== 'admin') return;
  const ex = id ? DB.usuarios.find(u => u.id === id) : null;
  const u = ex || {};
  const campos = [
    { k: 'usuario', t: 'Usuario (con el que entra)', valor: u.usuario || '', req: true, ph: 'sin espacios' },
    { k: 'nombre', t: 'Nombre de la persona', valor: u.nombre || '', ancho: 'full' },
    { k: 'rol', t: 'Permiso', tipo: 'select', vacio: false, valor: u.rol || 'consulta',
      opciones: Object.entries(ROLES).map(([v, t]) => ({ v, t })) },
    ...(ex ? [] : [{ k: 'clave', t: 'Contraseña', valor: '', req: true, ph: 'mínimo 4 caracteres' }])
  ];
  abrirModal(ex ? `Usuario ${ex.usuario}` : 'Nuevo usuario', formHTML(campos), [
    { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
    { texto: 'Guardar', clase: 'primary', accion: async () => {
      const d = leerForm();
      const usuario = String(d.usuario || '').trim().toLowerCase().replace(/\s+/g, '');
      if (!usuario) return toast('El usuario no puede quedar vacío.');
      const repetido = DB.usuarios.find(x => x.usuario.toLowerCase() === usuario && x.id !== (ex && ex.id));
      if (repetido) return toast('Ya existe otro usuario con ese nombre de acceso.');
      if (ex) {
        if (ex.rol === 'admin' && d.rol !== 'admin' && cuantosAdmin() === 1)
          return toast('Debe quedar al menos una persona con permiso de editar.');
        Object.assign(ex, { usuario, nombre: d.nombre || usuario, rol: d.rol });
        if (ex.id === sesion.id) sesion = Object.assign({}, sesion, { usuario, nombre: ex.nombre, rol: ex.rol });
      } else {
        if ((d.clave || '').length < 4) return toast('La contraseña debe tener al menos 4 caracteres.');
        DB.usuarios.push(await crearUsuario({ usuario, nombre: d.nombre || usuario, rol: d.rol, clave: d.clave }));
      }
      guardar(); cerrarModal(); render();
      toast(ex ? 'Usuario actualizado.' : 'Usuario creado.');
    } }
  ]);
}

function dialogoClave(id) {
  if (sesion.rol !== 'admin') return;
  const u = DB.usuarios.find(x => x.id === id);
  if (!u) return;
  abrirModal(`Cambiar la contraseña de ${u.usuario}`,
    formHTML([{ k: 'clave', t: 'Nueva contraseña', valor: '', req: true, ancho: 'full', ph: 'mínimo 4 caracteres' }]) +
    '<p class="hint">Anótala y pásasela a esa persona: las contraseñas se guardan cifradas y no se pueden volver a ver.</p>',
    [{ texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
     { texto: 'Cambiar', clase: 'primary', accion: async () => {
       const clave = leerForm().clave || '';
       if (clave.length < 4) return toast('La contraseña debe tener al menos 4 caracteres.');
       await cambiarClave(u, clave);
       guardar(); cerrarModal(); render();
       toast(`Contraseña de ${u.usuario} actualizada.`);
     } }]);
}

function borrarUsuario(id) {
  if (sesion.rol !== 'admin') return;
  const u = DB.usuarios.find(x => x.id === id);
  if (!u || u.id === sesion.id) return;
  if (u.rol === 'admin' && cuantosAdmin() === 1) return toast('Debe quedar al menos una persona con permiso de editar.');
  confirmar('Quitar usuario', `¿Quitar a ${u.usuario}? Ya no podrá entrar a la página.`, () => {
    DB.usuarios = DB.usuarios.filter(x => x.id !== id);
    guardar(); cerrarModal(); render(); toast('Usuario eliminado.');
  }, 'Quitar');
}

/* =========================================================
   IMPORTAR / EXPORTAR
   ========================================================= */
const COLS_UNIDAD = [
  { titulo: 'numero', valor: u => u.numero }, { titulo: 'categoria', valor: u => u.categoria || 'Tractor' },
  { titulo: 'tipo', valor: u => u.tipo },
  { titulo: 'placa', valor: u => u.placa }, { titulo: 'placaMx', valor: u => u.placaMx },
  { titulo: 'marca', valor: u => u.marca },
  { titulo: 'modelo', valor: u => u.modelo }, { titulo: 'anio', valor: u => u.anio },
  { titulo: 'vin', valor: u => u.vin }, { titulo: 'capacidad', valor: u => u.capacidad },
  { titulo: 'odometro', valor: u => u.odometro }, { titulo: 'ubicacion', valor: u => u.ubicacion },
  { titulo: 'estado', valor: u => u.estado }, { titulo: 'seguro', valor: u => u.seguro },
  { titulo: 'verificacion', valor: u => u.verificacion }, { titulo: 'proxServicio', valor: u => u.proxServicio },
  { titulo: 'notas', valor: u => u.notas }
];
const COLS_CONDUCTOR = [
  { titulo: 'nombre', valor: c => c.nombre }, { titulo: 'telefono', valor: c => c.telefono },
  { titulo: 'licencia', valor: c => c.licencia }, { titulo: 'tipoLicencia', valor: c => c.tipoLicencia },
  { titulo: 'venceLicencia', valor: c => c.venceLicencia }, { titulo: 'venceMedico', valor: c => c.venceMedico },
  { titulo: 'unidad', valor: c => nombreUnidad(c.unidadId) }, { titulo: 'base', valor: c => c.base },
  { titulo: 'estado', valor: c => c.estado }, { titulo: 'color', valor: c => c.color },
  { titulo: 'notas', valor: c => c.notas }
];
const COLS_VIAJE = [
  { titulo: 'fecha', valor: v => v.fecha }, { titulo: 'origen', valor: v => v.origen },
  { titulo: 'destino', valor: v => v.destino }, { titulo: 'cliente', valor: v => v.cliente },
  { titulo: 'stop', valor: v => v.stop },
  { titulo: 'facturas', valor: v => v.facturas || v.referencia }, { titulo: 'tractor', valor: v => nombreUnidad(v.unidadId) },
  { titulo: 'remolque', valor: v => nombreUnidad(v.remolqueId) },
  { titulo: 'conductor', valor: v => nombreConductor(v.conductorId) }, { titulo: 'carga', valor: v => v.carga },
  { titulo: 'millas', valor: v => v.millas }, { titulo: 'tarifa', valor: v => v.tarifa },
  { titulo: 'estado', valor: v => v.estado },
  { titulo: 'papeles', valor: v => etapasDe(v).papeles ? 'Sí' : '' },
  { titulo: 'previo', valor: v => etapasDe(v).previo ? 'Sí' : '' },
  { titulo: 'cruzo', valor: v => etapasDe(v).cruzo ? 'Sí' : '' },
  { titulo: 'entregado', valor: v => etapasDe(v).entregado ? 'Sí' : '' },
  { titulo: 'notas', valor: v => v.notas }
];

const COLS_CLIENTE = [
  { titulo: 'nombre', valor: c => c.nombre }, { titulo: 'direccion', valor: c => c.direccion },
  { titulo: 'ciudad', valor: c => c.ciudad }, { titulo: 'estado', valor: c => c.estado },
  { titulo: 'cp', valor: c => c.cp }, { titulo: 'contacto', valor: c => c.contacto },
  { titulo: 'telefono', valor: c => c.telefono }, { titulo: 'horario', valor: c => c.horario },
  { titulo: 'color', valor: c => c.color }, { titulo: 'notas', valor: c => c.notas }
];

/* Normaliza fechas de CSV: acepta 2026-07-31, 31/07/2026 y 7/31/2026 */
function normalizarFecha(txt) {
  const s = String(txt || '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    /* Se respeta el formato elegido por la compañía; si un número no puede ser
       mes (mayor que 12), manda la realidad y no el ajuste. */
    let mes, dia;
    if (formatoFecha() === 'mdy') { mes = a; dia = b; } else { dia = a; mes = b; }
    if (mes > 12 && dia <= 12) { const t = mes; mes = dia; dia = t; }
    return `${y}-${pad(mes)}-${pad(dia)}`;
  }
  return s;
}

function importarUnidades(texto) {
  const { registros } = deCSV(texto);
  if (!registros.length) return toast('El archivo no tiene filas de datos.');
  let nuevas = 0, actualizadas = 0;
  registros.forEach(r => {
    const numero = campoCSV(r, 'numero', 'numero economico', 'economico', 'unidad', 'no', 'id', 'truck', 'unit');
    const placa = campoCSV(r, 'placa', 'placas', 'plate', 'plates');
    if (!numero && !placa) return;
    const datos = {
      numero, placa,
      tipo: campoCSV(r, 'tipo', 'clase', 'type'),
      marca: campoCSV(r, 'marca', 'make'),
      modelo: campoCSV(r, 'modelo', 'model'),
      anio: campoCSV(r, 'anio', 'año', 'year'),
      vin: campoCSV(r, 'vin', 'serie', 'numero de serie'),
      capacidad: campoCSV(r, 'capacidad', 'capacity', 'tonelaje'),
      odometro: campoCSV(r, 'odometro', 'kilometraje', 'millaje', 'mileage'),
      ubicacion: campoCSV(r, 'ubicacion', 'patio', 'base', 'location'),
      estado: campoCSV(r, 'estado', 'status', 'condicion') || DB.catalogos.estadosUnidad[0],
      seguro: normalizarFecha(campoCSV(r, 'seguro', 'vence seguro', 'poliza', 'insurance')),
      verificacion: normalizarFecha(campoCSV(r, 'verificacion', 'dot', 'inspeccion')),
      proxServicio: normalizarFecha(campoCSV(r, 'proxservicio', 'proximo servicio', 'servicio', 'mantenimiento')),
      notas: campoCSV(r, 'notas', 'observaciones', 'comentarios', 'notes')
    };
    Object.keys(datos).forEach(k => { if (datos[k] === '') delete datos[k]; });
    datos.categoria = campoCSV(r, 'categoria', 'clase de unidad') ||
      (/caja|plataforma|remolque|trailer|dolly/i.test(datos.tipo || '') ? 'Remolque' : 'Tractor');
    datos.placaMx = campoCSV(r, 'placamx', 'placas mexico', 'placa mexicana');
    Object.keys(datos).forEach(k => { if (datos[k] === '') delete datos[k]; });
    const ex = DB.unidades.find(u =>
      (numero && String(u.numero).toLowerCase() === String(numero).toLowerCase()) ||
      (placa && u.placa && String(u.placa).toLowerCase() === String(placa).toLowerCase()));
    if (ex) { Object.assign(ex, datos); actualizadas++; }
    else { DB.unidades.push(Object.assign({ id: uid(), numero, placa }, datos)); nuevas++; }
  });
  guardar(); render();
  toast(`Inventario importado: ${nuevas} unidad(es) nueva(s), ${actualizadas} actualizada(s).`);
}

function importarConductores(texto) {
  const { registros } = deCSV(texto);
  if (!registros.length) return toast('El archivo no tiene filas de datos.');
  let nuevos = 0, actualizados = 0;
  registros.forEach(r => {
    const nombre = campoCSV(r, 'nombre', 'conductor', 'operador', 'chofer', 'driver', 'name');
    if (!nombre) return;
    const uNom = campoCSV(r, 'unidad', 'numero economico', 'truck');
    const u = uNom ? DB.unidades.find(x => String(x.numero).toLowerCase() === String(uNom).toLowerCase()) : null;
    const datos = {
      nombre,
      telefono: campoCSV(r, 'telefono', 'tel', 'celular', 'phone'),
      licencia: campoCSV(r, 'licencia', 'license', 'cdl'),
      tipoLicencia: campoCSV(r, 'tipolicencia', 'tipo de licencia', 'clase licencia'),
      venceLicencia: normalizarFecha(campoCSV(r, 'vencelicencia', 'vence licencia', 'vigencia licencia', 'expira licencia')),
      venceMedico: normalizarFecha(campoCSV(r, 'vencemedico', 'examen medico', 'medico')),
      base: campoCSV(r, 'base', 'patio', 'ubicacion'),
      color: campoCSV(r, 'color'),
      estado: campoCSV(r, 'estado', 'status') || DB.catalogos.estadosConductor[0],
      notas: campoCSV(r, 'notas', 'observaciones', 'notes'),
      unidadId: u ? u.id : ''
    };
    Object.keys(datos).forEach(k => { if (datos[k] === '') delete datos[k]; });
    const ex = DB.conductores.find(c => String(c.nombre).toLowerCase() === nombre.toLowerCase());
    if (ex) { Object.assign(ex, datos); actualizados++; }
    else { DB.conductores.push(Object.assign({ id: uid(), nombre }, datos)); nuevos++; }
  });
  guardar(); render();
  toast(`Conductores: ${nuevos} nuevo(s), ${actualizados} actualizado(s).`);
}

/* ---- Carga del inventario propio de AXL (datos-axl.js) ---- */
function cargarInventarioAXL(silencioso = false) {
  if (typeof DATOS_AXL === 'undefined') { if (!silencioso) toast('No se encontró el archivo datos-axl.js.'); return; }
  const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  let unidadesNuevas = 0, conductoresNuevos = 0, clientesNuevos = 0;

  if (!DB.empresa.nombre || DB.empresa.nombre === EMPRESA_DEF.nombre)
    DB.empresa = Object.assign({}, DB.empresa, DATOS_AXL.empresa, {
      dispatch: DB.empresa.dispatch || DATOS_AXL.empresa.dispatch,
      contacto: DB.empresa.contacto || DATOS_AXL.empresa.contacto
    });

  const guardarUnidad = (datos, categoria) => {
    let u = DB.unidades.find(x => igual(x.numero, datos.numero));
    if (!u) { u = { id: uid() }; DB.unidades.push(u); unidadesNuevas++; }
    Object.keys(datos).forEach(k => { if (datos[k] !== '' && datos[k] != null) u[k] = datos[k]; });
    u.categoria = u.categoria || categoria;
    u.estado = u.estado || DB.catalogos.estadosUnidad[0];
    return u;
  };

  (DATOS_AXL.tractores || []).forEach(t => {
    const { operador, ...datos } = t;
    const u = guardarUnidad(Object.assign({ tipo: 'Tractocamión' }, datos), 'Tractor');
    if (!operador) return;
    let c = DB.conductores.find(x => igual(x.nombre, operador));
    if (!c) { c = { id: uid(), nombre: operador, estado: DB.catalogos.estadosConductor[0] }; DB.conductores.push(c); conductoresNuevos++; }
    if (!c.unidadId) c.unidadId = u.id;
  });

  (DATOS_AXL.remolques || []).forEach(r => guardarUnidad(r, 'Remolque'));

  (DATOS_AXL.clientes || []).forEach(cl => {
    let c = DB.clientes.find(x => igual(x.nombre, cl.nombre) && igual(x.ciudad, cl.ciudad));
    if (!c) { c = { id: uid() }; DB.clientes.push(c); clientesNuevos++; }
    Object.keys(cl).forEach(k => { if (cl[k] !== '' && cl[k] != null) c[k] = cl[k]; });
  });

  guardar();
  if (!silencioso) {
    render();
    toast(`Inventario de AXL cargado: ${DB.unidades.length} unidades, ${DB.conductores.length} operadores, ${DB.clientes.length} clientes ` +
      `(${unidadesNuevas} unidades, ${conductoresNuevos} operadores y ${clientesNuevos} clientes nuevos).`, 5000);
  }
}

function respaldar() {
  const fecha = hoyISO();
  descargar(`respaldo-schedule-${fecha}.json`, JSON.stringify(DB, null, 2));
  toast('Respaldo descargado.');
}
function restaurar() {
  if (sesion.rol !== 'admin') return;
  pedirArchivo('.json,application/json', texto => {
    let datos;
    try { datos = JSON.parse(texto); } catch { return toast('El archivo no es un respaldo válido.'); }
    if (!datos || !Array.isArray(datos.viajes) && !Array.isArray(datos.unidades))
      return toast('El archivo no parece un respaldo de esta aplicación.');
    confirmar('Restaurar respaldo',
      'Esto reemplaza toda la información actual con la del archivo. ¿Continuar?',
      () => {
        const authActual = DB.auth;
        DB = Object.assign(ESTADO_INICIAL(), datos);
        if (!DB.auth || !DB.auth.configurada) DB.auth = authActual;
        guardar(); render(); toast('Respaldo restaurado.');
      }, 'Restaurar');
  });
}

/* =========================================================
   RENDER GENERAL / NAVEGACIÓN
   ========================================================= */
function llenarSelect(sel, opciones, textoVacio) {
  const actual = sel.value;
  sel.innerHTML = `<option value="">${esc(textoVacio)}</option>` +
    opciones.map(o => {
      const v = typeof o === 'string' ? o : o.v;
      const t = typeof o === 'string' ? o : o.t;
      return `<option value="${esc(v)}">${esc(t)}</option>`;
    }).join('');
  sel.value = actual;
}

function render() {
  document.body.classList.toggle('role-guest', sesion.rol !== 'admin');
  $('#empresaNombre').textContent = DB.empresa.nombre || 'Compañía de transportes';
  $('#empresaSub').textContent = [
    DB.empresa.dispatch ? 'Dispatch: ' + DB.empresa.dispatch : '',
    DB.empresa.caat ? 'CAAT ' + DB.empresa.caat : '',
    DB.empresa.scac ? 'SCAC ' + DB.empresa.scac : ''
  ].filter(Boolean).join(' · ') || 'Panel de control';
  $('#roleBadge').textContent = (sesion.nombre || sesion.usuario || 'Consulta') +
    (sesion.rol === 'admin' ? '' : ' · solo consulta');
  $('#roleBadge').className = 'badge' + (sesion.rol === 'admin' ? ' admin' : '');

  llenarSelect($('#filtroEstado'), DB.catalogos.estadosViaje, 'Todos los estados');
  llenarSelect($('#filtroUnidad'), opcionesUnidad(), 'Todas las unidades');
  llenarSelect($('#filtroConductor'), opcionesConductor(), 'Todos los conductores');
  llenarSelect($('#filtroEstadoUnidad'), DB.catalogos.estadosUnidad, 'Todos los estados');
  llenarSelect($('#filtroEstadoConductor'), DB.catalogos.estadosConductor, 'Todos los estados');
  llenarSelect($('#filtroEstadoUS'), [...new Set(DB.clientes.map(c => c.estado))].filter(Boolean).sort(), 'Todos los estados');
  $('#filtroEstado').value = estadoUI.fEstado;
  $('#filtroUnidad').value = estadoUI.fUnidad;
  $('#filtroConductor').value = estadoUI.fConductor;

  renderPanel();
  renderSchedule();
  renderInventario();
  renderConductores();
  renderClientes();
  renderPlantillas();
  renderPapeles();
  renderUsuarios();

  $('#cfgEmpresa').value = DB.empresa.nombre || '';
  $('#cfgDispatch').value = DB.empresa.dispatch || '';
  $('#cfgContacto').value = DB.empresa.contacto || '';
  $('#cfgCaat').value = DB.empresa.caat || '';
  $('#cfgScac').value = DB.empresa.scac || '';
  $('#cfgFormatoFecha').value = formatoFecha();
  $('#cfgOrigen').value = DB.preferencias.origenPorDefecto || '';
  $('#catEstadosViaje').value = DB.catalogos.estadosViaje.join(', ');
  $('#catEstadosUnidad').value = DB.catalogos.estadosUnidad.join(', ');
  $('#catTiposUnidad').value = DB.catalogos.tiposUnidad.join(', ');
  $('#catEstadosConductor').value = DB.catalogos.estadosConductor.join(', ');
  $('#ultimoGuardado').textContent = DB.actualizado
    ? 'Última vez guardado: ' + new Date(DB.actualizado).toLocaleString('es-MX') : 'Todavía no hay información guardada.';
  $('#footerInfo').textContent =
    `${DB.viajes.length} viajes · ${DB.unidades.length} unidades · ${DB.conductores.length} operadores · ` +
    `${DB.clientes.length} clientes · la información se guarda en este navegador`;
}

function irA(vista) {
  $$('#tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.view === vista));
  $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + vista));
}

/* ---------------- Sesión ---------------- */
function entrarComo(u) {
  sesion = { id: u.id, usuario: u.usuario, nombre: u.nombre || u.usuario, rol: u.rol };
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  render();
  irA('panel');
}
function salir() {
  sesion = { rol: 'consulta', nombre: '', usuario: '', id: '' };
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginPass').value = '';
  $('#loginUsuario').value = '';
  $('#loginError').classList.add('hidden');
}

/* ---------------- Eventos ---------------- */
function conectarEventos() {
  /* Login con usuario y contraseña */
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#loginError');
    const u = buscarUsuario($('#loginUsuario').value);
    if (await claveCorrecta(u, $('#loginPass').value)) {
      err.classList.add('hidden');
      return entrarComo(u);
    }
    err.textContent = 'Usuario o contraseña incorrectos.';
    err.classList.remove('hidden');
  };

  /* Navegación */
  $('#tabs').onclick = e => { const t = e.target.closest('.tab'); if (t) irA(t.dataset.view); };
  $('#logoutBtn').onclick = salir;
  $('#themeBtn').onclick = () => {
    const actual = document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nuevo = actual === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    localStorage.setItem('axl_tema', nuevo);
  };

  /* Modal */
  $('#modalClose').onclick = cerrarModal;
  $('#modalBack').onclick = e => { if (e.target.id === 'modalBack') cerrarModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });

  /* Schedule */
  $('#vistaSeg').onclick = e => {
    const b = e.target.closest('.segbtn'); if (!b) return;
    estadoUI.vista = b.dataset.vista;
    $$('.segbtn').forEach(x => x.classList.toggle('active', x === b));
    renderSchedule();
  };
  const paso = dir => {
    if (estadoUI.vista === 'mes') {
      const d = fromISO(estadoUI.ancla);
      d.setDate(1); d.setMonth(d.getMonth() + dir);
      estadoUI.ancla = toISO(d);
    } else estadoUI.ancla = addDias(estadoUI.ancla, 7 * dir);
    renderSchedule();
  };
  $('#prevPeriodo').onclick = () => paso(-1);
  $('#nextPeriodo').onclick = () => paso(1);
  $('#hoyBtn').onclick = () => { estadoUI.ancla = hoyISO(); renderSchedule(); };
  $('#buscarViaje').oninput = e => { estadoUI.buscar = e.target.value; renderSchedule(); };
  $('#filtroEstado').onchange = e => { estadoUI.fEstado = e.target.value; renderSchedule(); };
  $('#filtroUnidad').onchange = e => { estadoUI.fUnidad = e.target.value; renderSchedule(); };
  $('#filtroConductor').onchange = e => { estadoUI.fConductor = e.target.value; renderSchedule(); };
  $('#nuevoViajeBtn').onclick = () => editarViaje(null, { fecha: hoyISO() });
  $('#capturaBtn').onclick = capturaRapida;
  $('#capturaRapida').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); capturaRapida(); } };
  $('#pegarTextoBtn').onclick = dialogoPegarTexto;
  conectarSchedule();
  $('#leerFotoBtn').onclick = dialogoLeerFoto;
  $('#generarPlantillaBtn').onclick = () => dialogoGenerar();
  $('#generarPlantillaBtn2').onclick = () => dialogoGenerar();
  $('#exportViajesBtn').onclick = () =>
    descargar(`viajes-${hoyISO()}.csv`, aCSV(ordenarViajes(viajesFiltrados()), COLS_VIAJE), 'text/csv');

  /* Inventario */
  $('#buscarUnidad').oninput = renderInventario;
  $('#filtroEstadoUnidad').onchange = renderInventario;
  $('#filtroCategoria').onchange = renderInventario;
  $('#nuevaUnidadBtn').onclick = () => editarUnidad(null);
  $('#importUnidadBtn').onclick = () => dialogoImportar('unidades');
  $('#exportUnidadBtn').onclick = () => descargar(`inventario-${hoyISO()}.csv`, aCSV(DB.unidades, COLS_UNIDAD), 'text/csv');

  /* Conductores */
  $('#buscarConductor').oninput = renderConductores;
  $('#filtroEstadoConductor').onchange = renderConductores;
  $('#nuevoConductorBtn').onclick = () => editarConductor(null);
  $('#importConductorBtn').onclick = () => dialogoImportar('conductores');
  $('#exportConductorBtn').onclick = () => descargar(`conductores-${hoyISO()}.csv`, aCSV(DB.conductores, COLS_CONDUCTOR), 'text/csv');

  /* Clientes */
  $('#buscarCliente').oninput = renderClientes;
  $('#filtroEstadoUS').onchange = renderClientes;
  $('#nuevoClienteBtn').onclick = () => editarCliente(null);
  $('#importClienteBtn').onclick = () => dialogoImportar('clientes');
  $('#exportClienteBtn').onclick = () => descargar(`clientes-${hoyISO()}.csv`, aCSV(DB.clientes, COLS_CLIENTE), 'text/csv');

  /* Plantillas */
  $('#nuevaPlantillaBtn').onclick = () => editarPlantilla(null);

  /* Datos */
  $('#backupBtn').onclick = respaldar;
  $('#restoreBtn').onclick = restaurar;
  $('#empresaForm').onsubmit = e => {
    e.preventDefault();
    DB.empresa = {
      nombre: $('#cfgEmpresa').value.trim(), dispatch: $('#cfgDispatch').value.trim(),
      contacto: $('#cfgContacto').value.trim(), caat: $('#cfgCaat').value.trim(), scac: $('#cfgScac').value.trim()
    };
    DB.preferencias = Object.assign({}, DB.preferencias, {
      formatoFecha: $('#cfgFormatoFecha').value,
      origenPorDefecto: $('#cfgOrigen').value.trim()
    });
    guardar(); render(); toast('Datos de la compañía guardados.');
  };
  $('#cargarAxlBtn').onclick = () => cargarInventarioAXL();
  $('#nuevoUsuarioBtn').onclick = () => editarUsuario(null);

  /* Papeles */
  $('#generarPapelesBtn').onclick = () => ejecutarComando($('#comandoPapeles').value);
  $('#comandoPapeles').onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); ejecutarComando($('#comandoPapeles').value); }
  };
  $('#nuevoFormatoBtn').onclick = () => editarFormato(null);

  /* Llave de la API para leer fotos */
  const pintarEstadoIa = () => {
    const llave = localStorage.getItem(CLAVE_API);
    $('#estadoIa').textContent = llave
      ? `Llave guardada (termina en …${llave.slice(-4)}). Ya puedes usar "Leer foto con IA" en el schedule.`
      : 'Sin llave configurada: la lectura de fotos está apagada.';
    $('#cfgApiKey').value = '';
    $('#cfgApiKey').placeholder = llave ? '•••••••• (guardada)' : 'sk-ant-...';
  };
  pintarEstadoIa();
  $('#iaForm').onsubmit = e => {
    e.preventDefault();
    const llave = $('#cfgApiKey').value.trim();
    if (!llave) return toast('Pega la llave antes de guardar.');
    localStorage.setItem(CLAVE_API, llave);
    pintarEstadoIa();
    toast('Llave guardada en este navegador.');
  };
  $('#borrarIaBtn').onclick = () => {
    localStorage.removeItem(CLAVE_API);
    pintarEstadoIa();
    toast('Llave borrada.');
  };
  $('#probarIaBtn').onclick = async () => {
    const llave = $('#cfgApiKey').value.trim() || localStorage.getItem(CLAVE_API);
    if (!llave) return toast('Primero guarda una llave.');
    $('#estadoIa').textContent = 'Probando la conexión…';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-api-key': llave,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODELO_IA, max_tokens: 16,
          messages: [{ role: 'user', content: 'Responde solamente: listo' }]
        })
      });
      $('#estadoIa').textContent = r.ok
        ? '✓ Conexión correcta: la lectura de fotos está lista.'
        : (r.status === 401 ? '✗ La llave no es válida.' : `✗ Claude respondió con error ${r.status}.`);
    } catch {
      $('#estadoIa').textContent = '✗ El navegador bloqueó la conexión. Abre la página desde tu computadora o desde GitHub Pages.';
    }
  };
  $('#passForm').onsubmit = async e => {
    e.preventDefault();
    const yo = DB.usuarios.find(x => x.id === sesion.id);
    const act = $('#passActual').value, n1 = $('#passNueva').value, n2 = $('#passNueva2').value;
    if (!(await claveCorrecta(yo, act))) return toast('La contraseña actual no es correcta.');
    if (n1.length < 4) return toast('La nueva contraseña debe tener al menos 4 caracteres.');
    if (n1 !== n2) return toast('Las contraseñas nuevas no coinciden.');
    await cambiarClave(yo, n1); guardar(); render();
    $('#passForm').reset(); toast('Tu contraseña quedó actualizada.');
  };
  $('#catalogosForm').onsubmit = e => {
    e.preventDefault();
    const lista = v => v.split(',').map(s => s.trim()).filter(Boolean);
    const c = {
      estadosViaje: lista($('#catEstadosViaje').value),
      estadosUnidad: lista($('#catEstadosUnidad').value),
      tiposUnidad: lista($('#catTiposUnidad').value),
      estadosConductor: lista($('#catEstadosConductor').value)
    };
    Object.keys(c).forEach(k => { if (c[k].length) DB.catalogos[k] = c[k]; });
    guardar(); render(); toast('Catálogos guardados.');
  };
  $('#borrarViajesBtn').onclick = () => {
    abrirModal('Borrar viajes de un rango',
      formHTML([
        { k: 'desde', t: 'Desde', tipo: 'date', valor: hoyISO() },
        { k: 'hasta', t: 'Hasta', tipo: 'date', valor: addDias(hoyISO(), 30) }
      ]),
      [{ texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
       { texto: 'Borrar', clase: 'danger', accion: () => {
         const d = leerForm();
         const afectados = DB.viajes.filter(v => v.fecha >= d.desde && v.fecha <= d.hasta).length;
         confirmar('Confirmar', `Se borrarán ${afectados} viaje(s) entre ${fechaCorta(d.desde)} y ${fechaCorta(d.hasta)}.`, () => {
           DB.viajes = DB.viajes.filter(v => !(v.fecha >= d.desde && v.fecha <= d.hasta));
           guardar(); cerrarModal(); render(); toast(`${afectados} viaje(s) borrados.`);
         }, 'Borrar');
       } }]);
  };
  $('#resetBtn').onclick = () => confirmar('Borrar todo',
    'Se borrará TODA la información (viajes, unidades, conductores y plantillas) de este navegador. Descarga un respaldo antes si la necesitas.',
    () => {
      const auth = DB.auth, empresa = DB.empresa;
      DB = ESTADO_INICIAL(); DB.auth = auth; DB.empresa = empresa;
      guardar(); render(); toast('Todo borrado.');
    }, 'Borrar todo');
}

const IMPORTABLES = {
  unidades: { titulo: 'Importar inventario (CSV)', cols: COLS_UNIDAD, archivo: 'plantilla-inventario.csv',
    clave: 'el número económico o la placa', fn: t => importarUnidades(t) },
  conductores: { titulo: 'Importar operadores (CSV)', cols: COLS_CONDUCTOR, archivo: 'plantilla-conductores.csv',
    clave: 'el nombre', fn: t => importarConductores(t) },
  clientes: { titulo: 'Importar clientes (CSV)', cols: COLS_CLIENTE, archivo: 'plantilla-clientes.csv',
    clave: 'el nombre y la ciudad', fn: t => importarClientes(t) }
};
function dialogoImportar(tipo) {
  if (sesion.rol !== 'admin') return;
  const cfg = IMPORTABLES[tipo];
  abrirModal(cfg.titulo,
    `<p>Sube un archivo <b>CSV</b> (en Excel: <i>Archivo → Guardar como → CSV</i>). La primera fila debe tener los títulos de las columnas.</p>
     <p class="muted">Columnas reconocidas (los nombres pueden variar, se detectan automáticamente):<br><code>${esc(cfg.cols.map(c => c.titulo).join(', '))}</code></p>
     <p class="muted">Si ${cfg.clave} ya existe, el registro se <b>actualiza</b> en lugar de duplicarse.</p>`,
    [{ texto: 'Descargar plantilla CSV', clase: 'ghost', accion: () => descargar(cfg.archivo, aCSV([], cfg.cols), 'text/csv') },
     { texto: 'Cancelar', clase: 'ghost', accion: cerrarModal },
     { texto: 'Elegir archivo', clase: 'primary', accion: () => {
        cerrarModal();
        pedirArchivo('.csv,.txt,text/csv', cfg.fn);
      } }]);
}

/* ---------------- Arranque ---------------- */
async function iniciar() {
  const tema = localStorage.getItem('axl_tema');
  if (tema) document.documentElement.dataset.theme = tema;   // si no, manda el tema del sistema
  cargar();
  /* La primera vez que se abre, se carga el inventario propio de AXL */
  if (!DB.unidades.length && !DB.conductores.length && !DB.clientes.length) cargarInventarioAXL(true);
  sembrarFormatos();
  await sembrarUsuarios();
  conectarEventos();
  $('#loginEmpresa').textContent = DB.empresa.nombre || 'Control de Schedule y Flota';
  $('#firstRunHint').textContent = 'Cada persona entra con su propio usuario. Si no recuerdas el tuyo, ' +
    'quien tiene permiso de editar puede verlo y cambiar tu contraseña en Datos y Ajustes.';
}
document.addEventListener('DOMContentLoaded', iniciar);
