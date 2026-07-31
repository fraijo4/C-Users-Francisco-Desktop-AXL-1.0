/* =========================================================
   Inventario y directorio de AXL Transport
   Estos datos se cargan la primera vez que se abre la página
   y también con el botón "Cargar inventario de AXL" en Ajustes.
   Se pueden editar y borrar libremente dentro de la aplicación.
   ========================================================= */
'use strict';

const DATOS_AXL = {
  empresa: { nombre: 'AXL Transport', dispatch: '', contacto: '', caat: '43E8', scac: 'AJXT' },

  /* ---- Tractores (con su operador asignado) ---- */
  tractores: [
    { numero: 'T-03', marca: 'Kenworth',     anio: '2016', vin: '1XKYD49XXGJ485237', placa: 'ZP89543CA', operador: 'Alberto Herrera' },
    { numero: 'T-12', marca: 'Freightliner', anio: '2015', vin: '1FUJGBDV3FLFZ2286', placa: 'ZP80041CA', operador: 'Juan Carlos Ruiz Alarcón' },
    { numero: 'T-14', marca: 'Freightliner', anio: '2018', vin: '3AKJGHDV8JSHN1903', placa: 'ZP34130CA', operador: 'Martin López Briseño' },
    { numero: 'T-15', marca: 'Freightliner', anio: '2019', vin: '3AKJGLDV5KDKH4509', placa: 'ZP63592CA', operador: 'Alberto Villalbazo González' },
    { numero: 'T-16', marca: 'Freightliner', anio: '2018', vin: '3AKJHHFG3JSJJ1297', placa: 'ZP63582CA', operador: 'Mario Omar Hinojosa Sayas' },
    { numero: 'T-17', marca: 'Peterbilt',    anio: '2018', vin: '1XPBD49X6JD480817', placa: 'ZP56506CA', operador: 'Omar Leonel Aceves Rodríguez' },
    { numero: 'T-18', marca: 'Freightliner', anio: '2019', vin: '1FUBGKDRXKLKC9011', placa: 'ZP56514CA', operador: 'Fernando Ruiz Alarcón' },
    { numero: 'T-19', marca: 'International', anio: '2019', vin: '3HCDZAPR2KL769044', placa: 'ZP89544CA', operador: 'Hugo Macías' },
    { numero: 'T-20', marca: 'Kenworth',     anio: '2022', vin: '1XKYD49X8NJ475285', placa: 'ZP91625CA', operador: 'José Francisco Rodríguez Monrroy' },
    { numero: 'T-21', marca: 'Kenworth',     anio: '2022', vin: '1XKYD49X4NJ475106', placa: 'ZP91626CA', operador: 'Rafael Alonso Quezada Navarez' },
    { numero: 'VAT-05', marca: '', anio: '', vin: '1FUJA6CKX4LM61270', placa: '', operador: 'Cesar Hernandez',
      notas: 'Faltan datos: marca, año y placas.' }
  ],

  /* ---- Remolques: cajas secas, refrigeradas y plataformas ---- */
  remolques: [
    { numero: 'AXL-1917', tipo: "Caja seca 53'", placa: '4TE1917CA' },
    { numero: 'AXL-2035', tipo: "Caja seca 53'", placa: '4TE2035CA' },
    { numero: 'AXL-6087', tipo: "Caja seca 53'", placa: '4VA6087CA' },
    { numero: 'AXL-6273', tipo: "Caja seca 53'", placa: '4VA6273CA' },
    { numero: 'AXL-7097', tipo: "Caja seca 53'", placa: '4EV7097CA' },
    { numero: 'AXL-5116', tipo: "Caja seca 53'", placa: '4VL5116CA' },
    { numero: 'AXL-8101', tipo: "Caja seca 53'", placa: '4WD8101CA' },
    { numero: 'AXL-4329', tipo: "Caja seca 53'", placa: '4WG4329CA' },
    { numero: 'AXL-6604', tipo: "Caja refrigerada 53'", placa: '4PS6604CA', placaMx: '82TZ2Z' },
    { numero: 'R2',       tipo: "Caja refrigerada 53'", placa: '4XE4861CA' },
    { numero: 'AXL-9665', tipo: "Plataforma 48'", placa: '4TA9665CA' },
    { numero: 'AXL-4069', tipo: "Plataforma 48'", placa: '4TB4069CA' },
    { numero: 'AXL-4416', tipo: "Plataforma 48'", placa: '4WS4416CA' },
    { numero: 'AXL-5373', tipo: "Plataforma 48'", placa: '4BB5373CA', placaMx: '52-TX-6T' },
    { numero: 'AXL-3178', tipo: "Plataforma 45'", placa: '4LY3178CA' },
    { numero: 'AXL-4006', tipo: "Plataforma 45'", placa: '4HG4006CA', placaMx: '267-XA-7' },
    { numero: 'AXL-4680', tipo: "Plataforma 45'", placa: '4SG4675CA', placaMx: '96-UA-9K',
      notas: 'Revisar: la placa registrada (4SG4675CA) no coincide con el número de caja.' },
    { numero: 'AXL-5462', tipo: "Plataforma 45'", placa: '4NT5462CA' },
    { numero: 'AXL-2007', tipo: "Plataforma 45'", placa: '4AZ2007CA' }
  ],

  /* ---- Directorio de clientes (los que ya están capturados) ---- */
  clientes: [
    { nombre: 'All Around Rock Supply LLC', ciudad: 'Norco', estado: 'CA' },
    { nombre: 'Bourget Bros', ciudad: 'Santa Monica', estado: 'CA' },
    { nombre: 'Foothill Building Supply', ciudad: 'Pomona', estado: 'CA' },
    { nombre: 'Goleta Building Materials', ciudad: 'Goleta', estado: 'CA' },
    { nombre: 'Jacobi Building Materials', ciudad: 'Canoga Park', estado: 'CA' },
    { nombre: 'Ontario Building Materials', ciudad: 'Ontario', estado: 'CA' },
    { nombre: 'Mier Bros Landscape Products', ciudad: 'Arroyo Grande', estado: 'CA' },
    { nombre: 'Premium Pool Finishes', ciudad: 'Ontario', estado: 'CA' },
    { nombre: 'Prime Building Materials', ciudad: 'North Hollywood', estado: 'CA' },
    { nombre: 'Temescal Canyon Rockery', ciudad: 'Corona', estado: 'CA' },
    { nombre: 'The Stone Yard LLC', ciudad: 'Phoenix', estado: 'AZ' },
    { nombre: 'Valley Pool Materials', ciudad: 'Spring Valley', estado: 'CA' },
    { nombre: 'Western States Wholesale', ciudad: 'Ontario', estado: 'CA' },
    { nombre: 'Nimbus Landscape', ciudad: 'Rancho Cordova', estado: 'CA' },
    { nombre: 'DFW Stone Supply — Lewisville', ciudad: 'Lewisville', estado: 'TX' },
    { nombre: 'DFW Stone Supply — Prosper', ciudad: 'Prosper', estado: 'TX' },
    { nombre: 'Decorative Stone Solutions', ciudad: '', estado: '' },
    { nombre: 'Artesia Building Materials', ciudad: '', estado: '' },
    { nombre: 'Arroyo Building Materials', ciudad: '', estado: '' },
    { nombre: 'Advanced Pool Plastering', ciudad: '', estado: '' },
    { nombre: "M&M's Landscaping", ciudad: '', estado: '' },
    { nombre: 'Villalpando Constructions', ciudad: '', estado: '' },
    { nombre: 'NPT Houston', ciudad: 'Houston', estado: 'TX', notas: 'Centro NPT' },
    { nombre: 'NPT Ontario', ciudad: 'Ontario', estado: 'CA', notas: 'Centro NPT' },
    { nombre: 'NPT San Marcos', ciudad: 'San Marcos', estado: '', notas: 'Centro NPT — confirmar si es CA o TX' },
    { nombre: 'NPT Austin', ciudad: 'Austin', estado: 'TX', notas: 'Centro NPT' },
    { nombre: 'Plaster City', ciudad: 'Plaster City', estado: 'CA' }
  ]
};
