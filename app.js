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
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
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
  catalogos: JSON.parse(JSON.stringify(CATALOGOS_DEF)),
  unidades: [],
  conductores: [],
  clientes: [],
  viajes: [],
  plantillas: [],
  actualizado: null
});

let DB = ESTADO_INICIAL();
let sesion = { rol: 'guest', nombre: '' };

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const d = JSON.parse(crudo);
      DB = Object.assign(ESTADO_INICIAL(), d);
      DB.catalogos = Object.assign(JSON.parse(JSON.stringify(CATALOGOS_DEF)), d.catalogos || {});
      DB.empresa = Object.assign({}, EMPRESA_DEF, d.empresa || {});
      DB.auth = Object.assign({ hash: '', salt: '', configurada: false }, d.auth || {});
      ['unidades', 'conductores', 'clientes', 'viajes', 'plantillas'].forEach(k => {
        if (!Array.isArray(DB[k])) DB[k] = [];
      });
    }
  } catch (e) {
    console.error('No se pudo leer la información guardada', e);
    toast('No se pudo leer la información guardada; se empezó con datos vacíos.');
  }
}
function guardar() {
  DB.actualizado = new Date().toISOString();
  try {
    localStorage.setItem(CLAVE, JSON.stringify(DB));
  } catch (e) {
    toast('¡No se pudo guardar! El almacenamiento del navegador está lleno. Descarga un respaldo.');
    console.error(e);
  }
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
async function definirPass(pass) {
  const salt = uid() + uid();
  DB.auth = { salt, hash: await hashPass(pass, salt), configurada: true };
}
async function verificarPass(pass) {
  if (!DB.auth.configurada) return false;
  return (await hashPass(pass, DB.auth.salt)) === DB.auth.hash;
}

/* ---------------- Búsquedas por id ---------------- */
const unidad = id => DB.unidades.find(u => u.id === id);
const conductor = id => DB.conductores.find(c => c.id === id);
const nombreUnidad = id => { const u = unidad(id); return u ? (u.numero || u.placa || 'Unidad') : ''; };
const nombreConductor = id => { const c = conductor(id); return c ? c.nombre : ''; };

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
function minutos(h) {
  if (!h) return null;
  const [a, b] = String(h).split(':').map(Number);
  return (isNaN(a) ? null : a * 60 + (b || 0));
}
function seEmpalman(a, b) {
  const a1 = minutos(a.horaSalida), a2 = minutos(a.horaLlegada);
  const b1 = minutos(b.horaSalida), b2 = minutos(b.horaLlegada);
  if (a1 === null || b1 === null) return true;           // sin horas: se considera conflicto el mismo día
  const fa = a2 === null || a2 <= a1 ? a1 + 60 : a2;
  const fb = b2 === null || b2 <= b1 ? b1 + 60 : b2;
  return a1 < fb && b1 < fa;
}
function conflictos(viaje) {
  const cancelado = v => /cancel/i.test(v.estado || '');
  if (cancelado(viaje)) return [];
  return DB.viajes.filter(v =>
    v.id !== viaje.id && v.fecha === viaje.fecha && !cancelado(v) &&
    ((viaje.unidadId && v.unidadId === viaje.unidadId) ||
     (viaje.remolqueId && v.remolqueId === viaje.remolqueId) ||
     (viaje.conductorId && v.conductorId === viaje.conductorId)) &&
    seEmpalman(v, viaje));
}

/* =========================================================
   VIAJES
   ========================================================= */
function camposViaje(v = {}) {
  return [
    { k: 'fecha', t: 'Fecha', tipo: 'date', valor: v.fecha || hoyISO(), req: true },
    { k: 'estado', t: 'Estado', tipo: 'select', opciones: DB.catalogos.estadosViaje, valor: v.estado || DB.catalogos.estadosViaje[0], vacio: false },
    { k: 'horaSalida', t: 'Hora de salida', tipo: 'time', valor: v.horaSalida || '' },
    { k: 'horaLlegada', t: 'Hora estimada de llegada', tipo: 'time', valor: v.horaLlegada || '' },
    { k: 'origen', t: 'Origen', valor: v.origen || '', ph: 'Ciudad / planta', req: true, lista: lugares() },
    { k: 'destino', t: 'Destino', valor: v.destino || '', ph: 'Ciudad / cliente', req: true, lista: lugares() },
    { k: 'cliente', t: 'Cliente', valor: v.cliente || '', lista: nombresCliente() },
    { k: 'referencia', t: 'Referencia / orden', valor: v.referencia || '' },
    { k: 'unidadId', t: 'Tractor', tipo: 'select', opciones: opcionesUnidad('Tractor'), valor: v.unidadId || '', vacio: '— sin asignar —' },
    { k: 'remolqueId', t: 'Remolque / caja', tipo: 'select', opciones: opcionesUnidad('Remolque'), valor: v.remolqueId || '', vacio: '— sin asignar —' },
    { k: 'conductorId', t: 'Conductor', tipo: 'select', opciones: opcionesConductor(), valor: v.conductorId || '', vacio: '— sin asignar —' },
    { k: 'carga', t: 'Carga / mercancía', valor: v.carga || '' },
    { k: 'millas', t: 'Millas / km', tipo: 'number', paso: '1', valor: v.millas || '' },
    { k: 'tarifa', t: 'Tarifa ($)', tipo: 'number', paso: '0.01', valor: v.tarifa || '' },
    { k: 'notas', t: 'Notas', tipo: 'textarea', valor: v.notas || '', ancho: 'full' }
  ];
}

function editarViaje(id, prefill = {}) {
  if (sesion.rol !== 'admin') return;
  const existente = id ? DB.viajes.find(v => v.id === id) : null;
  const base = existente || prefill;
  abrirModal(existente ? 'Editar viaje' : 'Nuevo viaje',
    formHTML(camposViaje(base)) + '<p id="avisoConflicto" class="hint"></p>',
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
  const viaje = Object.assign({ id: existente ? existente.id : uid(), creado: existente?.creado || new Date().toISOString() }, existente || {}, d);
  viaje.modificado = new Date().toISOString();

  const choques = conflictos(viaje);
  const aplicar = () => {
    if (existente) {
      const i = DB.viajes.findIndex(v => v.id === existente.id);
      DB.viajes[i] = viaje;
    } else DB.viajes.push(viaje);
    guardar(); cerrarModal(); render();
    toast(existente ? 'Viaje actualizado.' : 'Viaje agregado al schedule.');
  };

  if (choques.length) {
    const lista = choques.map(c =>
      `<li>${esc(c.horaSalida || 's/h')} ${esc(c.origen)} → ${esc(c.destino)} · ${esc(nombreUnidad(c.unidadId) || 'sin unidad')} · ${esc(nombreConductor(c.conductorId) || 'sin conductor')}</li>`).join('');
    abrirModal('Empalme detectado',
      `<p>Ese mismo día la unidad o el conductor ya tienen asignado:</p><ul>${lista}</ul>
       <p class="muted">Puedes guardarlo de todos modos si es intencional.</p>`,
      [{ texto: 'Regresar', clase: 'ghost', accion: () => editarViaje(existente ? existente.id : null, viaje) },
       { texto: 'Guardar de todos modos', clase: 'primary', accion: aplicar }]);
    return;
  }
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
  const choques = conflictos(v);
  abrirModal('Detalle del viaje',
    `<div class="detalle"><dl>
      ${fila('Fecha', fechaLarga(v.fecha))}
      ${fila('Horario', [v.horaSalida, v.horaLlegada].filter(Boolean).join(' → '))}
      <dt>Estado</dt><dd><span class="chip ${claseEstado(v.estado)}">${esc(v.estado || '—')}</span></dd>
      ${fila('Ruta', `${v.origen || '?'} → ${v.destino || '?'}`)}
      ${fila('Cliente', v.cliente)}
      ${fila('Referencia', v.referencia)}
      ${fila('Tractor', nombreUnidad(v.unidadId))}
      ${fila('Remolque', nombreUnidad(v.remolqueId))}
      ${fila('Conductor', nombreConductor(v.conductorId))}
      ${fila('Carga', v.carga)}
      ${fila('Millas / km', v.millas)}
      ${fila('Tarifa', v.tarifa ? '$' + v.tarifa : '')}
      ${fila('Notas', v.notas)}
    </dl>${choques.length ? `<p class="error">⚠ Empalme con ${choques.length} viaje(s) el mismo día.</p>` : ''}</div>`,
    [{ texto: 'Cerrar', clase: 'ghost', accion: cerrarModal },
     { texto: 'Editar', clase: 'primary', adminOnly: true, accion: () => editarViaje(id) }]);
}

/* ---------------- Filtros del schedule ---------------- */
let estadoUI = {
  vista: 'semana',
  ancla: hoyISO(),
  buscar: '', fEstado: '', fUnidad: '', fConductor: '',
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
const ordenarViajes = arr => arr.slice().sort((a, b) =>
  (a.fecha || '').localeCompare(b.fecha || '') ||
  (a.horaSalida || '99:99').localeCompare(b.horaSalida || '99:99'));

function tarjetaViaje(v) {
  const cls = claseEstado(v.estado);
  const meta = [nombreUnidad(v.unidadId), nombreUnidad(v.remolqueId), nombreConductor(v.conductorId)]
    .filter(Boolean).join(' · ');
  return `<div class="viaje e-${cls}" data-viaje="${v.id}" title="${esc(v.notas || '')}">
    <div class="hora">${esc(v.horaSalida || 's/h')}${v.horaLlegada ? ' – ' + esc(v.horaLlegada) : ''}</div>
    <div class="ruta">${esc(v.origen || '?')} → ${esc(v.destino || '?')}</div>
    ${v.cliente ? `<div class="meta">${esc(v.cliente)}</div>` : ''}
    ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
    <div class="meta"><span class="chip ${cls}">${esc(v.estado || 'Programado')}</span></div>
  </div>`;
}

/* ---------------- Render: Schedule ---------------- */
function renderSchedule() {
  const cont = $('#scheduleBody');
  const datos = viajesFiltrados();
  const hoy = hoyISO();

  if (estadoUI.vista === 'semana') {
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
        `<button class="mes-item" data-viaje="${v.id}">${esc(v.horaSalida || '')} ${esc(v.destino || v.origen || 'Viaje')}</button>`).join('');
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
        { t: 'Salida', v: v => v.horaSalida || '' },
        { t: 'Llegada', v: v => v.horaLlegada || '' },
        { t: 'Origen', v: v => esc(v.origen) },
        { t: 'Destino', v: v => esc(v.destino) },
        { t: 'Cliente', v: v => esc(v.cliente) },
        { t: 'Tractor', v: v => esc(nombreUnidad(v.unidadId)) },
        { t: 'Remolque', v: v => esc(nombreUnidad(v.remolqueId)) },
        { t: 'Operador', v: v => esc(nombreConductor(v.conductorId)) },
        { t: 'Estado', v: v => `<span class="chip ${claseEstado(v.estado)}">${esc(v.estado || '')}</span>` }
      ], lista, v => `<button class="btn mini" data-viaje="${v.id}">Ver</button>` +
        (sesion.rol === 'admin' ? ` <button class="btn mini admin-only" data-editar-viaje="${v.id}">Editar</button>` : ''),
      'No hay viajes que coincidan con el filtro.')}</div>
      <p class="hint">${lista.length} viaje(s)</p></div>`;
  }

  cont.onclick = e => {
    const ver = e.target.closest('[data-viaje]');
    if (ver) return verViaje(ver.dataset.viaje);
    const ed = e.target.closest('[data-editar-viaje]');
    if (ed) return editarViaje(ed.dataset.editarViaje);
    const nuevo = e.target.closest('[data-nuevo]');
    if (nuevo) return editarViaje(null, { fecha: nuevo.dataset.nuevo });
    const dia = e.target.closest('[data-dia]');
    if (dia && sesion.rol === 'admin') return editarViaje(null, { fecha: dia.dataset.dia });
  };
}

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
    { t: 'Operador', v: u => esc((DB.conductores.find(c => c.unidadId === u.id) || {}).nombre || '') },
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
    ${prox.length ? '<ul>' + prox.map(v => `<li>${fechaCorta(v.fecha)} ${esc(v.horaSalida || '')} — ${esc(v.origen)} → ${esc(v.destino)}</li>`).join('') + '</ul>'
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
    { t: 'Nombre', v: c => `<strong>${esc(c.nombre)}</strong>` },
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
    { t: 'Cliente', v: c => `<strong>${esc(c.nombre)}</strong>` },
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
    { k: 'horaSalida', t: 'Hora de salida', tipo: 'time', valor: p.horaSalida || '' },
    { k: 'horaLlegada', t: 'Hora de llegada', tipo: 'time', valor: p.horaLlegada || '' },
    { k: 'origen', t: 'Origen', valor: p.origen || '', req: true, lista: lugares() },
    { k: 'destino', t: 'Destino', valor: p.destino || '', req: true, lista: lugares() },
    { k: 'cliente', t: 'Cliente', valor: p.cliente || '', lista: nombresCliente() },
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
    { t: 'Horario', v: p => esc([p.horaSalida, p.horaLlegada].filter(Boolean).join(' – ')) },
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
           const yaExiste = DB.viajes.some(v => v.plantillaId === p.id && v.fecha === f && (v.horaSalida || '') === (p.horaSalida || ''));
           if (yaExiste) { omitidos++; return; }
           DB.viajes.push({
             id: uid(), plantillaId: p.id, fecha: f,
             horaSalida: p.horaSalida || '', horaLlegada: p.horaLlegada || '',
             origen: p.origen || '', destino: p.destino || '', cliente: p.cliente || '',
             unidadId: p.unidadId || '', remolqueId: p.remolqueId || '', conductorId: p.conductorId || '',
             carga: p.carga || '', tarifa: p.tarifa || '', notas: p.notas || '',
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
        { t: 'Hora', v: v => esc(v.horaSalida || '') },
        { t: 'Ruta', v: v => esc(`${v.origen || '?'} → ${v.destino || '?'}`) },
        { t: 'Unidad', v: v => esc(nombreUnidad(v.unidadId)) },
        { t: 'Conductor', v: v => esc(nombreConductor(v.conductorId)) },
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
  const vistos = new Set();
  DB.viajes.filter(v => v.fecha >= hoy && v.fecha <= addDias(hoy, 14)).forEach(v => {
    conflictos(v).forEach(c => {
      const clave = [v.id, c.id].sort().join('|');
      if (vistos.has(clave)) return;
      vistos.add(clave);
      avisos.push(['warn', `Empalme el ${fechaCorta(v.fecha)}: ${v.origen}→${v.destino} y ${c.origen}→${c.destino} comparten unidad o conductor.`]);
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
  { titulo: 'estado', valor: c => c.estado }, { titulo: 'notas', valor: c => c.notas }
];
const COLS_VIAJE = [
  { titulo: 'fecha', valor: v => v.fecha }, { titulo: 'horaSalida', valor: v => v.horaSalida },
  { titulo: 'horaLlegada', valor: v => v.horaLlegada }, { titulo: 'origen', valor: v => v.origen },
  { titulo: 'destino', valor: v => v.destino }, { titulo: 'cliente', valor: v => v.cliente },
  { titulo: 'referencia', valor: v => v.referencia }, { titulo: 'tractor', valor: v => nombreUnidad(v.unidadId) },
  { titulo: 'remolque', valor: v => nombreUnidad(v.remolqueId) },
  { titulo: 'conductor', valor: v => nombreConductor(v.conductorId) }, { titulo: 'carga', valor: v => v.carga },
  { titulo: 'millas', valor: v => v.millas }, { titulo: 'tarifa', valor: v => v.tarifa },
  { titulo: 'estado', valor: v => v.estado }, { titulo: 'notas', valor: v => v.notas }
];

const COLS_CLIENTE = [
  { titulo: 'nombre', valor: c => c.nombre }, { titulo: 'direccion', valor: c => c.direccion },
  { titulo: 'ciudad', valor: c => c.ciudad }, { titulo: 'estado', valor: c => c.estado },
  { titulo: 'cp', valor: c => c.cp }, { titulo: 'contacto', valor: c => c.contacto },
  { titulo: 'telefono', valor: c => c.telefono }, { titulo: 'horario', valor: c => c.horario },
  { titulo: 'notas', valor: c => c.notas }
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
    // Formato latino día/mes/año; si el segundo número no puede ser mes, se invierte
    let dia = a, mes = b;
    if (b > 12 && a <= 12) { dia = b; mes = a; }
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
  $('#roleBadge').textContent = sesion.rol === 'admin' ? 'Administrador' : ('Consulta' + (sesion.nombre ? ' · ' + sesion.nombre : ''));
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

  $('#cfgEmpresa').value = DB.empresa.nombre || '';
  $('#cfgDispatch').value = DB.empresa.dispatch || '';
  $('#cfgContacto').value = DB.empresa.contacto || '';
  $('#cfgCaat').value = DB.empresa.caat || '';
  $('#cfgScac').value = DB.empresa.scac || '';
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
function entrarComo(rol, nombre = '') {
  sesion = { rol, nombre };
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  render();
  irA('panel');
}
function salir() {
  sesion = { rol: 'guest', nombre: '' };
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginPass').value = '';
  $('#loginError').classList.add('hidden');
}

/* ---------------- Eventos ---------------- */
function conectarEventos() {
  /* Login */
  let modoLogin = 'admin';
  $$('.ltab').forEach(b => b.onclick = () => {
    modoLogin = b.dataset.mode;
    $$('.ltab').forEach(x => x.classList.toggle('active', x === b));
    $('#adminFields').classList.toggle('hidden', modoLogin !== 'admin');
    $('#guestFields').classList.toggle('hidden', modoLogin !== 'guest');
    $('#loginError').classList.add('hidden');
  });

  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#loginError');
    if (modoLogin === 'guest') return entrarComo('guest', $('#guestName').value.trim());
    const pass = $('#loginPass').value;
    if (!DB.auth.configurada) {
      if (pass.length < 4) { err.textContent = 'Elige una contraseña de al menos 4 caracteres.'; return err.classList.remove('hidden'); }
      await definirPass(pass);
      guardar();
      toast('Contraseña de administrador creada. Guárdala bien.');
      return entrarComo('admin');
    }
    if (await verificarPass(pass)) { err.classList.add('hidden'); return entrarComo('admin'); }
    err.textContent = 'Contraseña incorrecta.';
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
    guardar(); render(); toast('Datos de la compañía guardados.');
  };
  $('#cargarAxlBtn').onclick = () => cargarInventarioAXL();
  $('#passForm').onsubmit = async e => {
    e.preventDefault();
    const act = $('#passActual').value, n1 = $('#passNueva').value, n2 = $('#passNueva2').value;
    if (DB.auth.configurada && !(await verificarPass(act))) return toast('La contraseña actual no es correcta.');
    if (n1.length < 4) return toast('La nueva contraseña debe tener al menos 4 caracteres.');
    if (n1 !== n2) return toast('Las contraseñas nuevas no coinciden.');
    await definirPass(n1); guardar();
    $('#passForm').reset(); toast('Contraseña actualizada.');
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
function iniciar() {
  const tema = localStorage.getItem('axl_tema');
  if (tema) document.documentElement.dataset.theme = tema;   // si no, manda el tema del sistema
  cargar();
  /* La primera vez que se abre, se carga el inventario propio de AXL */
  if (!DB.unidades.length && !DB.conductores.length && !DB.clientes.length) cargarInventarioAXL(true);
  conectarEventos();
  $('#loginEmpresa').textContent = DB.empresa.nombre || 'Control de Schedule y Flota';
  $('#firstRunHint').textContent = DB.auth.configurada
    ? ''
    : 'Es la primera vez que se abre en este navegador: la contraseña que escribas quedará guardada como la del administrador.';
  if (!DB.auth.configurada) $('#loginPass').placeholder = 'Crea tu contraseña de administrador';
}
document.addEventListener('DOMContentLoaded', iniciar);
