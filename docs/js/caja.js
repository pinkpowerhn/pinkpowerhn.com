// Caja de la tienda física. Pantalla de mostrador: se escanea o se busca, se
// cobra y el pedido queda registrado en Shopify (pagado y preparado).
//
// Decisiones que conviene conocer antes de tocar nada:
// - El catálogo se carga UNA vez al abrir y la búsqueda es local: escribir no
//   puede disparar llamadas al servidor o el lector de código se siente lento.
// - El foco vuelve SIEMPRE al buscador después de cada acción. Un lector USB
//   escribe como si fuera un teclado: si el foco está en otro lado, se pierde.
// - Nunca se reintenta una venta sola: se cobraría dos veces.
// - Los desplegables son propios (.pp-select), no <select> nativos: el nativo se
//   ve distinto en cada teléfono y rompe la línea del resto de la pantalla. Es el
//   mismo patrón del selector de orden de la tienda.

const API = 'https://api.pinkpowerhn.com';

// Las redes de la tienda, para invitar a seguirlas desde el recibo. En un solo
// lugar: salen en el mensaje de WhatsApp, en la pagina del recibo y en la imagen.
const TIENDA = {
  instagram: 'pinkpowerhn',
  // Sin "https://": se ve limpio en el chat y WhatsApp lo reconoce igual.
  instagramUrl: 'instagram.com/pinkpowerhn',
  webUrl: 'pinkpowerhn.com',
  web: 'pinkpowerhn.com',
};
const TOKEN_KEY = 'pinkpower_admin_token';
let token = localStorage.getItem(TOKEN_KEY);

const $ = (id) => document.getElementById(id);
const L = (n) => 'L. ' + (Number(n) || 0).toLocaleString('es-HN',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Lee un numero escrito a mano: "390,50", "390.50" o "L. 390" dan 390.5.
const num = (v) => {
  const limpio = String(v == null ? '' : v).replace(',', '.').replace(/[^\d.]/g, '');
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
};
const norm = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s) => (s || '').toString()
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Iconos (trazo, a juego con el resto del sitio).
const IC = {
  lupa: '<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"></path><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  mas: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  persona: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  efectivo: '<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle>',
  tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line>',
  transferencia: '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
  credito: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>',
  entrega: '<path d="M2 7h11v9H2z"></path><path d="M13 10h4l3 3v3h-7z"></path>'
    + '<circle cx="6" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle>',
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  camara: '<path d="M3 8a2 2 0 0 1 2-2h2.2l1.2-2h6.8l1.2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>'
        + '<circle cx="12" cy="12.5" r="3.6"></circle>',
  // Código de barras con el haz del lector cruzándolo.
  whatsapp: '<path fill="currentColor" stroke="none" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.17-.47-.29z"></path>',
  codigo: '<path d="M3 7V5a1 1 0 0 1 1-1h2"></path><path d="M18 4h2a1 1 0 0 1 1 1v2"></path>'
        + '<path d="M21 17v2a1 1 0 0 1-1 1h-2"></path><path d="M6 20H4a1 1 0 0 1-1-1v-2"></path>'
        + '<line x1="7" y1="8" x2="7" y2="16"></line><line x1="10" y1="8" x2="10" y2="16"></line>'
        + '<line x1="14" y1="8" x2="14" y2="16"></line><line x1="17" y1="8" x2="17" y2="16"></line>',
};
const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// Modo prueba: se activa abriendo /caja/?prueba=1. La venta se arma igual en
// Shopify (precios, descuentos, mayoreo) pero se borra en vez de cobrarse, asi
// que no gasta numero de pedido ni toca el inventario.
const MODO_PRUEBA = new URLSearchParams(location.search).has('prueba');

const estado = {
  catalogo: [],
  porBarcode: new Map(),
  porVariante: new Map(),   // variante -> fila del catálogo (para las existencias)
  cargandoCatalogo: true,
  errorCatalogo: '',
  resultados: [],
  venta: [],            // líneas de la venta
  cliente: null,
  mayoreo: false,       // interruptor manual de precios de mayoreo
  descuento: { tipo: '', valor: 0 },
  descAbierto: false,   // desplegable propio del descuento
  flete: '',            // '', 'local' o 'nacional'
  preparado: true,      // ¿ya se lo lleva? si no, el pedido queda por preparar
  entregaTocada: false, // la cajera lo decidió a mano: no volver a adivinarlo
  pago: '',
  banco: '',            // a qué banco entró la transferencia
  bancoAbierto: false,  // su desplegable
  recibido: '',
  parcial: false,       // la clienta abona una parte y queda debiendo el resto
  abono: '',            // cuánto entrega ahora
  mixto: false,         // pagó con dos métodos (400 en tarjeta y 600 en transferencia)
  monto1: '',           // cuánto con el primer método
  pago2: '',            // el segundo método
  banco2: '',
  monto2: '',
  nota: '',
  cobrando: false,
  cotizando: false,     // armando el prerecibo, que no cobra nada
  resultado: null,      // venta terminada
  error: '',
  buscandoCliente: false,
  resClientes: null,    // null = no se buscó; [] = sin resultados
  hayCamara: false,     // se muestra el botón de escanear solo si el equipo tiene
  codigoSinHallar: '',  // último código escaneado que no está en el catálogo
  resultadosTotal: 0,   // cuántos coincidieron de verdad (la lista muestra los primeros)
  buscadoEnShopify: false,   // estos resultados los trajo Shopify, no el catálogo
  recientes: [],        // últimas clientas atendidas
  verRecientes: false,  // se muestran al tocar el campo, antes de escribir
};

// ── La venta a medio armar no se pierde ──────────────────────────────────────
// En el teléfono, cambiar de aplicación o bloquear la pantalla descarta la
// página: la cajera volvía y no tenía nada. Se guarda lo armado y se recupera.
const GUARDADO = 'pinkpower_caja_venta';
const GUARDADO_TTL = 6 * 60 * 60 * 1000;   // seis horas: más viejo que eso, no sirve

// La venta tal como está armada. Sirve para dos cosas: guardarla por si se
// cierra la pestaña, y dejarla pegada a una cotización para poder retomarla.
function loArmado() {
  return {
    venta: estado.venta, cliente: estado.cliente,
    mayoreo: estado.mayoreo, descuento: estado.descuento,
    pago: estado.pago, banco: estado.banco, flete: estado.flete,
    preparado: estado.preparado, entregaTocada: estado.entregaTocada,
    parcial: estado.parcial, abono: estado.abono,
    mixto: estado.mixto, monto1: estado.monto1,
    pago2: estado.pago2, banco2: estado.banco2, monto2: estado.monto2,
    recibido: estado.recibido, nota: estado.nota,
  };
}

function aplicarArmado(d) {
  if (!d || !Array.isArray(d.venta) || !d.venta.length) return false;
  estado.venta = d.venta;
  estado.cliente = d.cliente || null;
  estado.mayoreo = !!d.mayoreo;
  estado.descuento = d.descuento || { tipo: '', valor: 0 };
  estado.pago = d.pago || '';
  estado.banco = d.banco || '';
  estado.flete = d.flete || '';
  estado.preparado = d.preparado === undefined ? !d.flete : !!d.preparado;
  estado.entregaTocada = !!d.entregaTocada;
  estado.parcial = !!d.parcial;
  estado.abono = d.abono || '';
  estado.mixto = !!d.mixto;
  estado.monto1 = d.monto1 || '';
  estado.pago2 = d.pago2 || '';
  estado.banco2 = d.banco2 || '';
  estado.monto2 = d.monto2 || '';
  estado.recibido = d.recibido || '';
  estado.nota = d.nota || '';
  return true;
}

function guardarVenta() {
  try {
    // Una venta ya cobrada no se guarda: si se guardara, al volver a abrir la
    // caja reaparecería armada y parecería que el pedido no se creó.
    if (estado.resultado || !estado.venta.length) { localStorage.removeItem(GUARDADO); return; }
    localStorage.setItem(GUARDADO, JSON.stringify({ ts: Date.now(), ...loArmado() }));
  } catch (_) { /* sin espacio o en privado: la caja sigue funcionando igual */ }
}

function recuperarVenta() {
  try {
    const crudo = localStorage.getItem(GUARDADO);
    if (!crudo) return false;
    const d = JSON.parse(crudo);
    if (!d || !Array.isArray(d.venta) || !d.venta.length) return false;
    if (Date.now() - (d.ts || 0) > GUARDADO_TTL) { localStorage.removeItem(GUARDADO); return false; }
    return aplicarArmado(d);
  } catch (_) { return false; }
}

// ── API ──────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    // La venta armada NO se pierde: queda en memoria y vuelve tras el login.
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    mostrarLogin();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    let detalle = 'Error';
    try {
      const d = (await res.json()).detail;
      detalle = typeof d === 'string' ? d : (d || detalle);
    } catch (_) {}
    const err = new Error(typeof detalle === 'string' ? detalle : 'Error');
    err.status = res.status;
    err.detalle = detalle;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ── Login ────────────────────────────────────────────────────────────────────
function mostrarLogin() {
  $('login-view').classList.remove('hidden');
  $('caja-view').classList.add('hidden');
  setTimeout(() => $('l-user').focus(), 60);
}

function mostrarCaja() {
  $('login-view').classList.add('hidden');
  $('caja-view').classList.remove('hidden');
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('login-msg');
  msg.classList.add('hidden');
  const btn = $('l-submit');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const res = await fetch(API + '/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: $('l-user').value.trim(), password: $('l-pass').value }),
    });
    if (!res.ok) throw new Error('Usuario o contraseña incorrectos');
    const data = await res.json();
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    $('l-pass').value = '';
    arrancar();
  } catch (err) {
    msg.textContent = err.message || 'No se pudo entrar';
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

// ── Catálogo ─────────────────────────────────────────────────────────────────
async function cargarCatalogo(intento = 1, forzar = false) {
  estado.cargandoCatalogo = true;
  estado.errorCatalogo = '';
  pintar();
  try {
    const data = await api('/admin/caja/catalogo' + (forzar ? '?refrescar=1' : ''));
    estado.catalogo = (data.variantes || []).map((v) => ({
      ...v,
      // Texto de búsqueda precalculado: buscar no puede recorrer y normalizar
      // 1500 filas en cada tecla.
      busca: norm([v.producto, v.marca, v.variante].filter(Boolean).join(' ')),
    }));
    indexarCatalogo();
  } catch (err) {
    // La primera llamada al abrir falla a veces en el teléfono (la conexión
    // todavía se está levantando). Antes había que refrescar a mano y salía un
    // "Failed to fetch" en inglés; ahora se reintenta solo, dos veces.
    if (intento < 3 && err.message !== 'Sesión expirada') {
      await new Promise((r) => setTimeout(r, 900 * intento));
      return cargarCatalogo(intento + 1, forzar);
    }
    estado.errorCatalogo = err.message === 'Failed to fetch'
      ? 'No se pudo conectar. Revise la señal y toque Reintentar.'
      : (err.message || 'No se pudo cargar el catálogo');
  } finally {
    estado.cargandoCatalogo = false;
    pintar();
    enfocarBuscador();
  }
}

async function cargarRecientes() {
  try {
    const r = await api('/admin/caja/clientes/recientes');
    estado.recientes = r.clientes || [];
  } catch (_) {
    estado.recientes = [];   // sin recientes la caja funciona igual
  }
}

// Repasa el catálogo sin que se note: ni esqueleto ni parpadeo, solo cambia la
// lista en memoria. Así, un código cargado en Shopify aparece a los pocos
// minutos aunque la caja lleve horas abierta.
async function repasarCatalogo() {
  if (estado.cargandoCatalogo || camara) return;
  try {
    const data = await api('/admin/caja/catalogo');
    const nuevas = (data.variantes || []).map((v) => ({
      ...v,
      busca: norm([v.producto, v.marca, v.variante].filter(Boolean).join(' ')),
    }));
    if (!nuevas.length) return;
    estado.catalogo = nuevas;
    indexarCatalogo();
  } catch (_) { /* si falla, se sigue con el que había */ }
}

// Dos índices del catálogo: por código de barras (lo que lee el lector) y por
// variante (para saber, en cualquier momento, cuántas dice el sistema que hay).
function indexarCatalogo() {
  estado.porBarcode = new Map();
  estado.porVariante = new Map();
  for (const v of estado.catalogo) {
    if (v.barcode) estado.porBarcode.set(v.barcode.trim(), v);
    if (v.variant_id) estado.porVariante.set(v.variant_id, v);
  }
}

// Lo que el sistema dice que hay de esa variante. Se mira en el catálogo y no en
// la línea de la venta: así es el número de ahora, no el de cuando se agregó.
function existenciaDe(variantId) {
  const v = variantId && estado.porVariante ? estado.porVariante.get(variantId) : null;
  return v && v.existencia != null ? v.existencia : null;
}

const TOPE_RESULTADOS = 60;

// Lo que la caja no encuentra, se lo pregunta a Shopify: su catálogo local
// guarda título, marca y variante, y hay palabras que viven en la descripción.
let buscaEnCurso = 0;

async function buscarEnShopify(texto) {
  const mia = ++buscaEnCurso;
  const cont = $('resultados');
  if (cont) {
    cont.innerHTML = '<div class="resultados"><div class="vacio">'
      + '<span class="puntos">Buscando en Shopify</span></div></div>';
  }
  let hallados = [];
  try {
    hallados = (await api('/admin/caja/buscar?q=' + encodeURIComponent(texto))).productos || [];
  } catch (_) { hallados = []; }
  // Mientras tanto siguió escribiendo: esta respuesta ya no vale.
  if (mia !== buscaEnCurso) return;
  const q = $('q');
  if (!q || q.value.trim() !== texto) return;

  // Se suman al catálogo para que la próxima búsqueda sea instantánea.
  for (const v of hallados) {
    if (estado.catalogo.some((x) => x.variant_id === v.variant_id)) continue;
    estado.catalogo.push({
      ...v, busca: norm([v.producto, v.marca, v.variante].filter(Boolean).join(' ')),
    });
    if (v.barcode) estado.porBarcode.set(v.barcode.trim(), v);
    if (v.variant_id) estado.porVariante.set(v.variant_id, v);
  }
  estado.resultados = hallados.slice(0, TOPE_RESULTADOS);
  estado.resultadosTotal = hallados.length;
  estado.buscadoEnShopify = true;
  const caja = $('resultados');
  if (caja) caja.innerHTML = bloqueResultados();
}

function buscarProductos(texto) {
  const q = norm(texto).trim();
  if (!q) return [];
  const palabras = q.split(/\s+/).filter(Boolean);
  // Se juntan TODAS las coincidencias y despues se ordena. Antes se cortaba en
  // veinte ANTES de ordenar, y ahi se perdian productos: de los cuarenta y cinco
  // "Coconut" solo llegaban los veinte primeros del catalogo, que esta ordenado
  // por fecha de alta, asi que el que buscaba podia no salir nunca.
  const todas = estado.catalogo.filter((v) => palabras.every((p) => v.busca.includes(p)));
  todas.sort((a, b) => {
    // Los disponibles primero: lo normal es vender lo que hay.
    if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
    // Despues, los que EMPIEZAN por lo que escribio: es lo que suele buscar.
    const ea = a.busca.startsWith(q), eb = b.busca.startsWith(q);
    if (ea !== eb) return ea ? -1 : 1;
    return a.producto.localeCompare(b.producto, 'es');
  });
  estado.resultadosTotal = todas.length;
  estado.buscadoEnShopify = false;
  return todas.slice(0, TOPE_RESULTADOS);
}

// ── Venta ────────────────────────────────────────────────────────────────────
function hayMayoreo() {
  return estado.mayoreo || !!(estado.cliente && estado.cliente.mayoreo);
}

// En una venta de mayoreo, un producto SIN precio de mayoreo se cobra al precio
// de la tienda. Antes pasaba callado: "no hay manera de saber si algo se está
// yendo con precio de detalle". Se marca en la lista, en la búsqueda y arriba
// del botón de cobrar, para poder revisarlo o explicárselo a la clienta.
function sinPrecioMayoreo(l) {
  return hayMayoreo() && !l.manual && !l.especial
    && (l.precioMayoreo == null || l.precioMayoreo === '');
}

function cuantasSinMayoreo() {
  return estado.venta.filter(sinPrecioMayoreo).length;
}

function precioSegunModo(v) {
  if (hayMayoreo() && v.precio_mayoreo != null) return v.precio_mayoreo;
  return v.precio;
}

// `desdeLista` = lo tocó en los resultados de la búsqueda. En ese caso el aviso
// de "ese código no está en el catálogo" se queda donde está: si se quitara, la
// lista subiría una fila justo entre un toque y el siguiente, y el segundo toque
// caería en el producto de al lado. Con el lector sí se limpia, que es cuando el
// aviso ya no viene al caso.
function agregar(v, desdeLista = false) {
  if (!desdeLista) estado.codigoSinHallar = '';
  const existente = estado.venta.find((l) => l.variant_id === v.variant_id);
  if (existente) {
    existente.cantidad += 1;
  } else {
    estado.venta.push({
      variant_id: v.variant_id,
      nombre: v.producto,
      variante: v.variante,
      marca: v.marca,
      imagen: v.imagen,
      precioTienda: v.precio,
      precioMayoreo: v.precio_mayoreo,
      precio: precioSegunModo(v),
      cantidad: 1,
      especial: false,
      manual: false,
    });
  }
  estado.error = '';
  pintar();
  enfocarBuscador();
}

function quitar(i) { estado.venta.splice(i, 1); pintar(); enfocarBuscador(); }

function cambiarCantidad(i, delta) {
  const l = estado.venta[i];
  l.cantidad += delta;
  if (l.cantidad < 1) estado.venta.splice(i, 1);
  pintar();
  enfocarBuscador();
}

// Cuando cambia el modo mayoreo, se recalculan los precios que la cajera NO
// tocó a mano (los especiales se respetan: los escribió ella a propósito).
function recalcularPrecios() {
  const mayoreo = hayMayoreo();
  for (const l of estado.venta) {
    if (l.especial || l.manual) continue;
    l.precio = (mayoreo && l.precioMayoreo != null) ? l.precioMayoreo : l.precioTienda;
  }
}

function subtotal() {
  return estado.venta.reduce((s, l) => s + (Number(l.precio) || 0) * l.cantidad, 0);
}

function montoDescuento() {
  const { tipo, valor } = estado.descuento;
  const v = num(valor);
  if (!tipo || v <= 0) return 0;
  if (tipo === 'porcentaje') return Math.min(subtotal(), subtotal() * Math.min(v, 100) / 100);
  return Math.min(subtotal(), v);
}

// El descuento se aplica sobre los productos; el flete se suma despues, que es
// como lo cobra ella: no se descuenta el envio.
function baseDeCobro() {
  return Math.max(0, subtotal() - montoDescuento()) + elFlete().monto;
}

// Cobrando contraentrega con flete nacional, el servicio de entrega se queda con
// un 5% de TODO lo que cobra. Por eso no se le suma un 5%: se divide entre 0,95,
// que es lo que deja que a la tienda le entre justo lo suyo. Es la misma cuenta
// que ya hace la pagina.
function comision() {
  if (estado.pago !== 'contraentrega' || estado.flete !== 'nacional') return 0;
  const base = baseDeCobro();
  if (base <= 0) return 0;
  return Math.ceil(base / 0.95) - base;
}

function total() {
  return baseDeCobro() + comision();
}

function actualizarTotales() {
  const fijar = (sel, valor) => { const el = document.querySelector(sel); if (el) el.textContent = valor; };
  fijar('.total-grande b', L(total()));
  fijar('.barra__tot b', L(total()));
  const filas = document.querySelectorAll('.total-fila span:last-child');
  if (filas[0]) filas[0].textContent = L(subtotal());

  // La línea del descuento hay que crearla o quitarla acá: mientras la cajera
  // escribe el porcentaje no se repinta la pantalla (perdería el foco del
  // campo), así que antes el descuento se aplicaba pero no se mostraba.
  const monto = montoDescuento();
  let linea = document.querySelector('.total-fila--desc');
  if (monto > 0) {
    if (!linea) {
      const primera = document.querySelector('.total-fila');
      if (primera) {
        linea = document.createElement('div');
        linea.className = 'total-fila total-fila--desc';
        linea.innerHTML = '<span>Descuento</span><span></span>';
        primera.insertAdjacentElement('afterend', linea);
      }
    }
    if (linea) linea.querySelector('span:last-child').textContent = '− ' + L(monto);
  } else if (linea) {
    linea.remove();
  }
  const btn = document.querySelector('.btn--cobrar.solo-escritorio');
  if (btn && !estado.cobrando) btn.textContent = verboDeCobro() + ' ' + L(montoDelBoton());
}

// Lo que la clienta entrega ahora, por método. Con un solo método es todo (o lo
// que diga el pago parcial); con dos, lo que se puso en cada uno.
function pagosDeLaVenta() {
  if (estado.mixto) {
    return [
      { forma: estado.pago, monto: num(estado.monto1), banco: estado.banco },
      { forma: estado.pago2, monto: num(estado.monto2), banco: estado.banco2 },
    ].filter((x) => x.forma && x.monto > 0);
  }
  if (estado.parcial) {
    return [{ forma: estado.pago, monto: montoAbono(), banco: estado.banco }];
  }
  return [];
}

function montoAbono() {
  if (estado.mixto) {
    return Math.min(total(), pagosDeLaVenta().reduce((s, x) => s + x.monto, 0));
  }
  if (!estado.parcial) return total();
  return Math.min(total(), Math.max(0, num(estado.abono)));
}

function loQueQueda() {
  return Math.max(0, total() - montoAbono());
}

function cambio() {
  // Con pago parcial el vuelto se calcula contra lo que abona, no contra el
  // total: si abona 1.570 y entrega 1.600, el cambio es 30.
  const rec = num(estado.recibido);
  return Math.max(0, rec - montoAbono());
}

// Al crédito y contraentrega no entra plata ahora: el pedido queda pendiente.
// Decir "Cobrar" hacía creer que quedaba pagado.
function quedaPendiente() {
  return estado.pago === 'credito' || estado.pago === 'contraentrega';
}

// Lo que falta para poder cobrar. Antes esto se escribia DENTRO del boton
// ("Elegi el banco") y la mama de la duena creia que ese era el boton para
// elegir el banco: ahora el boton siempre dice lo que hace y el faltante va
// como un aviso aparte, encima.
function faltaParaCobrar() {
  if (!estado.venta.length) return '';
  if (!estado.pago) return 'Falta elegir la forma de pago';
  if (estado.pago === 'transferencia' && !estado.banco) return 'Falta elegir el banco';
  return '';
}

function verboDeCobro() {
  if (estado.pago === 'credito') return 'Registrar al crédito';
  if (estado.pago === 'contraentrega') return 'Registrar contraentrega';
  if (estado.parcial) return 'Registrar abono de';
  if (estado.mixto) return loQueQueda() > 0 ? 'Registrar pagos de' : 'Cobrar';
  return 'Cobrar';
}

// Con pago parcial, el botón muestra lo que entra ahora, no el total: es lo que
// la cajera tiene que recibir en la mano.
function montoDelBoton() {
  return (estado.parcial || estado.mixto) ? montoAbono() : total();
}

// Todo lo que se arma para una venta. Se vacía apenas el pedido queda creado:
// si no, la venta cobrada seguía en pantalla (y se volvía a guardar sola), y al
// volver a la caja la cajera veía los productos ahí, como si no se hubiera
// creado nada.
function limpiarArmado() {
  intentoActual = '';
  try { localStorage.removeItem(GUARDADO); } catch (_) {}
  estado.codigoSinHallar = '';
  estado.venta = [];
  estado.cliente = null;
  estado.mayoreo = false;
  estado.descuento = { tipo: '', valor: 0 };
  estado.descAbierto = false;
  estado.pago = '';
  estado.banco = '';
  estado.bancoAbierto = false;
  estado.flete = '';
  estado.preparado = true;
  estado.entregaTocada = false;
  estado.recibido = '';
  estado.parcial = false;
  estado.abono = '';
  estado.mixto = false;
  estado.monto1 = '';
  estado.pago2 = '';
  estado.banco2 = '';
  estado.monto2 = '';
  estado.nota = '';
  estado.error = '';
  estado.resultados = [];
  estado.resClientes = null;
}

function nuevaVenta() {
  ventaEnMano = null;
  limpiarArmado();
  estado.resultado = null;
  pintar();
  enfocarBuscador();
}

// ── Cobro ────────────────────────────────────────────────────────────────────
// Una transferencia sin banco no sirve: es justo el dato que hace falta para
// cuadrar despues con el estado de cuenta.
function sePuedeCobrar() {
  if (!estado.venta.length || !estado.pago || estado.cobrando) return false;
  if (estado.pago === 'transferencia' && !estado.banco) return false;
  // Un abono tiene que ser algo y menos que el total: si cubre todo, no es
  // abono, es el cobro normal.
  if (estado.parcial && !(montoAbono() > 0 && montoAbono() < total())) return false;
  if (estado.mixto) {
    const ps = pagosDeLaVenta();
    if (ps.length < 2) return false;                       // falta el segundo
    if (ps.some((x) => x.forma === 'transferencia' && !x.banco)) return false;
    if (montoAbono() <= 0 || montoAbono() > total() + 0.009) return false;
  }
  return true;
}

// El número vive mientras dure el intento de cobro: se borra al terminar bien y
// al empezar una venta nueva, y se conserva si hubo error, que es justo cuando
// la cajera vuelve a darle a Cobrar.
let intentoActual = '';

function numeroDeIntento() {
  if (!intentoActual) {
    intentoActual = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  }
  return intentoActual;
}

// El prerecibo: el mismo recibo, pero sin venta. No crea pedido ni toca el
// inventario, asi que la cajera puede pasarle un presupuesto a una clienta y
// cobrarle despues (o no) sin gastar un numero de pedido.
async function cotizar() {
  if (estado.cotizando || !estado.venta.length) return;
  estado.cotizando = true;
  estado.error = '';
  pintar();
  const cuerpo = {
    items: estado.venta.filter((l) => !l.manual).map((l) => ({
      variant_id: l.variant_id, cantidad: l.cantidad, precio: l.precio,
      // La talla va aparte: el recibo la muestra debajo del nombre.
      nombre: l.nombre, variante: l.variante || '', imagen: l.imagen || '',
    })),
    personalizados: estado.venta.filter((l) => l.manual).map((l) => ({
      titulo: l.nombre, precio: l.precio, cantidad: l.cantidad,
    })),
    cliente_nombre: estado.cliente ? estado.cliente.nombre : '',
    mayoreo: hayMayoreo(),
    flete: elFlete().monto > 0
      ? { titulo: elFlete().titulo, monto: elFlete().monto } : null,
    comision: comision() > 0 ? { monto: comision() } : null,
    total: total(),
    ensayo: MODO_PRUEBA,
    // Con qué se armó, para poder retomarla tal cual desde la lista de
    // cotizaciones. El recibo solo no alcanza: no lleva el variant_id, sin el
    // cual el pedido no descontaría inventario.
    armado: loArmado(),
  };
  if (estado.descuento.tipo && num(estado.descuento.valor) > 0) {
    cuerpo.descuento = { tipo: estado.descuento.tipo, valor: num(estado.descuento.valor) };
  }
  try {
    const r = await api('/admin/caja/cotizacion',
                        { method: 'POST', body: JSON.stringify(cuerpo) });
    // La venta NO se borra: la cotización es un paso previo, y lo más probable
    // es que después le cobre lo mismo.
    ventaEnMano = { recibo: r.recibo, total: r.total, name: r.name,
                    telefono: estado.cliente ? (estado.cliente.telefono || '') : '',
                    nombreCliente: estado.cliente ? estado.cliente.nombre : '',
                    ensayo: MODO_PRUEBA, cotizacion: true };
    accionesDeRecibo({ numero: r.name, cliente: cuerpo.cliente_nombre,
                       total: r.total, telefono: ventaEnMano.telefono });
  } catch (err) {
    estado.error = err.message || 'No se pudo armar la cotización';
  } finally {
    estado.cotizando = false;
    pintar();
  }
}

async function cobrar() {
  if (!sePuedeCobrar()) return;
  estado.cobrando = true;
  estado.error = '';
  pintar();
  const vuelto = estado.pago === 'efectivo' ? cambio() : 0;
  const cuerpo = {
    // El nombre viaja solo para el recibo: el backend arma el pedido con el id.
    items: estado.venta.filter((l) => !l.manual).map((l) => ({
      variant_id: l.variant_id, cantidad: l.cantidad, precio: l.precio,
      // La talla va aparte: el recibo la muestra debajo del nombre.
      nombre: l.nombre, variante: l.variante || '', imagen: l.imagen || '',
    })),
    personalizados: estado.venta.filter((l) => l.manual).map((l) => ({
      titulo: l.nombre, precio: l.precio, cantidad: l.cantidad,
    })),
    cliente_id: estado.cliente ? estado.cliente.id : '',
    cliente_nombre: estado.cliente ? estado.cliente.nombre : '',
    mayoreo: hayMayoreo(),
    pago: estado.pago,
    banco: estado.pago === 'transferencia' ? estado.banco : '',
    flete: elFlete().monto > 0
      ? { titulo: elFlete().titulo, monto: elFlete().monto } : null,
    comision: comision() > 0 ? { monto: comision() } : null,
    recibido: estado.pago === 'efectivo' ? num(estado.recibido) : 0,
    cambio: vuelto,
    // Cómo paga: un método, dos (mixto), o menos que el total (parcial). El
    // backend anota una transacción por cada uno.
    abono: estado.parcial ? montoAbono() : 0,
    pagos: pagosDeLaVenta(),
    // Si la clienta ya se lo lleva, el pedido sale preparado; un encargo queda
    // pendiente para que lo arme después quien lo prepara.
    preparar: !!estado.preparado,
    nota: estado.nota || '',
    ensayo: MODO_PRUEBA,
    // Número de este cobro. Se conserva mientras la venta no se cobre, así que
    // un reintento tras un corte de red llega con el MISMO número y el servidor
    // devuelve el pedido que ya creó en vez de crear otro: sin esto, un pedido
    // que se creó pero cuya respuesta no llegó se cobraba dos veces.
    intento: numeroDeIntento(),
  };
  if (estado.descuento.tipo && num(estado.descuento.valor) > 0) {
    cuerpo.descuento = { tipo: estado.descuento.tipo, valor: num(estado.descuento.valor) };
  }
  try {
    const r = await api('/admin/caja/venta', { method: 'POST', body: JSON.stringify(cuerpo) });
    estado.resultado = { ...r, cambio: vuelto, pago: estado.pago,
                        telefono: estado.cliente ? (estado.cliente.telefono || '') : '',
                        nombreCliente: estado.cliente ? estado.cliente.nombre : '' };
    // El pedido ya existe en Shopify: la caja queda en blanco de una vez, con
    // la pantalla de la venta cobrada encima (recibo, cambio, contacto). Así,
    // pase lo que pase después —mandar el recibo, cerrar, recargar— nunca
    // reaparece la venta vieja armada.
    limpiarArmado();
    // Se dibuja YA, sin esperar a que toque el botón: el navegador solo deja
    // abrir el menú de compartir mientras dura el gesto de quien lo toca, y
    // armar la imagen (con las fotos) tarda más que eso.
    setTimeout(previsualizarRecibo, 0);
  } catch (err) {
    if (err.status === 409 && err.detalle && err.detalle.agotados) {
      const lista = err.detalle.agotados
        .map((a) => `${a.title} (quedan ${a.disponible})`).join(', ');
      estado.error = 'Se agotaron: ' + lista + '. Corrija la venta e intente de nuevo.';
    } else if (err.status === 409 && !(err.detalle && err.detalle.agotados)) {
      estado.error = 'Ese cobro ya se está procesando. Espere unos segundos y '
        + 'fijate en Shopify antes de volver a intentar.';
    } else if (err.message === 'Failed to fetch') {
      estado.error = 'Sin conexión: no se pudo cobrar. La venta sigue armada, intentá de nuevo.';
    } else if (err.message !== 'Sesión expirada') {
      estado.error = err.message || 'No se pudo cobrar';
    }
  } finally {
    estado.cobrando = false;
    pintar();
  }
}

// ── Clientas ─────────────────────────────────────────────────────────────────
let temporizadorCliente = null;
function buscarClientas(texto) {
  clearTimeout(temporizadorCliente);
  const q = (texto || '').trim();
  if (q.length < 2) { estado.resClientes = null; pintarListaClientas(); return; }
  estado.buscandoCliente = true;
  pintarListaClientas();
  temporizadorCliente = setTimeout(async () => {
    try {
      const r = await api('/admin/caja/clientes?q=' + encodeURIComponent(q));
      estado.resClientes = r.clientes || [];
    } catch (_) {
      estado.resClientes = [];
    } finally {
      estado.buscandoCliente = false;
      pintarListaClientas();
    }
  }, 300);
}

function elegirCliente(c) {
  estado.cliente = c;
  estado.resClientes = null;
  estado.verRecientes = false;
  recalcularPrecios();
  pintar();
  enfocarBuscador();
}

async function crearClienta(datos, boton, avisar) {
  // `avisar` pinta el problema DENTRO del modal; sin él, en la pantalla de atrás.
  const problema = (texto) => {
    if (avisar) { avisar(texto); } else { estado.error = texto; pintar(); }
    return false;
  };
  // La cuenta de acceso es aparte de la ficha: se revisa ANTES de crear nada, así
  // no queda la clienta creada y el acceso a medias. Se revisa también en modo
  // prueba: es donde la dueña va a aprender a usarlo.
  const quiereAcceso = !!(datos.usuario || datos.password);
  if (quiereAcceso) {
    if (datos.usuario.length < 3) return problema('El usuario necesita al menos 3 letras');
    if ((datos.password || '').length < 4) return problema('La contraseña necesita al menos 4 letras');
    if (datos.telefono.replace(/\D/g, '').length < 8) {
      return problema('Para darle acceso hace falta su teléfono');
    }
  }

  // En modo prueba la clienta NO se crea de verdad: si no, cada prueba dejaría
  // una ficha suelta en Shopify. Se arma una de mentira, solo para esta pantalla.
  if (MODO_PRUEBA) {
    const falsa = {
      id: '', nombre: [datos.nombre, datos.apellido].filter(Boolean).join(' '),
      telefono: datos.telefono || '', mayoreo: !!datos.mayoreo,
    };
    estado.recientes = [falsa, ...estado.recientes];
    elegirCliente(falsa);
    flash(quiereAcceso ? 'Prueba: ni la clienta ni su acceso se guardaron'
                       : 'Prueba: la clienta no se guardó', 'ok');
    return true;
  }

  boton.disabled = true; boton.textContent = 'Creando…';
  try {
    const c = await api('/admin/caja/clientes', { method: 'POST', body: JSON.stringify(datos) });
    // Queda puesta en la venta de una vez: si la está creando en medio de un
    // cobro es porque es la clienta de ESTA venta, y tener que buscarla de nuevo
    // era un paso de más. También queda primera en las recientes.
    estado.recientes = [c, ...estado.recientes.filter((x) => x.id !== c.id)];
    elegirCliente(c);

    if (quiereAcceso) {
      try {
        await api('/admin/cuentas', { method: 'POST', body: JSON.stringify({
          usuario: datos.usuario, password: datos.password,
          nombre: c.nombre, telefono: datos.telefono,
        }) });
        flash(`${c.nombre} quedó registrada y ya puede entrar como ${datos.usuario}`, 'ok');
      } catch (err) {
        // La ficha YA quedó bien: solo falló el acceso, y eso se arregla desde
        // el panel sin perder nada.
        problema(`La clienta quedó registrada, pero el acceso no: ${
          err.message || 'no se pudo crear'}. Se puede crear desde el panel.`);
        return false;    // el modal se queda abierto: puede probar otro usuario
      }
      return true;
    }

    flash(`${c.nombre} quedó registrada`, 'ok');
    return true;
  } catch (err) {
    return problema(err.message || 'No se pudo crear la clienta');
  } finally {
    boton.disabled = false; boton.textContent = 'Crear';
  }
}

// ── Pintado ──────────────────────────────────────────────────────────────────
// En computadora el foco vuelve solo al buscador después de cada acción, para que
// el lector nunca quede "desconectado". En el teléfono NO: ahí cada acción abría
// el teclado y había que cerrarlo a mano, que fue justo lo que molestó en el
// mostrador. El escaneo no lo necesita: el detector escucha el teclado igual.
const esTactil = window.matchMedia('(hover: none)').matches;

function enfocarBuscador() {
  if (camara || esTactil) return;
  const i = $('q');
  if (i && !estado.resultado) setTimeout(() => i.focus({ preventScroll: true }), 30);
}

// Cada zona con scroll vuelve al principio cuando pintar() rehace el DOM: con
// quince productos en la venta, cambiar una cantidad te dejaba mirando la primera
// línea en vez de la que estabas tocando. Se guarda la posición y se devuelve.
const ZONA_VENTA = '.col-izq > .tarjeta.scroll-lindo';
const ZONAS_SCROLL = ['#resultados', ZONA_VENTA, '.col-der .tarjeta__cuerpo.scroll-lindo'];
let lineasPintadas = 0;

function leerScroll(main) {
  return ZONAS_SCROLL.map((sel) => {
    const el = main.querySelector(sel);
    return el ? el.scrollTop : 0;
  });
}

function devolverScroll(main, tops) {
  // Si la venta creció, la línea nueva quedó al final: ahí tiene que mirar la
  // cajera para confirmar que entró lo que escaneó.
  const crecio = estado.venta.length > lineasPintadas;
  lineasPintadas = estado.venta.length;
  ZONAS_SCROLL.forEach((sel, i) => {
    const alFinal = crecio && sel === ZONA_VENTA;
    if (!tops[i] && !alFinal) return;
    const el = main.querySelector(sel);
    if (el) el.scrollTop = alFinal ? el.scrollHeight : tops[i];
  });
}

function pintar() {
  const main = $('caja-main');
  if (!main) return;
  guardarVenta();

  if (estado.resultado) { main.innerHTML = vistaExito(); main.classList.add('caja--exito'); return; }
  main.classList.remove('caja--exito');

  // Mientras llega el catálogo, la pantalla entera es esqueleto: mostrar la
  // mitad derecha ya armada (con totales en cero) hacía ver la caja a medio
  // hacer, como si algo hubiera fallado.
  if (estado.cargandoCatalogo && !estado.errorCatalogo) {
    main.innerHTML = esqueletoPantalla();
    return;
  }

  const valorQ = $('q') ? $('q').value : '';
  const valorCli = $('q-cliente') ? $('q-cliente').value : '';
  const activo = document.activeElement ? document.activeElement.id : '';
  const tops = leerScroll(main);

  main.innerHTML = `
    <section class="col-izq">
      <div class="buscador-zona">
        ${bloqueBuscador(valorQ)}
        <div id="resultados">${bloqueResultados()}</div>
      ${estado.codigoSinHallar && !camara ? `<div class="sin-hallar">
        <span>El código <b>${esc(estado.codigoSinHallar)}</b> no está en el catálogo.</span>
        <button class="btn btn--sm" data-accion="rebuscar" type="button">Buscar de nuevo en Shopify</button>
      </div>` : ''}
      </div>
      ${bloqueLineas()}
    </section>
    <aside class="col-der">
      ${bloqueCliente(valorCli)}
      ${bloqueResumen()}
    </aside>
    ${barraMovil()}
  `;

  // El foco se devuelve donde estaba: repintar no puede sacar a la cajera del
  // campo en el que estaba escribiendo.
  if (activo === 'q-cliente' && $('q-cliente')) {
    const i = $('q-cliente'); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
  } else if (!camara && (activo === 'q' || (!esTactil && (!activo || activo === 'body')))) {
    // Con la cámara abierta no se devuelve el foco (abriría el teclado encima), y
    // en el teléfono solo se devuelve si la cajera estaba escribiendo de verdad.
    const i = $('q');
    if (i && !estado.cargandoCatalogo) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  // Después de devolver el foco: enfocar un campo puede arrastrar su contenedor.
  devolverScroll(main, tops);
}

// Esqueleto de la pantalla completa: mismas cajas y mismas alturas que la caja
// ya cargada, para que al llegar los datos nada salte de lugar.
function esqueletoPantalla() {
  const filas = (n) => Array.from({ length: n }, () => `
    <div class="sk-fila">
      <div class="sk sk-img"></div>
      <div class="sk-txt"><div class="sk sk-l1"></div><div class="sk sk-l2"></div></div>
      <div class="sk sk-pre"></div>
    </div>`).join('');
  return `
    <section class="col-izq">
      <div class="buscador-zona">
        <div class="buscador">
          <div class="sk sk-buscador"></div>
          <div class="sk sk-boton"></div>
        </div>
      </div>
      <div class="tarjeta">${filas(6)}</div>
    </section>
    <aside class="col-der">
      <div class="tarjeta">
        <div class="tarjeta__cab"><div class="sk sk-cab"></div></div>
        <div class="tarjeta__cuerpo">
          <div class="sk sk-campo"></div>
          <div class="sk sk-l2" style="margin-top:0.9rem; height:22px; width:70%"></div>
        </div>
      </div>
      <div class="tarjeta">
        <div class="tarjeta__cab"><div class="sk sk-cab"></div></div>
        <div class="tarjeta__cuerpo">
          <div class="sk-linea"><div class="sk sk-l2" style="width:30%"></div>
                                <div class="sk sk-l2" style="width:22%"></div></div>
          <div class="sk-linea" style="margin-top:1rem">
            <div class="sk sk-l2" style="width:24%"></div>
            <div class="sk" style="height:30px; width:42%"></div>
          </div>
          <div class="sk-pagos">
            <div class="sk sk-pago"></div><div class="sk sk-pago"></div>
            <div class="sk sk-pago"></div><div class="sk sk-pago"></div>
          </div>
          <div class="sk sk-cobrar"></div>
        </div>
      </div>
    </aside>
    <div class="barra">
      <div class="barra__tot"><div class="sk sk-l2" style="width:60px"></div>
                              <div class="sk" style="height:26px; width:120px"></div></div>
      <div class="sk sk-cobrar" style="margin:0"></div>
    </div>`;
}

function bloqueBuscador(valor) {
  if (estado.errorCatalogo) {
    return `<div class="tarjeta"><div class="tarjeta__cuerpo">
      <div class="aviso-caja aviso-caja--roja">${esc(estado.errorCatalogo)}</div>
      <button class="btn btn--pink btn--ancho" data-accion="recargar" style="margin-top:0.8rem">
        Reintentar</button></div></div>`;
  }
  return `
    <div class="buscador">
      <div class="campo-ic">
        ${svg(IC.lupa, 1.9)}
        <input id="q" value="${esc(valor)}" placeholder="Escanee o busque el producto…"
               autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" />
        <!-- El punto verde avisa que el lector puede disparar acá. Comparte
             esquina con la X, en una fila, para que nunca se pisen. -->
        <span class="buscador__der">
          <span class="escaner-chip" title="Listo para escanear"><i></i></span>
          <button class="limpiar" data-accion="limpiar-q" type="button" aria-label="Limpiar"
                  ${valor ? '' : 'hidden'}>&times;</button>
        </span>
      </div>
      ${estado.hayCamara ? `<button class="btn" data-accion="camara" type="button"
              title="Escanear con la cámara" aria-label="Escanear con la cámara">
              ${svg(IC.codigo, 1.8)}</button>` : ''}
    </div>`;
}

function bloqueResultados() {
  if (!estado.resultados.length) return '';
  // Cuántos son, siempre: con treinta y ocho resultados el aroma que se busca
  // puede estar más abajo, y sin el número uno mira los primeros y se rinde.
  const total = estado.resultadosTotal || estado.resultados.length;
  const sobran = total - estado.resultados.length;
  const pie = `<div class="resultados__pie">${
    sobran > 0 ? `${total} productos · se ven los primeros ${estado.resultados.length}, `
                 + 'escriba un poco más para afinar'
    : estado.buscadoEnShopify ? `${total} en Shopify (no estaban en el catálogo de la caja)`
    : `${total} producto${total !== 1 ? 's' : ''}`}</div>`;
  // Lo que ya va en la venta, para que la lista pueda quedarse abierta sin que
  // la cajera pierda la cuenta de lo que lleva tocado.
  const llevado = new Map(estado.venta.map((l) => [l.variant_id, l.cantidad]));
  return `<div class="resultados scroll-lindo">${estado.resultados.map((v, i) => `
    <button class="res ${v.disponible ? '' : 'res--agotado'}" data-res="${i}" type="button">
      ${v.imagen ? `<img src="${esc(v.imagen)}" alt="" loading="lazy" />` : '<img alt="" />'}
      <span class="res__txt">
        <span class="res__nom">${esc(v.producto)}${v.variante ? ' · ' + esc(v.variante) : ''}</span>
        <span class="res__meta">${esc(v.marca || 'Sin marca')}
          ${v.existencia != null ? ' · ' + v.existencia + ' en existencia' : ''}
          ${v.disponible ? '' : '<span class="res__tag">agotado</span>'}</span>
      </span>
      ${hayMayoreo() && v.precio_mayoreo == null
        ? '<span class="res__lleva res__lleva--ojo">sin precio de mayoreo</span>' : ''}
      ${llevado.get(v.variant_id)
        ? `<span class="res__lleva">${llevado.get(v.variant_id)} en la venta</span>` : ''}
      <span class="res__pre">${L(precioSegunModo(v))}</span>
    </button>`).join('')}${pie}</div>`;
}

function bloqueLineas() {
  if (!estado.venta.length) {
    // El código de barras grande es el botón de escanear: es donde la cajera
    // toca por instinto, no en el icono chico del buscador.
    return `<div class="tarjeta vacio-caja">
      ${estado.hayCamara ? `
        <button class="vacio-caja__ic vacio-caja__ic--boton" data-accion="camara" type="button">
          ${svg(IC.codigo, 1.6)}</button>
        <h3>Escanee el primer producto</h3>
        <p>Toque el código de barras para abrir la cámara,<br />
           pase el lector, o escriba el nombre en el buscador.</p>
        <button class="btn btn--pink vacio-caja__accion" data-accion="camara"
          type="button">${svg(IC.codigo, 1.8)} Escanear con la cámara</button>
        <button class="li-manual vacio-caja__manual" data-accion="manual" type="button">
          ${svg(IC.mas, 2)} Agregar personalizado</button>
      ` : `
        <div class="vacio-caja__ic">${svg(IC.codigo, 1.6)}</div>
        <h3>Todavía no hay productos</h3>
        <p>Pase el lector por el código de barras<br />o escriba el nombre en el buscador.</p>
      `}
    </div>`;
  }
  return `<div class="tarjeta scroll-lindo">
    <div class="tarjeta__cab">
      <span>${estado.venta.length} producto${estado.venta.length !== 1 ? 's' : ''}</span>
      ${hayMayoreo() ? '<span class="chip chip--may">Precios de mayoreo</span>' : ''}
    </div>
    ${estado.venta.map((l, i) => `
      <!-- La foto ocupa el alto de las dos filas (nombre arriba, cantidad y
           precio abajo): así el renglón queda compacto y no sobra aire debajo
           de la imagen. -->
      <div class="li ${l.especial ? 'li--especial' : ''}${
        sinPrecioMayoreo(l) ? ' li--sinmayoreo' : ''}">
        ${l.imagen
          ? `<img class="li__img" src="${esc(l.imagen)}" alt="" loading="lazy" />`
          : '<div class="li__img li__img--vacia">✦</div>'}
        <div class="li__cont">
          <div class="li__top">
            <div class="li__nom">${esc(l.nombre)}${l.variante ? ` <span class="li__meta">· ${esc(l.variante)}</span>` : ''}
              ${(() => {
                const hay = existenciaDe(l.variant_id);
                if (hay == null) return '';
                const falta = l.cantidad > hay;
                return ` <span class="chip ${falta ? 'chip--ojo' : 'chip--inv'}">${
                  falta ? `lleva ${l.cantidad} y hay ${hay}` : `${hay} en existencia`}</span>`;
              })()}
              ${l.manual ? ' <span class="chip">manual</span>' : ''}
              ${l.especial ? ' <span class="chip">precio especial</span>' : ''}
              ${sinPrecioMayoreo(l) ? ' <span class="chip chip--ojo">precio de detalle</span>' : ''}
            </div>
            <button class="li__x" data-quitar="${i}" type="button" aria-label="Quitar">&times;</button>
          </div>
          <div class="li__bot">
            <div class="cant">
              <button data-menos="${i}" type="button" aria-label="Menos">−</button>
              <span>${l.cantidad}</span>
              <button data-mas="${i}" type="button" aria-label="Más">+</button>
            </div>
            <div class="li__precio">
              <!-- type="text": con type="number" el teléfono en español pinta el
                   separador decimal como coma (390,00). Acá el precio siempre se
                   escribe con punto. -->
              <input type="text" inputmode="decimal" data-precio="${i}"
                     value="${Number(l.precio).toFixed(2)}" aria-label="Precio unitario" />
            </div>
            <div class="li__sub">${L(l.precio * l.cantidad)}</div>
          </div>
        </div>
      </div>`).join('')}
    <div class="li-pie">
      <button class="li-manual" data-accion="buscar" type="button">
        ${svg(IC.lupa, 2)} Buscar en el catálogo
      </button>
      <button class="li-manual li-manual--sec" data-accion="manual" type="button">
        ${svg(IC.mas, 2)} Agregar personalizado
      </button>
    </div>
  </div>`;
}

// Solo la lista, sin tocar el resto: repintar la pantalla entera en cada tecla
// hacía temblar toda la caja mientras se escribía el nombre.
function pintarListaClientas() {
  const cont = document.getElementById('lista-clientas');
  if (!cont) { pintar(); return; }
  const f = (c, i, origen) => `
      <button class="res res--cli" data-cli="${i}" data-origen="${origen}" type="button">
        <span class="res__txt">
          <span class="res__nom">${esc(c.nombre)}</span>
          <span class="res__meta">${esc(c.telefono || 'sin teléfono')}</span>
        </span>
        ${c.mayoreo ? '<span class="chip chip--may">Mayorista</span>' : ''}
      </button>`;
  if (estado.buscandoCliente) {
    cont.innerHTML = '<div class="resultados resultados--cli"><div class="vacio"><span class="puntos">Buscando</span></div></div>';
  } else if (estado.resClientes && estado.resClientes.length) {
    cont.innerHTML = `<div class="resultados resultados--cli scroll-lindo">
      ${estado.resClientes.map((c, i) => f(c, i, 'busqueda')).join('')}</div>`;
  } else if (estado.resClientes) {
    cont.innerHTML = `<div class="resultados resultados--cli">
      <div class="vacio" style="padding:0.9rem">No encontramos esta clienta.</div>
      <button class="btn btn--ancho" data-accion="crear-cliente" type="button"
              style="margin:0 0.5rem 0.5rem; width:calc(100% - 1rem)">Crear clienta</button>
    </div>`;
  } else if (estado.verRecientes && estado.recientes.length) {
    cont.innerHTML = `<div class="resultados resultados--cli scroll-lindo">
      <div class="resultados__cab">Últimas clientas</div>
      ${estado.recientes.map((c, i) => f(c, i, 'recientes')).join('')}</div>`;
  } else {
    cont.innerHTML = '';
  }
}

function bloqueCliente(valorCli) {
  if (estado.cliente) {
    return `<div class="tarjeta">
      <div class="tarjeta__cab">Clienta</div>
      <div class="tarjeta__cuerpo">
        <div class="cliente-sel">
          <span class="cliente-sel__n">${esc(estado.cliente.nombre)}
            ${estado.cliente.mayoreo ? '<span class="chip chip--may">Mayorista</span>' : ''}</span>
          <button class="li__x" data-accion="quitar-cliente" type="button" aria-label="Quitar">&times;</button>
        </div>
        ${estado.cliente.telefono ? `<div class="res__meta">${esc(estado.cliente.telefono)}</div>` : ''}
        ${interruptorMayoreo()}
      </div>
    </div>`;
  }
  const fila = (c, i, origen) => `
      <button class="res res--cli" data-cli="${i}" data-origen="${origen}" type="button">
        <span class="res__txt">
          <span class="res__nom">${esc(c.nombre)}</span>
          <span class="res__meta">${esc(c.telefono || 'sin teléfono')}</span>
        </span>
        ${c.mayoreo ? '<span class="chip chip--may">Mayorista</span>' : ''}
      </button>`;

  // TODO lo que se despliega (buscando, resultados, "no encontramos") va dentro
  // del mismo contenedor flotante. Antes el aviso de "Buscando" no lo llevaba y
  // se metía en la fila del campo, que es horizontal: salía al lado del input.
  let lista = '';
  if (estado.buscandoCliente) {
    lista = '<div class="resultados resultados--cli"><div class="vacio"><span class="puntos">Buscando</span></div></div>';
  } else if (estado.resClientes && estado.resClientes.length) {
    lista = `<div class="resultados resultados--cli scroll-lindo">
      ${estado.resClientes.map((c, i) => fila(c, i, 'busqueda')).join('')}</div>`;
  } else if (estado.resClientes) {
    lista = `<div class="resultados resultados--cli">
      <div class="vacio" style="padding:0.9rem">No encontramos esta clienta.</div>
      <button class="btn btn--ancho" data-accion="crear-cliente" type="button"
              style="margin:0 0.5rem 0.5rem; width:calc(100% - 1rem)">Crear clienta</button>
    </div>`;
  } else if (estado.verRecientes && estado.recientes.length) {
    // Antes de escribir nada: las últimas que compraron. En el mostrador casi
    // siempre es una de ellas.
    lista = `<div class="resultados resultados--cli scroll-lindo">
      <div class="resultados__cab">Últimas clientas</div>
      ${estado.recientes.map((c, i) => fila(c, i, 'recientes')).join('')}</div>`;
  }
  return `<div class="tarjeta tarjeta--cliente">
    <div class="tarjeta__cab">Clienta <span style="text-transform:none; letter-spacing:0; font-weight:500">(opcional)</span></div>
    <div class="tarjeta__cuerpo">
      <div class="cliente-fila">
        <div class="campo-ic">
          ${svg(IC.persona, 1.9)}
          <input id="q-cliente" value="${esc(valorCli)}" placeholder="Nombre o teléfono"
                 autocomplete="off" />
        </div>
        <button class="btn" data-accion="crear-cliente" type="button"
                title="Registrar una clienta nueva" aria-label="Registrar clienta nueva">
          ${svg(IC.mas)}
        </button>
        <!-- La lista va DENTRO de la fila: es su ancla. Estando fuera se colgaba
             del alto de toda la tarjeta y aparecía muy abajo, dejando asomar el
             interruptor de mayoreo entre el campo y los resultados. -->
        <div id="lista-clientas">${lista}</div>
      </div>
      ${interruptorMayoreo()}
    </div>
  </div>`;
}

function interruptorMayoreo() {
  const forzado = !!(estado.cliente && estado.cliente.mayoreo);
  return `<label class="switch">
    <input type="checkbox" data-accion="switch-mayoreo" ${hayMayoreo() ? 'checked' : ''}
           ${forzado ? 'disabled' : ''} />
    Esta venta es de mayoreo
  </label>`;
}

// El segundo método de un pago mixto: solo los que hacen entrar plata ahora
// (al crédito y contraentrega no se paga en el momento).
const PAGOS_SEGUNDO = [
  ['efectivo', 'Efectivo', IC.efectivo],
  ['tarjeta', 'Tarjeta', IC.tarjeta],
  ['transferencia', 'Transferencia', IC.transferencia],
];

const OPCIONES_DESC = [
  { v: '', t: 'Sin descuento' },
  { v: 'porcentaje', t: 'Descuento por %' },
  { v: 'monto', t: 'Descuento en L.' },
];

function bloqueResumen() {
  const desc = montoDescuento();
  const pagos = [['efectivo', 'Efectivo', IC.efectivo], ['tarjeta', 'Tarjeta', IC.tarjeta],
                 ['transferencia', 'Transferencia', IC.transferencia], ['credito', 'Crédito', IC.credito],
                 ['contraentrega', 'Contraentrega', IC.entrega]];
  const opcActual = OPCIONES_DESC.find((o) => o.v === estado.descuento.tipo) || OPCIONES_DESC[0];
  return `<div class="tarjeta tarjeta--cobro${estado.descAbierto || estado.bancoAbierto ? ' tarjeta--abierta' : ''}">
    <div class="tarjeta__cab">Cobro</div>
    <!-- Fuera de lo que se desplaza: el total es lo que la cajera necesita
         siempre a la vista, y con el scroll interno se perdia de pantalla. -->
    <div class="cobro-totales">
      <div class="total-fila"><span>Subtotal</span><span>${L(subtotal())}</span></div>
      ${desc > 0 ? `<div class="total-fila total-fila--desc"><span>Descuento</span>
        <span>− ${L(desc)}</span></div>` : ''}
      ${elFlete().monto > 0 ? `<div class="total-fila total-fila--flete">
        <span>${esc(elFlete().titulo)}</span><span>${L(elFlete().monto)}</span></div>` : ''}
      ${comision() > 0 ? `<div class="total-fila total-fila--comision">
        <span>Comisión (5%)</span><span>${L(comision())}</span></div>` : ''}
      <div class="total-grande"><span>Total</span><b>${L(total())}</b></div>
    </div>
    <div class="tarjeta__cuerpo scroll-lindo">
      <div style="display:flex; gap:0.6rem; align-items:flex-start;">
        <div class="pp-select" style="flex:1.3">
          <button class="pp-select__btn" type="button" data-select="desc"
                  aria-haspopup="listbox" aria-expanded="${estado.descAbierto}">
            <span class="pp-select__lb">${opcActual.t}</span>
            <svg class="pp-select__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="pp-select__menu" role="listbox" ${estado.descAbierto ? '' : 'hidden'}>
            ${OPCIONES_DESC.map((o) => `<button class="pp-select__opt ${o.v === estado.descuento.tipo ? 'is-active' : ''}"
              type="button" role="option" data-desc-tipo="${o.v}">${o.t}</button>`).join('')}
          </div>
        </div>
        <input type="text" inputmode="decimal" style="flex:1; min-height:50px"
               value="${estado.descuento.valor || ''}" data-desc-valor placeholder="0"
               aria-label="Valor del descuento" ${estado.descuento.tipo ? '' : 'disabled'} />
      </div>

      <div class="campo" style="margin-top:0.9rem; margin-bottom:0">
        <label>Flete</label>
        <div class="fletes">
          ${FLETES.map((f) => `<button class="flete-btn" data-flete="${f.v}" type="button"
            aria-pressed="${estado.flete === f.v}">${f.t}${
              f.monto ? `<b>${L(f.monto)}</b>` : ''}</button>`).join('')}
        </div>
      </div>

      <!-- Lo que se vende en el mostrador sale preparado; un encargo que se arma
           después, no. Si no, hay que ir a Shopify a despreparar el pedido. -->
      <label class="entrega">
        <input type="checkbox" data-entrega ${estado.preparado ? 'checked' : ''} />
        <span>
          <b>${estado.preparado ? 'Ya se lo lleva' : 'Queda para preparar'}</b>
          <small>${estado.preparado
            ? 'El pedido sale marcado como preparado en Shopify.'
            : 'Queda pendiente en Shopify, para armarlo después.'}</small>
        </span>
      </label>

      <div class="pagos">
        ${pagos.map(([v, t, ic]) => `<button class="pago-btn${
            v === 'contraentrega' ? ' pago-btn--ancho' : ''}" data-pago="${v}" type="button"
          aria-pressed="${estado.pago === v}">${svg(ic, 1.8)}<span>${t}</span></button>`).join('')}
      </div>

      <!-- Pago parcial: la clienta encarga, transfiere una parte y paga el resto
           al recoger. Sin esto, la venta se registraba como cobrada completa y
           Shopify quedaba creyendo que entró más plata de la que entró. -->
      ${estado.pago && !quedaPendiente() ? `
        ${!estado.mixto ? `
          <label class="switch" style="margin-top:0.8rem">
            <input type="checkbox" data-parcial ${estado.parcial ? 'checked' : ''} />
            Pago parcial (queda debiendo)
          </label>
          ${estado.parcial ? `
            <div class="campo" style="margin-top:0.6rem; margin-bottom:0">
              <label for="abono">¿Cuánto entrega ahora?</label>
              <input id="abono" type="text" inputmode="decimal"
                     value="${estado.abono}" data-abono placeholder="0.00" />
            </div>
          ` : ''}
        ` : ''}
        ${!estado.parcial ? `
          <label class="switch" style="margin-top:0.6rem">
            <input type="checkbox" data-mixto ${estado.mixto ? 'checked' : ''} />
            Pagó con dos métodos
          </label>
          ${estado.mixto ? `
            <div class="campo" style="margin-top:0.6rem; margin-bottom:0">
              <label for="monto1">Con ${esc(PAGOS_TEXTO[estado.pago] || estado.pago)}</label>
              <input id="monto1" type="text" inputmode="decimal"
                     value="${estado.monto1}" data-monto1 placeholder="0.00" />
            </div>
            <div class="campo" style="margin-top:0.6rem; margin-bottom:0">
              <label>El otro método</label>
              <div class="pagos pagos--segundo">
                ${PAGOS_SEGUNDO.filter(([v]) => v !== estado.pago).map(([v, t, ic]) => `
                  <button class="pago-btn" data-pago2="${v}" type="button"
                    aria-pressed="${estado.pago2 === v}">${svg(ic, 1.6)}<span>${t}</span></button>`).join('')}
              </div>
            </div>
            ${estado.pago2 === 'transferencia' ? `
              <div class="campo" style="margin-top:0.6rem; margin-bottom:0">
                <label for="banco2">¿A qué banco?</label>
                <select id="banco2" data-banco2 class="pp-select__btn" style="width:100%">
                  <option value="">Elija el banco</option>
                  ${BANCOS.map((b) => `<option value="${esc(b)}" ${
                    estado.banco2 === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
                </select>
              </div>` : ''}
            ${estado.pago2 ? `
              <div class="campo" style="margin-top:0.6rem; margin-bottom:0">
                <label for="monto2">Con ${esc(PAGOS_TEXTO[estado.pago2] || estado.pago2)}</label>
                <input id="monto2" type="text" inputmode="decimal"
                       value="${estado.monto2}" data-monto2 placeholder="0.00" />
              </div>` : ''}
          ` : ''}
        ` : ''}
        ${(estado.parcial || estado.mixto) && loQueQueda() > 0
          ? `<div class="cambio cambio--debe"><span>Queda debiendo</span><b>${L(loQueQueda())}</b></div>`
          : ''}
        ${estado.mixto && pagosDeLaVenta().length > 1 && loQueQueda() === 0
          ? `<div class="cambio cambio--resumen"><span>Pagado completo</span><b>${L(montoAbono())}</b></div>` : ''}
      ` : ''}

      ${estado.pago === 'efectivo' ? `
        <div class="campo" style="margin-top:0.9rem; margin-bottom:0">
          <label for="recibido">Recibí</label>
          <input id="recibido" type="text" inputmode="decimal"
                 value="${estado.recibido}" data-recibido placeholder="0.00" />
        </div>
        ${num(estado.recibido) > 0 ? `<div class="cambio"><span>Cambio</span><b>${L(cambio())}</b></div>` : ''}
      ` : ''}
      ${estado.pago === 'transferencia' ? `
        <div class="campo" style="margin-top:0.9rem; margin-bottom:0">
          <label>¿A qué banco?</label>
          <div class="pp-select">
            <button class="pp-select__btn" type="button" data-select="banco"
                    aria-haspopup="listbox" aria-expanded="${estado.bancoAbierto}">
              <span class="pp-select__lb">${estado.banco || 'Elija el banco'}</span>
              <svg class="pp-select__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div class="pp-select__menu pp-select__menu--arriba" role="listbox"
                 ${estado.bancoAbierto ? '' : 'hidden'}>
              ${BANCOS.map((b) => `<button class="pp-select__opt ${b === estado.banco ? 'is-active' : ''}"
                type="button" role="option" data-banco="${esc(b)}">${esc(b)}</button>`).join('')}
            </div>
          </div>
        </div>
      ` : ''}
      ${cuantasSinMayoreo() ? `<div class="aviso-caja aviso-caja--ojo">
        ${cuantasSinMayoreo() === 1
          ? 'Hay 1 producto sin precio de mayoreo: va al precio de la tienda. Está marcado en la lista.'
          : `Hay ${cuantasSinMayoreo()} productos sin precio de mayoreo: van al precio de la tienda. `
            + 'Están marcados en la lista.'}</div>` : ''}
      ${estado.pago === 'credito' ? '<div class="aviso-caja aviso-caja--amarilla">Queda pendiente de pago.</div>' : ''}
      ${estado.pago === 'contraentrega' ? `<div class="aviso-caja aviso-caja--amarilla">
        Se cobra al entregar.${estado.flete === 'nacional'
          ? ' Con flete nacional se agrega la comisión del 5%.'
          : ' La comisión del 5% solo aplica con flete nacional.'}</div>` : ''}
      ${estado.error ? `<div class="aviso-caja aviso-caja--roja">${esc(estado.error)}</div>` : ''}

    </div>
    <!-- Fuera del cuerpo: ahi adentro, pegado abajo, tapaba el selector de banco
         y el campo "Recibí" justo cuando la cajera acababa de activarlos. -->
    <div class="cierre-cobro">
      ${faltaParaCobrar() ? `<div class="barra__falta solo-escritorio">${faltaParaCobrar()}</div>` : ''}
      <button class="btn btn--pink btn--ancho btn--cobrar solo-escritorio" data-accion="cobrar"
        ${!sePuedeCobrar() ? 'disabled' : ''}>
        ${estado.cobrando ? (quedaPendiente() || estado.parcial || estado.mixto ? 'Registrando…' : 'Cobrando…')
                          : verboDeCobro() + ' ' + L(montoDelBoton())}
      </button>
      <button class="btn btn--ancho btn--cotiza" data-accion="cotizar" type="button"
        ${(!estado.venta.length || estado.cobrando) ? 'disabled' : ''}>
        ${estado.cotizando ? 'Armando…' : 'Mandar cotización (no cobra)'}
      </button>
    </div>
  </div>`;
}

function barraMovil() {
  const falta = faltaParaCobrar();
  return `<div class="barra">
    ${falta ? `<div class="barra__falta">${falta}</div>` : ''}
    <div class="barra__tot"><span>Total</span><b>${L(total())}</b></div>
    <button class="btn btn--pink btn--ancho btn--cobrar" data-accion="cobrar"
      ${!sePuedeCobrar() ? 'disabled' : ''}>
      ${estado.cobrando ? (quedaPendiente() || estado.parcial || estado.mixto ? 'Registrando…' : 'Cobrando…')
        : verboDeCobro() + ((estado.parcial || estado.mixto) ? ' ' + L(montoDelBoton()) : '')}
    </button>
  </div>`;
}

function vistaExito() {
  const r = estado.resultado;
  return `<div class="tarjeta exito">
    <div class="exito__check">${svg(IC.check, 2.6)}</div>
    <h2>${r.ensayo ? 'Prueba lista'
      : r.pendiente > 0 ? 'Abono recibido'
      : (r.pagado ? 'Venta cobrada' : 'Venta registrada')}</h2>
    <p class="pedido">${r.ensayo ? 'No se cobró nada · no quedó registrada' : 'Pedido ' + esc(r.name || '')}</p>
    <p class="monto">${L(r.total)}</p>
    ${r.cambio > 0 ? `<div class="cambio"><span>Cambio</span><b>${L(r.cambio)}</b></div>` : ''}
    ${r.pendiente > 0 ? `<div class="aviso-caja aviso-caja--ojo">
      Abonó ${L(r.abonado)} · queda debiendo <b>${L(r.pendiente)}</b>.</div>`
    : !r.pagado ? `<div class="aviso-caja aviso-caja--amarilla">${
      r.pago === 'contraentrega' ? 'Queda pendiente: se cobra al entregar.'
                                 : 'Queda pendiente de pago (crédito).'}</div>` : ''}
    ${!r.ensayo && !r.preparado ? `<div class="aviso-caja aviso-caja--amarilla">
      Queda pendiente de preparar en Shopify.</div>` : ''}
    ${r.aviso ? `<div class="aviso-caja aviso-caja--amarilla">${esc(r.aviso)}</div>` : ''}
    ${r.recibo ? `
      <div class="recibo-previa" id="recibo-previa">
        <div class="vacio"><span class="puntos">Armando el recibo</span></div>
      </div>
      <div class="recibo-acciones">
        <button class="btn btn--wa btn--ancho" data-accion="recibo-img" type="button">
          ${svg(IC.whatsapp, 0)} ${sePuedeCompartirArchivo()
            ? 'Mandar el recibo por WhatsApp' : 'Bajar la imagen del recibo'}</button>
        ${r.telefono ? `<button class="btn btn--ancho btn--wa-suave" data-accion="guardar-contacto" type="button">
          Guardar el contacto de la clienta</button>
          <p class="recibo-nota">Si todavía no la tiene en la agenda, guárdela primero:
          WhatsApp solo deja mandar fotos a los contactos guardados.</p>` : ''}
        <div class="recibo-acciones__fila">
          <button class="btn" data-accion="recibo-ver" type="button">Ver el recibo</button>
          <button class="btn" data-accion="recibo-copiar" type="button">Copiar el enlace</button>
        </div>
      </div>` : ''}
    <button class="btn btn--pink btn--ancho btn--cobrar" data-accion="nueva" style="margin-top:1.1rem">
      Nueva venta</button>
  </div>`;
}

// El enlace publico del recibo. Sale del mismo sitio en el que corre la caja,
// asi que en la computadora de prueba apunta a la prueba y en la tienda al sitio.
// De quien son las acciones del recibo: la venta recien cobrada, o una vieja
// que se abrio desde la lista de ventas.
let ventaEnMano = null;

function laVenta() { return ventaEnMano || estado.resultado; }

function urlRecibo() {
  const r = laVenta();
  return r && r.recibo ? `${location.origin}/recibo/?t=${encodeURIComponent(r.recibo)}` : '';
}

// ── Las ventas ya hechas ─────────────────────────────────────────────────────
// Para mandarle el recibo a una clienta despues, cuando la venta ya paso. No se
// puede rehacer la venta para eso: el producto ya se descontó del inventario.
async function verVentas() {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal scroll-lindo" role="dialog" aria-modal="true" aria-label="Ventas">
      <div class="modal__agarre"></div>
      <div class="modal__cab">
        <div style="flex:1"><h2>Ventas</h2>
          <p>Para volver a mandar un recibo o retomar una cotización</p></div>
        <button class="modal__x" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="pestanas" role="tablist">
        <button class="pestana pestana--activa" data-pest="ventas" type="button">Ventas</button>
        <button class="pestana" data-pest="cotizaciones" type="button">Cotizaciones</button>
      </div>
      <div class="modal__lista" id="lista-ventas">
        <div class="vacio"><span class="puntos">Buscando las ventas</span></div>
      </div>
    </div>`;
  document.body.appendChild(fondo);
  const cerrar = () => fondo.remove();
  fondo.querySelector('.modal__x').addEventListener('click', cerrar);
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  const caja = fondo.querySelector('#lista-ventas');

  // Cada pestaña se trae una sola vez y se recuerda: cambiar de una a otra es
  // instantáneo, que es como se usa esto en el mostrador.
  const traido = { ventas: null, cotizaciones: null };

  fondo.querySelectorAll('[data-pest]').forEach((b) => {
    b.addEventListener('click', () => {
      fondo.querySelectorAll('[data-pest]').forEach((x) =>
        x.classList.toggle('pestana--activa', x === b));
      mostrar(b.dataset.pest);
    });
  });

  async function mostrar(cual) {
    if (traido[cual]) { pintarLista(cual); return; }
    caja.innerHTML = `<div class="vacio"><span class="puntos">Buscando ${
      cual === 'ventas' ? 'las ventas' : 'las cotizaciones'}</span></div>`;
    const ruta = cual === 'ventas' ? '/admin/caja/ventas' : '/admin/caja/cotizaciones';
    try {
      const r = await api(ruta + (MODO_PRUEBA ? '?prueba=1' : ''));
      traido[cual] = r[cual] || [];
    } catch (err) {
      caja.innerHTML = `<div class="vacio">No se pudieron traer ${
        cual === 'ventas' ? 'las ventas' : 'las cotizaciones'}.<br>${esc(err.message || '')}</div>`;
      return;
    }
    pintarLista(cual);
  }

  function pintarLista(cual) {
    const lista = traido[cual];
    if (!lista.length) {
      caja.innerHTML = `<div class="vacio">Todavía no hay ${
        cual === 'ventas' ? 'ventas' : 'cotizaciones'}.</div>`;
      return;
    }
    caja.innerHTML = lista.map((v, i) => `
      <button class="venta" data-fila="${i}" type="button">
        <span class="venta__txt">
          <span class="venta__nom">${esc(v.cliente || 'Sin clienta')}${
            v.ensayo ? ' <span class="venta__ensayo">prueba</span>' : ''}</span>
          <span class="venta__meta">${esc(v.numero)} · ${esc(fechaCorta(v.fecha))}${
            v.origen ? ' · ' + esc(v.origen) : ''}${
            cual === 'cotizaciones' && !v.retomable ? ' · solo se puede ver' : ''}</span>
        </span>
        <span class="venta__imp">${L(v.total)}</span>
      </button>`).join('');
  }

  caja.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fila]');
    if (!b) return;
    const esCot = fondo.querySelector('.pestana--activa').dataset.pest === 'cotizaciones';
    const v = traido[esCot ? 'cotizaciones' : 'ventas'][+b.dataset.fila];
    b.disabled = true;
    const antes = b.innerHTML;
    b.innerHTML = '<span class="venta__txt"><span class="puntos">Armando el recibo</span></span>';
    // Para una venta de verdad se le pregunta siempre al servidor: ahí se arma el
    // recibo si no existía y se pone al día si el pedido cambió después de
    // cobrar (una clienta que cambia lo que lleva y la venta se corrige en
    // Shopify). Las de prueba y las cotizaciones ya traen el suyo.
    let token = v.recibo;
    let alDia = false;
    try {
      if (v.order_id) {
        const r = await api(`/admin/caja/ventas/${encodeURIComponent(v.order_id)}/recibo`,
                            { method: 'POST' });
        token = r.recibo || token;
        alDia = !!r.actualizado;
      }
    } catch (err) {
      // Si ya había recibo, se sigue con ese: mejor el de antes que ninguno.
      if (!token) {
        b.disabled = false; b.innerHTML = antes;
        flash(err.message || 'No se pudo armar el recibo', 'mal');
        return;
      }
    }
    // Las acciones del recibo pasan a ser de ESTA venta.
    ventaEnMano = { recibo: token, total: v.total, name: v.numero,
                    telefono: v.telefono, nombreCliente: v.cliente, ensayo: !!v.ensayo,
                    cotizacion: esCot };
    cerrar();
    accionesDeRecibo(v, esCot && v.retomable ? v : null);
    if (alDia) flash('El pedido había cambiado: el recibo quedó al día', 'ok');
  });

  mostrar('ventas');
}

// Vuelve a poner en la caja una cotización: los mismos productos, la misma
// clienta y el mismo descuento o flete, listos para cambiar lo que haga falta y
// cobrar. Es lo que pidió la dueña: le confirman el presupuesto y lo cobra sin
// volver a armarlo.
async function retomarCotizacion(c, cerrar) {
  if (estado.venta.length
      && !confirm('Se va a reemplazar la venta que está armada por esta cotización. ¿Seguimos?')) {
    return;
  }
  let r;
  try {
    r = await api('/admin/caja/cotizaciones/' + encodeURIComponent(c.recibo));
  } catch (err) {
    flash(err.message || 'No se pudo abrir la cotización', 'mal');
    return;
  }
  if (!aplicarArmado(r.armado)) {
    flash('Esa cotización no se puede retomar', 'mal');
    return;
  }
  intentoActual = '';          // es una venta nueva, no el reintento de otra
  ventaEnMano = null;
  estado.resultado = null;
  estado.error = '';
  if (cerrar) cerrar();
  pintar();
  flash(`${r.numero || 'Cotización'} puesta en la caja`, 'ok');
}

// Las mismas acciones de la pantalla de venta cobrada, para una venta vieja.
function accionesDeRecibo(v, cotizacion = null) {
  // Una cotización no es un recibo: los botones lo dicen con sus palabras, que
  // es lo que pidió la dueña ("dice enviar recibo y estoy cotizando").
  const esCot = !!(laVenta() && laVenta().cotizacion);
  const QUE = esCot ? 'la cotización' : 'el recibo';
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true"
         aria-label="${esCot ? 'Cotización' : 'Recibo'}">
      <div class="modal__agarre"></div>
      <div class="modal__cab">
        <div style="flex:1">
          <h2>${esc(v.numero)}</h2>
          <p>${esc(v.cliente || 'Sin clienta')} · ${L(v.total)}</p>
        </div>
        <button class="modal__x" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="modal__lista">
        <div class="recibo-previa" id="recibo-previa">
          <div class="vacio"><span class="puntos">Armando ${QUE}</span></div>
        </div>
        <div class="recibo-acciones">
          ${cotizacion ? `<button class="btn btn--pink btn--ancho" data-accion="retomar"
            type="button">Pasar esta cotización a la caja</button>
            <p class="recibo-nota">Se cargan los mismos productos y la misma clienta;
            después se puede cambiar lo que sea y cobrar.</p>` : ''}
          <button class="btn btn--wa btn--ancho" data-accion="recibo-img" type="button">
            ${svg(IC.whatsapp, 0)} ${sePuedeCompartirArchivo()
              ? `Mandar ${QUE} por WhatsApp` : `Bajar la imagen de ${QUE}`}</button>
          ${v.telefono ? `<button class="btn btn--ancho btn--wa-suave" data-accion="guardar-contacto"
            type="button">Guardar el contacto de la clienta</button>
            <p class="recibo-nota">Si todavía no la tiene en la agenda, guárdela primero:
            WhatsApp solo deja mandar fotos a los contactos guardados.</p>` : ''}
          <div class="recibo-acciones__fila">
            <button class="btn" data-accion="recibo-ver" type="button">Ver ${QUE}</button>
            <button class="btn" data-accion="recibo-copiar" type="button">Copiar el enlace</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(fondo);
  const cerrar = () => { fondo.remove(); ventaEnMano = null; };
  fondo.querySelector('.modal__x').addEventListener('click', cerrar);
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  previsualizarRecibo();
  fondo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    switch (b.dataset.accion) {
      case 'recibo-img': mandarReciboEnImagen(); break;
      case 'guardar-contacto': guardarContacto(); break;
      case 'retomar': retomarCotizacion(cotizacion, cerrar); break;
      case 'recibo-ver': window.open(urlRecibo(), '_blank', 'noopener'); break;
      case 'recibo-copiar':
        navigator.clipboard.writeText(urlRecibo())
          .then(() => flash('Enlace copiado', 'ok')).catch(() => {});
        break;
    }
  });
}

// El recibo a la vista antes de mandarlo: es la MISMA imagen que se va a
// mandar, no una aproximación, y queda guardada para no dibujarla dos veces.
async function previsualizarRecibo() {
  const caja = document.getElementById('recibo-previa');
  const r = laVenta();
  if (!caja || !r || !r.recibo) return;
  try {
    const datos = await (await fetch(`${API}/recibo/${encodeURIComponent(r.recibo)}`)).json();
    const hojas = await dibujarRecibo(datos);
    if (!hojas.length) throw new Error('sin imagen');
    if (laVenta() !== r) return;          // cerraron y abrieron otra mientras tanto
    r.imagen = hojas;
    caja.innerHTML = '';
    hojas.forEach((png) => {
      const img = document.createElement('img');
      img.alt = 'Recibo';
      img.src = URL.createObjectURL(png);
      img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(img.src), 60000));
      caja.appendChild(img);
    });
  } catch (_) {
    caja.innerHTML = '<div class="vacio">No se pudo mostrar, '
      + 'pero igual se puede mandar.</div>';
  }
}

// ── El recibo como imagen ────────────────────────────────────────────────────
// Adjuntar un archivo a WhatsApp desde el navegador solo se puede por el menú
// de compartir del propio teléfono. Donde no existe (una computadora), se baja
// la imagen para adjuntarla a mano.
function sePuedeCompartirArchivo() {
  try {
    return !!(navigator.canShare && navigator.share
      && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  } catch (_) { return false; }
}

// Dibuja el recibo y devuelve las hojas en PNG, al doble de resolución para que
// se lea cuando WhatsApp lo comprima. Son varias hojas cuando la venta es larga:
// una sola imagen larguísima WhatsApp la achica hasta volverla ilegible.
const HOJA_ANCHO = 420;
const HOJA_ALTO_MAX = 920;      // más que esto, se parte en otra hoja
const MARGEN = 26;
const FOTO = 34;                // la miniatura del producto

async function dibujarRecibo(d) {
  const logo = await cargarImagen('/img/logo.png');
  // Las fotos se piden con crossOrigin o el lienzo queda "contaminado" y no se
  // puede exportar; si alguna no carga, esa línea va sin foto y ya.
  const fotos = await Promise.all((d.items || [])
    .map((it) => (it.imagen ? cargarImagen(it.imagen, true) : Promise.resolve(null))));

  const medidor = document.createElement('canvas').getContext('2d');
  medidor.font = '600 13px Montserrat, sans-serif';
  const anchoNombre = HOJA_ANCHO - MARGEN * 2 - FOTO - 8 - 86;
  const items = (d.items || []).map((it, i) => {
    const ls = partirTexto(medidor, it.nombre, anchoNombre);
    return { ...it, foto: fotos[i], lineas: ls,
             alto: Math.max(FOTO + 10, 18 + ls.length * 16) };
  });

  const hayDesc = d.descuento && d.descuento.monto > 0;
  const conFlete = d.flete && d.flete.monto > 0;
  const conComision = d.comision && d.comision.monto > 0;
  const cuantosDatos = 1 + (d.cliente ? 1 : 0) + (d.cotizacion ? 0 : 1);
  const altoCabecera = 150 + (d.ensayo ? 16 : 0) + Math.ceil(cuantosDatos / 2) * 38 + 36;
  const altoCierre = ((hayDesc || conFlete || conComision ? 1 : 0) + (hayDesc ? 1 : 0)
                    + (conFlete ? 1 : 0) + (conComision ? 1 : 0)) * 22
                   + 56 + (d.recibido ? 44 : 0) + 136;

  // Se reparten los productos en hojas: la primera lleva la cabecera y la
  // última los totales, así que cada una tiene su propio espacio disponible.
  const hojas = [];
  let actual = [];
  for (const it of items) {
    const primera = hojas.length === 0;
    const disponible = HOJA_ALTO_MAX - (primera ? altoCabecera : 110) - 40;
    const usado = actual.reduce((n, x) => n + x.alto, 0);
    if (actual.length && usado + it.alto > disponible) {
      hojas.push(actual);
      actual = [];
    }
    actual.push(it);
  }
  hojas.push(actual);
  // Si los totales no entran en la última, se van a una hoja aparte.
  const ultima = hojas[hojas.length - 1];
  const usadoUltima = ultima.reduce((n, x) => n + x.alto, 0);
  const cabeceraUltima = hojas.length === 1 ? altoCabecera : 110;
  if (cabeceraUltima + usadoUltima + altoCierre > HOJA_ALTO_MAX + 120) hojas.push([]);

  const salida = [];
  for (let n = 0; n < hojas.length; n++) {
    salida.push(await dibujarHoja(d, hojas[n], logo, {
      primera: n === 0, ultima: n === hojas.length - 1,
      numero: n + 1, total: hojas.length,
      altoCabecera, altoCierre, hayDesc, conFlete, conComision, cuantosDatos,
    }));
  }
  return salida.filter(Boolean);
}

function cargarImagen(src, deOtroSitio) {
  return new Promise((ok) => {
    const im = new Image();
    if (deOtroSitio) im.crossOrigin = 'anonymous';
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    setTimeout(() => ok(null), 6000);   // una foto lenta no frena el recibo
    im.src = src;
  });
}

async function dibujarHoja(d, items, logo, o) {
  const A = HOJA_ANCHO, M = MARGEN;
  const altoItems = items.reduce((n, it) => n + it.alto, 0);
  const alto = (o.primera ? o.altoCabecera : 110) + altoItems
             + (o.ultima ? o.altoCierre : 60);

  const lienzo = document.createElement('canvas');
  lienzo.width = A * 2; lienzo.height = Math.round(alto) * 2;
  const x = lienzo.getContext('2d');
  x.scale(2, 2);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, A, alto);

  let y = 30;
  if (logo) {
    const w = o.primera ? 96 : 68, h = logo.height * (w / logo.width);
    x.drawImage(logo, (A - w) / 2, y, w, h);
    y += h + 14;
  } else { y += 10; }
  // El titulo, grande: es lo primero que se lee y dice que es el papel.
  x.fillStyle = '#1a0a12'; x.font = '700 15px Montserrat, sans-serif';
  x.textAlign = 'center';
  // El numero va siempre que sea uno de verdad. En una venta de prueba no lo hay
  // ("(prueba)"), pero una cotizacion de prueba SI lleva su correlativo.
  const numero = d.numero && d.numero !== '(prueba)' ? ' ' + d.numero : '';
  x.fillText((d.cotizacion ? 'COTIZACIÓN' : 'RECIBO') + numero, A / 2, y + 4);
  y += 18;
  if (d.ensayo && o.primera) {
    x.fillStyle = '#8a6d12'; x.font = '700 9px Montserrat, sans-serif';
    x.fillText('PRUEBA · SIN VALOR', A / 2, y + 12);
    y += 16;
  }
  if (o.total > 1) {
    x.fillStyle = '#a98b9a'; x.font = '600 8px Montserrat, sans-serif';
    x.fillText(`HOJA ${o.numero} DE ${o.total}`, A / 2, y + 12);
    y += 14;
  }
  y += 14;
  linea(x, M, y, A - M); y += 20;

  if (o.primera) {
    x.textAlign = 'left';
    const datos = [];
    datos.push(['FECHA', fechaCorta(d.fecha)]);
    if (d.cliente) datos.push(['CLIENTA', d.cliente]);
    if (!d.cotizacion) {
      const forma = PAGOS_TEXTO[d.pago] || d.pago || '';
      datos.push(['PAGO', forma
        ? forma + (d.banco ? ' · ' + d.banco : '') + (d.pagado === false ? ' · pendiente' : '')
        : (d.pagado === false ? 'Pendiente' : 'Pagado')]);
    }
    datos.forEach(([etiqueta, valor], i) => {
      const px = (i % 2) ? A / 2 : M;
      const py = y + Math.floor(i / 2) * 38;
      x.fillStyle = '#8a6f7c'; x.font = '700 8px Montserrat, sans-serif';
      x.fillText(etiqueta, px, py);
      x.fillStyle = '#1a0a12'; x.font = '600 12px Montserrat, sans-serif';
      x.fillText(recortar(x, valor, A / 2 - M - 10), px, py + 15);
    });
    y += Math.ceil(datos.length / 2) * 38;
    linea(x, M, y, A - M); y += 18;
  }

  // Los productos, con su foto.
  x.textAlign = 'left';
  for (const it of items) {
    const arriba = y - 12;
    if (it.foto) {
      x.save();
      redondeado(x, M, arriba, FOTO, FOTO, 7);
      x.clip();
      // Se recorta al cuadrado sin deformar la foto.
      const lado = Math.min(it.foto.width, it.foto.height);
      x.drawImage(it.foto, (it.foto.width - lado) / 2, (it.foto.height - lado) / 2,
                  lado, lado, M, arriba, FOTO, FOTO);
      x.restore();
    } else {
      x.fillStyle = '#f8eef3';
      redondeado(x, M, arriba, FOTO, FOTO, 7);
      x.fill();
    }
    const tx = M + FOTO + 8;
    x.fillStyle = '#1a0a12'; x.font = '600 13px Montserrat, sans-serif';
    it.lineas.forEach((t, j) => x.fillText(t, tx, y + j * 16));
    x.textAlign = 'right';
    x.fillText(L(it.importe), A - M, y);
    x.textAlign = 'left';
    x.fillStyle = '#8a6f7c'; x.font = '500 11px Montserrat, sans-serif';
    // La talla va con el "1 × L. 500" y no en renglon propio: asi no cambia el
    // alto de la linea, que es lo que decide donde se parte la hoja.
    const detalle = (it.variante ? it.variante + ' · ' : '') + `${it.cantidad} × ${L(it.precio)}`;
    x.fillText(detalle, tx, y + it.lineas.length * 16 + 2);
    y += it.alto;
  }

  if (!o.ultima) {
    y += 6;
    x.textAlign = 'center';
    x.fillStyle = '#a98b9a'; x.font = '500 10px Montserrat, sans-serif';
    x.fillText('sigue en la hoja ' + (o.numero + 1), A / 2, y + 12);
    return new Promise((ok) => lienzo.toBlob(ok, 'image/png'));
  }

  y += 8; linea(x, M, y, A - M); y += 20;
  const fila = (etiqueta, valor, fuerte) => {
    x.textAlign = 'left';
    x.fillStyle = fuerte ? '#1a0a12' : '#8a6f7c';
    x.font = (fuerte ? '700 11px' : '500 12px') + ' Montserrat, sans-serif';
    x.fillText(etiqueta, M, y);
    x.textAlign = 'right';
    x.fillStyle = fuerte ? '#c22a5e' : '#1a0a12';
    x.font = (fuerte ? '700 22px' : '600 12px') + ' Montserrat, sans-serif';
    x.fillText(valor, A - M, y + (fuerte ? 4 : 0));
    y += fuerte ? 34 : 22;
  };
  if (o.hayDesc || o.conFlete || o.conComision) fila('Subtotal', L(d.subtotal));
  if (o.hayDesc) {
    fila('Descuento' + (d.descuento.tipo === 'porcentaje' ? ` (${d.descuento.valor}%)` : ''),
         '− ' + L(d.descuento.monto));
  }
  if (o.conFlete) fila(d.flete.titulo, L(d.flete.monto));
  if (o.conComision) fila('Comisión (5%)', L(d.comision.monto));
  fila('TOTAL', L(d.total), true);
  if (d.recibido) { fila('Recibido', L(d.recibido)); fila('Cambio', L(d.cambio || 0)); }
  // Pedido corregido después de cobrar: hay que decir cuánto falta, si no la
  // clienta se queda con un recibo que parece pagado del todo.
  if (d.pendiente > 0) {
    fila('Abonado', L(Math.max(0, (Number(d.total) || 0) - Number(d.pendiente))));
    fila('PENDIENTE', L(d.pendiente), true);
  }

  y += 6; linea(x, M, y, A - M); y += 26;
  x.textAlign = 'center';
  x.fillStyle = '#1a0a12'; x.font = '600 15px Montserrat, sans-serif';
  x.fillText(d.cotizacion ? '¡Gracias por su interés!' : '¡Gracias por su compra!', A / 2, y);
  x.fillStyle = '#c22a5e'; x.font = '600 11px Montserrat, sans-serif';
  x.fillText(`Síguenos @${TIENDA.instagram}`, A / 2, y + 22);
  x.fillStyle = '#8a6f7c'; x.font = '500 10px Montserrat, sans-serif';
  x.fillText(`Compra en línea · ${TIENDA.web}`, A / 2, y + 38);

  return new Promise((ok) => lienzo.toBlob(ok, 'image/png'));
}

// Un rectangulo con las esquinas redondeadas, para las miniaturas.
function redondeado(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

const PAGOS_TEXTO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta',
                      transferencia: 'Transferencia', credito: 'Crédito',
                      contraentrega: 'Contraentrega' };

function linea(x, x1, y, x2) {
  x.strokeStyle = 'rgba(26,10,18,0.12)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(x1, y); x.lineTo(x2, y); x.stroke();
}

function partirTexto(c, texto, ancho) {
  const palabras = String(texto || '').split(/\s+/);
  const lineas = []; let actual = '';
  for (const p of palabras) {
    const probar = actual ? actual + ' ' + p : p;
    if (c.measureText(probar).width > ancho && actual) { lineas.push(actual); actual = p; }
    else actual = probar;
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 2);
}

function recortar(x, texto, ancho) {
  let t = String(texto || '');
  while (t.length > 3 && x.measureText(t).width > ancho) t = t.slice(0, -1);
  return t;
}

// Corta de verdad: escrita larga no entraba en la columna y se cortaba sola.
function fechaCorta(iso) {
  const f = new Date(iso);
  if (isNaN(f)) return '';
  return f.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' · ' + f.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
        .replace(/\s?([ap])\.\s?m\./i, ' $1.m.');
}

async function mandarReciboEnImagen() {
  const r = laVenta();
  if (!r || !r.recibo) return;
  // Si ya se mostró la vista previa, esas mismas hojas son las que se mandan.
  let hojas = r.imagen || null;
  let datos = null;
  if (!hojas) {
    flash(r.cotizacion ? 'Armando la cotización…' : 'Armando el recibo…');
    try {
      datos = await (await fetch(`${API}/recibo/${encodeURIComponent(r.recibo)}`)).json();
    } catch (_) {
      flash('No se pudo armar. Revisá la señal.', 'mal');
      return;
    }
    try { hojas = await dibujarRecibo(datos); } catch (_) { hojas = null; }
  }
  if (!hojas || !hojas.length) { flash('No se pudo armar la imagen', 'mal'); return; }

  const numero = (datos && datos.numero) || r.name || 'pinkpower';
  const base = `${r.cotizacion ? 'cotizacion' : 'recibo'}-${String(numero).replace(/[^\w-]/g, '')}`;
  // Varias hojas cuando la venta es larga: van todas en el mismo envío.
  const archivos = hojas.map((png, i) => new File([png],
    hojas.length > 1 ? `${base}-${i + 1}de${hojas.length}.png` : `${base}.png`,
    { type: 'image/png' }));
  const hola = r.nombreCliente ? ' ' + r.nombreCliente.split(' ')[0] : '';
  // Una cotización todavía no es una compra: lleva su propio mensaje, corto.
  // La invitación a seguirlos va en el recibo de una venta, no acá.
  // Sin nombre no hay a quién saludar: "¡Hola! Le comparto…" quedaba raro, así
  // que el saludo solo va cuando la venta lleva clienta.
  const texto = r.cotizacion
    ? (hola ? `¡Hola${hola}! Le comparto su cotización 💕`
            : 'Le comparto su cotización 💕')
    : (hola ? `¡Hola${hola}! Gracias por tu compra en Pink Power 💕🛍️\n\n`
            : '¡Gracias por tu compra en Pink Power! 💕🛍️\n\n') + invitacion();

  let motivo = '';
  if (navigator.share && navigator.canShare) {
    // Se prueban dos formas, de la mejor a la que más aguanta: hay teléfonos que
    // rechazan el envío cuando lleva archivos Y texto juntos, y aceptan los
    // archivos solos. Y se pregunta con los archivos DE VERDAD, no con uno de
    // mentira: el teléfono puede aceptar compartir y rechazar justo estos.
    for (const que of [{ files: archivos, text: texto }, { files: archivos }]) {
      try {
        if (!navigator.canShare(que)) { motivo = 'el teléfono no acepta este envío'; continue; }
        await navigator.share(que);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;   // la cerró ella
        motivo = err ? `${err.name}: ${err.message}` : 'falló sin decir por qué';
      }
    }
  } else {
    motivo = 'este navegador no sabe compartir archivos';
  }

  // No se pudo mandar: se baja para adjuntarla a mano, y se dice por qué.
  archivos.forEach((archivo) => {
    const url = URL.createObjectURL(archivo);
    const a = document.createElement('a');
    a.href = url; a.download = archivo.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  flash(MODO_PRUEBA && motivo
    ? 'Guardado. No se pudo mandar: ' + motivo
    : 'Recibo guardado: adjuntalo desde WhatsApp', 'mal');
}

// La invitación a seguirlos, con las palabras de la dueña. Va en el MENSAJE y no
// en la imagen: acá los enlaces se tocan, que es lo que hace falta para que de
// verdad lleguen al Instagram.
function invitacion() {
  return `Síguenos en Instagram:\n${TIENDA.instagramUrl}\n\n`
    + `Compra en línea cuando quieras:\n${TIENDA.webUrl}`;
}

// La ficha de contacto de la clienta, para que el telefono la guarde de un
// toque. Sirve para el problema de fondo: una clienta recien creada no esta en
// la agenda, y sin agendarla no se le puede mandar un archivo por WhatsApp.
function guardarContacto() {
  const r = laVenta();
  if (!r || !r.telefono) return;
  const nombre = (r.nombreCliente || 'Clienta').trim();
  const partes = nombre.split(/\s+/);
  const pila = partes.slice(1).join(' ');
  const tel = telefonoInternacional(r.telefono);
  const ficha = ['BEGIN:VCARD', 'VERSION:3.0',
    `N:${pila};${partes[0]};;;`,
    `FN:${nombre}`,
    'ORG:Clienta Pink Power',
    `TEL;TYPE=CELL:+${tel}`,
    'END:VCARD'].join('\r\n');
  // Solo se quitan los caracteres que un nombre de archivo no admite: con una
  // lista de permitidos se perdían las tildes y quedaba "Mara Jos".
  const archivo = new File([ficha], `${nombre.replace(/[\/:*?"<>|]/g, '')}.vcf`,
                           { type: 'text/vcard' });
  const bajar = () => {
    const url = URL.createObjectURL(archivo);
    const a = document.createElement('a');
    a.href = url; a.download = archivo.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    flash('Abra el archivo para guardar el contacto', 'ok');
  };
  if (sePuedeCompartirArchivo()) {
    navigator.share({ files: [archivo] }).catch((err) => {
      if (!err || err.name !== 'AbortError') bajar();
    });
  } else { bajar(); }
}

// El numero en formato internacional y solo con digitos, que es como lo quieren
// tanto WhatsApp como la ficha de contacto.
function telefonoInternacional(telefono) {
  let tel = String(telefono || '').replace(/\D/g, '');
  if (tel.startsWith('00')) tel = tel.slice(2);
  if (tel.length === 8) tel = '504' + tel;   // acá los números son de ocho cifras
  return tel;
}

// ── Eventos ──────────────────────────────────────────────────────────────────
$('caja-main').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') {
    // El escaneo NO se maneja acá: lo atiende el detector de teclado de abajo,
    // que funciona igual con o sin foco. Acá solo se busca por texto.
    //
    // Se repinta SOLO la lista de resultados. Repintar toda la pantalla en cada
    // tecla destruía y recreaba el propio campo, que es justo donde el lector
    // está escribiendo: se perdían caracteres de la lectura.
    const texto = t.value.trim();
    estado.resultados = buscarProductos(texto);
    const cont = $('resultados');
    if (cont) cont.innerHTML = bloqueResultados();
    const limpiar = document.querySelector('[data-accion="limpiar-q"]');
    if (limpiar) limpiar.hidden = !t.value;
    // Lo que el catálogo de la caja no ve —una palabra que está solo en la
    // descripción, como "pocketspray"— se lo pregunta a Shopify.
    if (!estado.resultados.length && texto.length >= 3) buscarEnShopify(texto);

    return;
  }
  if (t.id === 'q-cliente') {
    estado.verRecientes = !t.value.trim() && estado.recientes.length > 0;
    buscarClientas(t.value);
    return;
  }
  if (t.dataset.precio !== undefined) {
    const l = estado.venta[Number(t.dataset.precio)];
    const v = num(t.value);
    if (l && v >= 0) {
      l.precio = v;
      l.especial = !l.manual && Math.abs(v - l.precioTienda) > 0.001
        && !(l.precioMayoreo != null && Math.abs(v - l.precioMayoreo) < 0.001);
      // Repintar en cada tecla sacaría el foco del campo: se actualizan a mano
      // el subtotal de la línea y los dos totales (resumen y barra del teléfono).
      const sub = t.closest('.li').querySelector('.li__sub');
      if (sub) sub.textContent = L(l.precio * l.cantidad);
      actualizarTotales();
    }
    return;
  }
  if (t.dataset.recibido !== undefined) {
    estado.recibido = t.value;
    const c = document.querySelector('.cambio b');
    if (c) c.textContent = L(cambio());
    else pintar();
    return;
  }
  if (t.dataset.descValor !== undefined) {
    estado.descuento.valor = t.value;
    actualizarTotales();
    return;
  }
  if (t.dataset.entrega !== undefined) {
    estado.preparado = !!t.checked;
    estado.entregaTocada = true;    // ya lo decidió ella: no volver a adivinar
    pintar();
    return;
  }
  if (t.dataset.parcial !== undefined) {
    estado.parcial = !!t.checked;
    if (!estado.parcial) estado.abono = '';
    pintar();
    if (estado.parcial) setTimeout(() => $('abono')?.focus(), 40);
    return;
  }
  if (t.dataset.mixto !== undefined) {
    estado.mixto = !!t.checked;
    if (!estado.mixto) { estado.pago2 = ''; estado.banco2 = ''; estado.monto1 = ''; estado.monto2 = ''; }
    pintar();
    return;
  }
  if (t.dataset.banco2 !== undefined) { estado.banco2 = t.value; pintar(); return; }
  if (t.dataset.monto1 !== undefined || t.dataset.monto2 !== undefined) {
    if (t.dataset.monto1 !== undefined) estado.monto1 = t.value;
    else estado.monto2 = t.value;
    // Como con el precio: repintar entero sacaría el foco del campo.
    const debe = document.querySelector('.cambio--debe b');
    if (debe) debe.textContent = L(loQueQueda());
    actualizarTotales();
    return;
  }
  if (t.dataset.abono !== undefined) {
    estado.abono = t.value;
    // Como con el precio: repintar en cada tecla sacaría el foco del campo.
    const debe = document.querySelector('.cambio--debe b');
    if (debe) debe.textContent = L(loQueQueda());
    const vuelto = document.querySelector('.cambio:not(.cambio--debe) b');
    if (vuelto) vuelto.textContent = L(cambio());
    actualizarTotales();
  }
});

$('caja-main').addEventListener('focusout', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.precio !== undefined) {
    const l = estado.venta[Number(t.dataset.precio)];
    if (l) t.value = Number(l.precio).toFixed(2);
  }
});

$('caja-main').addEventListener('focusin', (e) => {
  // Va a escribir el nombre: la cámara estorba y hay que sacarla del medio.
  if (e.target.id === 'q' && camara) {
    cerrarCamara();
    const i = $('q');
    if (i) i.focus({ preventScroll: true });
  }
  if (e.target.id === 'q-cliente' && !estado.verRecientes && !estado.cliente
      && !e.target.value.trim() && estado.recientes.length) {
    estado.verRecientes = true;
    pintarListaClientas();
  }
});

$('caja-main').addEventListener('change', (e) => {
  if (e.target.dataset.accion === 'switch-mayoreo') {
    estado.mayoreo = e.target.checked;
    recalcularPrecios();
    pintar();
    enfocarBuscador();
  }
});

$('caja-main').addEventListener('keydown', (e) => {
  // Enter escrito a mano (el del lector ya lo consumió el detector de abajo).
  if (e.target.id === 'q' && e.key === 'Enter') {
    e.preventDefault();
    const texto = e.target.value.trim();
    const porCodigo = estado.porBarcode.get(texto);
    if (porCodigo) { e.target.value = ''; estado.resultados = []; agregar(porCodigo); return; }
    if (estado.resultados.length >= 1) {
      const v = estado.resultados[0];
      e.target.value = '';
      estado.resultados = [];
      agregar(v);
    }
  }
  if (e.key === 'Escape') {
    estado.resultados = [];
    estado.resClientes = null;
    estado.verRecientes = false;
    estado.descAbierto = false;
    pintar();
    enfocarBuscador();
  }
});

$('caja-main').addEventListener('click', (e) => {
  const btn = e.target.closest('button');

  // Tocar el campo para escribir el nombre saca la camara del medio. Va tambien
  // aqui y no solo en el foco: si el campo ya lo tenia, no hay evento de foco.
  if (camara && e.target.id === 'q') {
    cerrarCamara();
    const i = $('q');
    if (i) i.focus({ preventScroll: true });
    return;
  }

  // Desplegables propios: un clic afuera los cierra.
  if (estado.bancoAbierto && !e.target.closest('.pp-select')) {
    estado.bancoAbierto = false;
    pintar();
  }
  if (estado.descAbierto && !e.target.closest('.pp-select')) {
    estado.descAbierto = false;
    pintar();
  }
  if (estado.verRecientes && !e.target.closest('.tarjeta--cliente')) {
    estado.verRecientes = false;
    pintarListaClientas();
  }
  // La lista de productos también se cierra al tocar fuera: si no, queda tapando
  // la venta. El texto escrito se conserva, así que basta volver a escribir.
  if (estado.resultados.length && !e.target.closest('.buscador-zona')) {
    estado.resultados = [];
    pintar();
  }
  if (!btn) return;
  const d = btn.dataset;

  if (d.select === 'desc') { estado.descAbierto = !estado.descAbierto; pintar(); return; }
  if (d.select === 'banco') {
    estado.bancoAbierto = !estado.bancoAbierto;
    pintar();
    // Que la lista quede a la vista: el campo es el último de la pantalla y, al
    // abrirse, la lista puede caer justo debajo del borde.
    if (estado.bancoAbierto) {
      const menu = document.querySelector('.pp-select__menu--arriba');
      if (menu) menu.scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  if (d.banco !== undefined) {
    estado.banco = d.banco;
    estado.bancoAbierto = false;
    pintar();
    return;
  }
  if (d.descTipo !== undefined) {
    estado.descuento.tipo = d.descTipo;
    if (!d.descTipo) estado.descuento.valor = 0;
    estado.descAbierto = false;
    pintar();
    return;
  }
  if (d.res !== undefined) {
    // La búsqueda NO se cierra al agregar: si la clienta lleva cuatro cosas del
    // mismo aroma, cerrarla obligaba a escribir el aroma cuatro veces. La lista
    // se queda, y cada fila muestra cuántas unidades van ya en la venta. Para
    // salir de la búsqueda está la × del buscador.
    agregar(estado.resultados[Number(d.res)], true);
    return;
  }
  if (d.cli !== undefined) {
    const origen = d.origen === 'recientes' ? estado.recientes : estado.resClientes;
    elegirCliente(origen[Number(d.cli)]);
    return;
  }
  if (d.quitar !== undefined) { quitar(Number(d.quitar)); return; }
  if (d.mas !== undefined) { cambiarCantidad(Number(d.mas), 1); return; }
  if (d.menos !== undefined) { cambiarCantidad(Number(d.menos), -1); return; }
  if (d.flete !== undefined) {
    estado.flete = d.flete;
    // Con flete casi siempre es un envío, que se prepara después; sin flete, la
    // clienta está enfrente y se lo lleva. Se adivina, pero manda lo que marque
    // la cajera: si ya lo tocó a mano en esta venta, no se le cambia.
    if (!estado.entregaTocada) estado.preparado = !estado.flete;
    pintar();
    return;
  }
  if (d.pago2 !== undefined) {
    estado.pago2 = estado.pago2 === d.pago2 ? '' : d.pago2;
    if (estado.pago2 !== 'transferencia') estado.banco2 = '';
    // Lo que falta para el total, que es lo que casi siempre va en el segundo.
    if (estado.pago2 && !estado.monto2) {
      const resto = Math.max(0, total() - num(estado.monto1));
      estado.monto2 = resto ? String(resto.toFixed(2)) : '';
    }
    pintar();
    return;
  }
  if (d.pago !== undefined) {
    estado.pago = estado.pago === d.pago ? '' : d.pago;
    if (estado.pago !== 'transferencia') estado.banco = '';
    // Los campos que aparecen con la forma de pago (el banco, el "Recibí") caen
    // al final del bloque, que se desplaza por dentro: sin esto quedan fuera de
    // la vista justo cuando hay que usarlos, y sin banco no deja cobrar.
    const alElegir = estado.pago;
    setTimeout(() => {
      if (estado.pago !== alElegir) return;
      const campo = document.querySelector(
        alElegir === 'transferencia' ? '[data-select="banco"]' : '#recibido');
      if (campo) campo.scrollIntoView({ block: 'nearest' });
    }, 40);
    pintar();
    return;
  }

  switch (d.accion) {
    case 'limpiar-q': {
      const q = $('q'); if (q) q.value = '';
      estado.resultados = []; pintar(); enfocarBuscador(); break;
    }
    case 'recargar': cargarCatalogo(); break;
    case 'quitar-cliente':
      estado.cliente = null; recalcularPrecios(); pintar(); enfocarBuscador(); break;
    case 'cobrar': cobrar(); break;
    case 'nueva': nuevaVenta(); break;
    case 'manual': pedirManual(); break;
    case 'recibo-img': mandarReciboEnImagen(); break;
    case 'guardar-contacto': guardarContacto(); break;
    case 'ventas': verVentas(); break;
    case 'cotizar': cotizar(); break;
    case 'recibo-ver': window.open(urlRecibo(), '_blank', 'noopener'); break;
    case 'recibo-copiar':
      navigator.clipboard.writeText(urlRecibo())
        .then(() => flash('Enlace copiado', 'ok'))
        .catch(() => flash('No se pudo copiar', 'mal'));
      break;
    case 'buscar': {
      if (camara) cerrarCamara();
      const campo = $('q');
      if (campo) { campo.scrollIntoView({ block: 'center' }); campo.focus(); }
      break;
    }
    case 'camara': abrirCamara(); break;
    case 'rebuscar': buscarDeNuevo(estado.codigoSinHallar); break;
    case 'crear-cliente': pedirClienta(); break;
  }
});

// Los botones de la barra de arriba viven fuera de #caja-main, que es donde
// escucha el manejador de acciones: se conectan aparte.
const btnVentas = document.querySelector('.top [data-accion="ventas"]');
if (btnVentas) btnVentas.addEventListener('click', verVentas);

$('btn-nueva').addEventListener('click', () => {
  if (!estado.venta.length || estado.resultado || confirm('¿Borrar esta venta y empezar otra?')) {
    nuevaVenta();
  }
});

// ── Modales ──────────────────────────────────────────────────────────────────
function modal({ titulo, sub = '', cuerpo, ok = 'Guardar' }) {
  // La cámara está por encima de los modales: si sigue abierta, el modal se
  // abre debajo y parece que el botón no hizo nada.
  if (camara) cerrarCamara();
  const el = document.createElement('div');
  el.className = 'modal-fondo';
  el.innerHTML = `
    <div class="modal scroll-lindo" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal__agarre"></div>
      <div class="modal__cab">
        <div style="flex:1">
          <h2>${esc(titulo)}</h2>
          ${sub ? `<p>${esc(sub)}</p>` : ''}
        </div>
        <button class="modal__x" data-x type="button" aria-label="Cerrar">&times;</button>
      </div>
      ${cuerpo}
      <div class="modal__pie">
        <button class="btn" data-x type="button">Cancelar</button>
        <button class="btn btn--pink" data-ok type="button">${esc(ok)}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const cerrar = () => { el.remove(); document.removeEventListener('keydown', porTecla); enfocarBuscador(); };
  const porTecla = (ev) => { if (ev.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', porTecla);
  el.addEventListener('click', (ev) => {
    if (ev.target === el || ev.target.closest('[data-x]')) cerrar();
  });
  return { el, cerrar };
}

function pedirManual() {
  const { el, cerrar } = modal({
    titulo: 'Producto personalizado',
    sub: 'Para algo que no está en el catálogo.',
    ok: 'Agregar',
    cuerpo: `
      <div class="campo"><label for="m-desc">Descripción</label>
        <input id="m-desc" placeholder="Bolsa de regalo" /></div>
      <div style="display:flex; gap:0.7rem">
        <div class="campo" style="flex:1.4"><label for="m-precio">Precio</label>
          <input id="m-precio" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" /></div>
        <div class="campo" style="flex:1"><label for="m-cant">Cantidad</label>
          <input id="m-cant" type="number" inputmode="numeric" min="1" value="1" /></div>
      </div>`,
  });
  el.querySelector('[data-ok]').addEventListener('click', () => {
    const desc = el.querySelector('#m-desc').value.trim();
    const precio = Number(el.querySelector('#m-precio').value);
    const cant = Math.max(1, Number(el.querySelector('#m-cant').value) || 1);
    if (!desc || !(precio >= 0)) { el.querySelector('#m-desc').focus(); return; }
    estado.venta.push({
      variant_id: null, nombre: desc, variante: '', marca: '', imagen: '',
      precioTienda: precio, precioMayoreo: null, precio, cantidad: cant,
      especial: false, manual: true,
    });
    cerrar(); pintar(); enfocarBuscador();
  });
  setTimeout(() => el.querySelector('#m-desc').focus(), 80);
}

function pedirClienta() {
  const inicial = $('q-cliente') ? $('q-cliente').value.trim() : '';
  const soloDigitos = /^[\d\s+-]+$/.test(inicial);
  const { el, cerrar } = modal({
    titulo: 'Clienta nueva',
    sub: 'Queda guardada en Shopify para la próxima compra.',
    ok: 'Crear',
    cuerpo: `
      <div style="display:flex; gap:0.7rem">
        <div class="campo" style="flex:1"><label for="c-nom">Nombre</label>
          <input id="c-nom" value="${soloDigitos ? '' : esc(inicial)}" /></div>
        <div class="campo" style="flex:1"><label for="c-ape">Apellido</label>
          <input id="c-ape" /></div>
      </div>
      <div class="campo"><label for="c-tel">Teléfono</label>
        <input id="c-tel" type="tel" inputmode="tel" placeholder="9999-9999"
               value="${soloDigitos ? esc(inicial) : ''}" /></div>
      <label class="switch"><input type="checkbox" id="c-may" /> Es mayorista</label>
      <!-- El acceso a la página es otra cosa que la ficha de la clienta, y antes
           había que ir al panel a crearlo. Acá se hace de una vez. -->
      <div id="c-acceso" hidden style="margin-top:0.6rem">
        <p class="recibo-nota" style="margin:0 0 0.5rem">
          Para que entre a pinkpowerhn.com con precios de mayoreo, ponele usuario
          y contraseña. Si lo dejás en blanco, queda solo la ficha.</p>
        <div style="display:flex; gap:0.7rem">
          <div class="campo" style="flex:1"><label for="c-user">Usuario</label>
            <input id="c-user" autocapitalize="none" spellcheck="false" /></div>
          <div class="campo" style="flex:1"><label for="c-pass">Contraseña</label>
            <input id="c-pass" type="text" autocomplete="off" /></div>
        </div>
      </div>
      <!-- El aviso va DENTRO del modal: en la pantalla de atrás queda tapado. -->
      <div class="aviso-caja aviso-caja--roja" id="c-err" hidden></div>`,
  });
  const may = el.querySelector('#c-may');
  const acceso = el.querySelector('#c-acceso');
  may.addEventListener('change', () => {
    acceso.hidden = !may.checked;
    if (may.checked) setTimeout(() => el.querySelector('#c-user').focus(), 60);
  });
  const aviso = el.querySelector('#c-err');
  const avisar = (texto) => { aviso.textContent = texto || ''; aviso.hidden = !texto; };
  el.querySelector('[data-ok]').addEventListener('click', async (ev) => {
    avisar('');
    const nombre = el.querySelector('#c-nom').value.trim();
    if (!nombre) { avisar('Falta el nombre'); el.querySelector('#c-nom').focus(); return; }
    const hecho = await crearClienta({
      nombre,
      apellido: el.querySelector('#c-ape').value.trim(),
      telefono: el.querySelector('#c-tel').value.trim(),
      mayoreo: may.checked,
      usuario: may.checked ? el.querySelector('#c-user').value.trim() : '',
      password: may.checked ? el.querySelector('#c-pass').value : '',
    }, ev.target, avisar);
    if (hecho) cerrar();
  });
  setTimeout(() => el.querySelector(soloDigitos ? '#c-tel' : '#c-nom').focus(), 80);
}

// ── Escáner ──────────────────────────────────────────────────────────────────
// Un lector de código de barras (USB o Bluetooth) escribe como si fuera un
// teclado: manda los dígitos y casi siempre un Enter al final. El problema de
// mostrador es que el foco se pierde en cuanto se toca cualquier otra cosa, y
// entonces el escaneo se va a la nada.
//
// Por eso NO dependemos del foco: se escucha el teclado en toda la página y se
// distingue al lector por el RITMO — un lector manda las teclas cada pocos
// milisegundos, una persona no baja de ~80 ms. Si el ritmo es de lector, el
// código se procesa aunque el buscador no tenga el foco.
//
// En teléfono esto es además lo cómodo: sin foco no sale el teclado virtual
// tapando media pantalla, y el lector Bluetooth funciona igual.
// Máximo entre teclas para tomarlo por lector y no por dedos. Un lector USB va a
// 5-20 ms; escribiendo rápido a mano cuesta más de 100. 60 deja margen para los
// lectores lentos sin confundirse con una persona.
// Los bancos a los que le transfieren. "Otro" para no dejarla trabada si le
// transfieren desde uno que no está en la lista.
const BANCOS = ['BAC', 'Atlántida', 'Banpaís', 'Ficohsa', 'Occidente', 'Otro'];

// El envío, cuando la compra se manda. Viaja como línea de envío del pedido y
// no como un producto más, para que los informes de Shopify sigan cuadrando.
const FLETES = [
  { v: '', t: 'Sin flete', monto: 0 },
  { v: 'local', t: 'Local', monto: 95, titulo: 'Envío local' },
  { v: 'nacional', t: 'Nacional', monto: 110, titulo: 'Envío nacional' },
];

function elFlete() {
  return FLETES.find((f) => f.v === estado.flete) || FLETES[0];
}

const RITMO_LECTOR = 60;
const LARGO_MINIMO = 5;     // menos de esto no es un código de barras
let bufer = '';
let ultimaTecla = 0;
let cierreBufer = null;

function hayModalAbierto() {
  return !!document.querySelector('.modal-fondo') || !!document.querySelector('.camara');
}

function esCampoDeTexto(el) {
  if (!el) return false;
  const t = (el.tagName || '').toLowerCase();
  return t === 'input' || t === 'textarea' || el.isContentEditable;
}

// ── El pip del escáner ──────────────────────────────────────────────────────
// El sonido lo arma el navegador: el pip de un lector láser es un tono puro, así
// que sintetizado suena igual, no pesa nada y suena en el acto (un archivo de
// audio hay que cargarlo, y el primer escaneo del día llegaría mudo).
let audio = null;

function prepararAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (_) { audio = null; }
}

function tono(hz, ms, volumen = 0.22, demora = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + demora;
  const osc = audio.createOscillator();
  const vol = audio.createGain();
  osc.type = 'square';            // el timbre seco del lector, no un pito redondo
  osc.frequency.value = hz;
  // Entra y sale rápido, pero no de golpe: cortado en seco chasquea.
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(volumen, t0 + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(vol);
  vol.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

function pip() { prepararAudio(); tono(2730, 110); }
function pipMal() { prepararAudio(); tono(440, 130); tono(300, 180, 0.22, 0.15); }

// Los navegadores no dejan sonar nada hasta que la persona toca la pantalla: se
// deja el audio listo en el primer toque, no en el primer escaneo.
document.addEventListener('pointerdown', prepararAudio, { once: true });
document.addEventListener('keydown', prepararAudio, { once: true });

function flash(texto, tipo = '') {
  // Con la cámara abierta no hace falta: el marcador de abajo ya dice lo que
  // entró, y el aviso flotante le tapaba el botón de Listo.
  if (camara) return;
  let el = document.getElementById('flash-caja');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash-caja';
    document.body.appendChild(el);
  }
  el.className = 'flash' + (tipo ? ' flash--' + tipo : '');
  el.textContent = texto;
  requestAnimationFrame(() => el.classList.add('is-show'));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-show'), 2200);
}

// Deja constancia de que ese codigo ya entro, y pide que el producto se mueva
// antes de volver a contarlo. Vale para los dos caminos: el lector de mano y la
// camara. Sin esto, con la camara abierta y el lector pasando el mismo codigo,
// el producto entraba dos veces.
function marcarLeido(codigo) {
  if (!camara) return;
  camara.leidos.set(codigo, Date.now());
  camara.escenaRef = firmaEscena(camara.video);
  camara.escenaCambio = false;
}

async function procesarEscaneo(codigo) {
  const limpio = (codigo || '').trim();
  if (!limpio) return;
  // El código pudo escribirse dentro del buscador (si tenía el foco): se limpia
  // para que la próxima lectura empiece en blanco.
  const q = $('q');
  if (q) q.value = '';
  estado.resultados = [];

  const v = estado.porBarcode.get(limpio);
  if (v) {
    pip();
    agregar(v);
    marcarLeido(limpio);
    flash(v.producto, 'ok');
    return;
  }
  // No está en el catálogo que tiene la caja. Antes de darlo por perdido se le
  // pregunta a Shopify: cubre los códigos recién cargados y, sobre todo, los
  // SECUNDARIOS (una variante puede tener varios códigos y la API solo devuelve
  // el principal, pero el buscador de Shopify los conoce todos).
  const enShopify = await preguntarAShopify(limpio);
  if (enShopify) {
    estado.catalogo.push({
      ...enShopify,
      busca: norm([enShopify.producto, enShopify.marca, enShopify.variante].filter(Boolean).join(' ')),
    });
    estado.porBarcode.set(limpio, enShopify);
    if (enShopify.variant_id) estado.porVariante.set(enShopify.variant_id, enShopify);
    pip();
    agregar(enShopify);
    marcarLeido(limpio);
    if (camara) { fichaCamara(limpio); ventaCamara(); }
    else flash(enShopify.producto, 'ok');
    return;
  }

  pipMal();
  if (q) { q.value = limpio; estado.resultados = buscarProductos(limpio); }
  estado.codigoSinHallar = limpio;
  pintar();
  if (camara) fichaCamara(limpio, 'Ese código no está en el catálogo');
  else flash('Ese código no está en el catálogo', 'mal');
}

// Una sola consulta, rápida: no rearma el catálogo entero.
async function preguntarAShopify(codigo) {
  try {
    return await api('/admin/caja/codigo?codigo=' + encodeURIComponent(codigo));
  } catch (_) {
    return null;   // 404 (no existe) o sin señal: sigue el camino de siempre
  }
}

// Pide el catálogo del momento (sin esperar al refresco de fondo) y vuelve a
// probar ese código: es lo que hace falta apenas se carga un código en Shopify.
async function buscarDeNuevo(codigo) {
  if (!String(codigo || '').trim()) return;   // sin código no hay qué buscar
  const caja = document.getElementById('camara-marcador');
  if (caja) caja.innerHTML = '<p class="camara__ayuda"><span class="puntos">Buscando en Shopify</span></p>';
  else flash('Buscando en Shopify…');
  let v = await preguntarAShopify(codigo);
  if (v) {
    estado.catalogo.push({
      ...v, busca: norm([v.producto, v.marca, v.variante].filter(Boolean).join(' ')),
    });
    estado.porBarcode.set(codigo, v);
    if (v.variant_id) estado.porVariante.set(v.variant_id, v);
  } else {
    // Último recurso: rearmar el catálogo completo contra Shopify.
    try {
      const data = await api('/admin/caja/catalogo?refrescar=1');
      estado.catalogo = (data.variantes || []).map((x) => ({
        ...x, busca: norm([x.producto, x.marca, x.variante].filter(Boolean).join(' ')),
      }));
      indexarCatalogo();
    } catch (_) {
      if (caja) fichaCamara(codigo, 'No se pudo consultar. Revisá la señal.');
      return;
    }
    v = estado.porBarcode.get(codigo);
  }
  if (!v) {
    if (caja) fichaCamara(codigo, 'Ese código sigue sin estar en Shopify');
    else flash('Ese código sigue sin estar en Shopify', 'mal');
    return;
  }
  // Queda marcado como ya leído, no borrado: si se borrara, con el producto
  // todavía delante de la cámara entraría una segunda vez al instante.
  marcarLeido(codigo);
  estado.codigoSinHallar = '';
  agregar(v);
  if (camara) fichaCamara(codigo);
  else flash(v.producto, 'ok');
}

// Se escucha en fase de CAPTURA para llegar antes que el manejador del buscador:
// así una lectura no se procesa dos veces (una por el lector y otra por el Enter
// del campo).
document.addEventListener('keydown', (e) => {
  if (estado.cargandoCatalogo || estado.resultado || hayModalAbierto()) return;

  const activo = document.activeElement;
  // Si la cajera está escribiendo a mano en OTRO campo (precio, recibí, clienta),
  // no le robamos las teclas.
  if (esCampoDeTexto(activo) && activo.id !== 'q') return;

  const ahora = Date.now();

  if (e.key === 'Enter') {
    // Solo se toma como lectura si las teclas vinieron al ritmo del lector.
    if (bufer.length >= LARGO_MINIMO) {
      e.preventDefault();
      e.stopPropagation();
      const codigo = bufer;
      bufer = '';
      procesarEscaneo(codigo);
      return;
    }
    bufer = '';
    return;
  }
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

  // Pausa larga = tecleo humano: el búfer arranca de nuevo.
  if (ahora - ultimaTecla > RITMO_LECTOR) bufer = '';
  bufer += e.key;
  ultimaTecla = ahora;

  // Lectores que no mandan Enter: se cierra el código al quedarse quieto.
  clearTimeout(cierreBufer);
  cierreBufer = setTimeout(() => {
    if (bufer.length >= LARGO_MINIMO) {
      const codigo = bufer;
      bufer = '';
      procesarEscaneo(codigo);
    }
    bufer = '';
  }, 140);
}, true);

document.addEventListener('click', (e) => {
  if (esTactil || estado.resultado || hayModalAbierto()) return;
  if (esCampoDeTexto(e.target) || e.target.closest('button, a, label')) return;
  enfocarBuscador();
});

// ── Escanear con la cámara ───────────────────────────────────────────────────
// Es el respaldo del lector, sobre todo para cobrar desde el teléfono. Chrome de
// Android trae un detector propio; donde no está (Safari), se carga ZXing.
const FORMATOS_CODIGO = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

// La franja del fotograma que entra en el visor (que recorta por los bordes).
// Se calcula porque el fotograma puede venir vertical u horizontal segun el
// telefono, y lo que se analiza tiene que ser lo mismo que la cajera ve.
function zonaVisible(video, visor) {
  const arVisor = (visor.clientWidth || 4) / (visor.clientHeight || 3);
  const arVideo = (video.videoWidth || 4) / (video.videoHeight || 3);
  return arVideo > arVisor
    ? { w: arVisor / arVideo, h: 1 }    // video mas ancho: se recortan los lados
    : { w: 1, h: arVideo / arVisor };   // video mas alto: se recorta arriba y abajo
}

// Un recorte mas cerrado dentro de lo visible, para los codigos chicos.
function zonaCerca(zona) {
  return { w: zona.w * 0.62, h: zona.h * 0.55 };
}

// Dibuja un recorte centrado del video en el lienzo, ampliado si es chico.
function recorte(video, lienzo, zona, filtro, anchoMaximo) {
  const w = Math.round(video.videoWidth * zona.w);
  const h = Math.round(video.videoHeight * zona.h);
  if (!w || !h) return false;
  // Se amplía si el recorte es chico y se achica si pasa del ancho máximo que
  // pida quien llama: un lienzo enorme no lee ni un código más y hace lento el
  // escaneo, que es lo que se nota en el teléfono.
  let f = w >= 1100 ? 1 : 2;
  if (anchoMaximo && w * f > anchoMaximo) f = anchoMaximo / w;
  lienzo.width = Math.round(w * f); lienzo.height = Math.round(h * f);
  const c = lienzo.getContext('2d');
  // Con suavizado: sin él, al ampliar las barras finas se cuantizan y cambian
  // de grosor, y el código se lee mal.
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.filter = filtro || 'none';
  c.drawImage(video, Math.round((video.videoWidth - w) / 2),
              Math.round((video.videoHeight - h) / 2), w, h,
              0, 0, lienzo.width, lienzo.height);
  c.filter = 'none';
  return true;
}
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

let camara = null;
// Cada apertura lleva su número. Abrir la cámara tarda (permiso, video, lector)
// y en ese rato la pueden cerrar o volver a abrir: el número deja descartar lo
// que venía en camino de una apertura que ya no vale.
let sesionCamara = 0;

async function detectarCamara() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const equipos = await navigator.mediaDevices.enumerateDevices();
    estado.hayCamara = equipos.some((e) => e.kind === 'videoinput');
    if (estado.hayCamara) pintar();
  } catch (_) { /* sin permisos no se puede saber: se deja el botón oculto */ }
}

function cargarZxing() {
  if (window.ZXing) return Promise.resolve();
  return new Promise((ok, mal) => {
    const sc = document.createElement('script');
    sc.src = ZXING_URL;
    sc.onload = ok;
    sc.onerror = () => mal(new Error('No se pudo cargar el lector'));
    document.head.appendChild(sc);
  });
}

// Dentro de la cámara hay que ver que el producto entró: el aviso flotante solo
// no alcanzaba (de hecho quedaba tapado), y la clienta escaneó cinco veces lo
// mismo sin darse cuenta.
// Debajo del visor va la ficha del último producto escaneado, con sus botones de
// cantidad: es lo que pidió la clienta para no tener que salir de la cámara para
// corregir. También resuelve el caso de llevar dos iguales.
// La venta, dentro de la hoja: la cajera ve entrar cada producto con su precio y
// el total sumando, sin salir de la cámara.
function ventaCamara() {
  const caja = document.getElementById('camara-venta');
  if (!caja) return;
  if (!estado.venta.length) {
    caja.innerHTML = '<p class="camara__vacia">Todavía no hay productos</p>';
    return;
  }
  const unidades = estado.venta.reduce((n, l) => n + l.cantidad, 0);
  caja.innerHTML = `
    <div class="camara__total">
      <span>Total <i>· ${unidades} producto${unidades !== 1 ? 's' : ''}</i></span>
      <b>${L(total())}</b>
    </div>`;
  // Lo último agregado se lleva a la vista en la pantalla de atrás, justo encima
  // de la hoja: el detalle con fotos se lee ahí, no dentro de la cámara.
  verUltimoEnElFondo();
  // Y otra vez cuando la hoja terminó de entrar: mientras se desliza, su borde
  // todavía no está donde va a quedar y la cuenta sale corrida.
  const hoja = document.querySelector('.camara__hoja');
  if (hoja && hoja.getAnimations().length) {
    Promise.all(hoja.getAnimations().map((a) => a.finished))
      .then(() => verUltimoEnElFondo())
      .catch(() => {});
  }
}

function verUltimoEnElFondo() {
  const lineas = document.querySelectorAll('.li');
  const ultima = lineas[lineas.length - 1];
  const hoja = document.querySelector('.camara__hoja');
  if (!ultima || !hoja) return;
  // Hueco al pie mientras la cámara está abierta: sin él la página ya está al
  // final del scroll y la última línea no puede subir por encima de la hoja.
  const main = $('caja-main');
  if (main) main.style.paddingBottom = Math.round(hoja.getBoundingClientRect().height + 24) + 'px';
  // Se acomoda la pantalla de atrás para que lo último agregado quede JUSTO
  // encima de la hoja. Si no, en el teléfono la hoja tapa la parte de la lista
  // donde acaba de entrar el producto.
  const libre = hoja.getBoundingClientRect().top;
  const desfase = ultima.getBoundingClientRect().bottom - (libre - 12);
  // Instantáneo, no suave: el desplazamiento animado se pausa cuando el sistema
  // ahorra recursos, y en el mostrador conviene que el salto sea inmediato.
  if (Math.abs(desfase) > 6) window.scrollBy(0, desfase);
}

// Una miniatura de 16x16 del video. Sirve para saber si la escena cambió: al
// apartar un producto cambia mucho; al reenfocar, casi nada (a ese tamaño el
// promedio de cada celda ya es un desenfoque). Es lo que permite distinguir
// "volvió a pasar el producto" de "lo dejó delante de la cámara".
const OJO = document.createElement('canvas');
OJO.width = 16; OJO.height = 16;

function firmaEscena(video) {
  try {
    const c = OJO.getContext('2d', { willReadFrequently: true });
    c.drawImage(video, 0, 0, 16, 16);
    const d = c.getImageData(0, 0, 16, 16).data;
    const a = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      a[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
    }
    return a;
  } catch (_) { return null; }
}

function cambioLaEscena(a, b) {
  if (!a || !b) return true;
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += Math.abs(a[i] - b[i]);
  return suma / 256 > 12;
}

function fichaCamara(codigo, aviso) {
  if (!camara) return;
  const caja = document.getElementById('camara-marcador');
  if (!caja) return;

  if (aviso) {
    const puedeReintentar = aviso.includes('no está en el catálogo');
    caja.innerHTML = `<div class="camara__aviso">
        <p class="camara__ayuda camara__ayuda--mal">${esc(aviso)}</p>
        ${puedeReintentar ? `<button class="camara__mas" type="button" data-rebuscar>
          Buscar de nuevo en Shopify</button>` : ''}
      </div>`;
    caja.dataset.codigo = '';
    const btn = caja.querySelector('[data-rebuscar]');
    if (btn) btn.addEventListener('click', () => buscarDeNuevo(codigo));
    return;
  }
  const v = estado.porBarcode.get(codigo);
  const i = v ? estado.venta.findIndex((l) => l.variant_id === v.variant_id) : -1;
  if (i === -1) return;
  const l = estado.venta[i];
  const unidades = estado.venta.reduce((n, x) => n + x.cantidad, 0);
  caja.dataset.codigo = codigo;
  caja.innerHTML = `
    <div class="camara__ficha">
      ${l.imagen ? `<img src="${esc(l.imagen)}" alt="" />` : '<span class="camara__sinfoto">✦</span>'}
      <div class="camara__datos">
        <b>${esc(l.nombre)}</b>
        <span>${L(l.precio)} c/u · ${unidades} en la venta · ${L(total())}</span>
        ${(() => {
          // Lo que el sistema dice que hay: con el producto en la mano es cuando
          // sirve, para ver de una si el inventario cuadra con lo físico.
          const hay = existenciaDe(l.variant_id);
          if (hay == null) return '';
          return `<span class="camara__inv${l.cantidad > hay ? ' camara__inv--ojo' : ''}">${
            l.cantidad > hay ? `lleva ${l.cantidad} y el sistema tiene ${hay}`
                             : `${hay} en existencia`}</span>`;
        })()}
      </div>
      <div class="cant">
        <button data-cam-menos type="button" aria-label="Menos">−</button>
        <span>${l.cantidad}</span>
        <button data-cam-mas type="button" aria-label="Más">+</button>
      </div>
    </div>`;
  const menos = caja.querySelector('[data-cam-menos]');
  const mas = caja.querySelector('[data-cam-mas]');
  // La línea se busca EN EL MOMENTO del toque: guardarse la posición de cuando
  // se pintó la ficha hacía que, si la venta cambió, el botón le sumara a otro
  // producto.
  const donde = () => estado.venta.findIndex((x) => x.variant_id === l.variant_id);
  if (mas) mas.addEventListener('click', () => {
    const j = donde();
    if (j === -1) return;
    cambiarCantidad(j, 1); fichaCamara(codigo); ventaCamara();
  });
  if (menos) menos.addEventListener('click', () => {
    const j = donde();
    if (j === -1) return;
    cambiarCantidad(j, -1);
    // Si se quitó la última unidad, la línea desaparece. NO se borra de los ya
    // leídos: con el producto todavía delante de la cámara, volvía a entrar solo
    // y parecía que el botón no servía. Para reponerlo hay que pasarlo de nuevo,
    // que es lo que la regla de "la imagen cambió" ya sabe distinguir.
    if (donde() === -1) {
      if (camara) {
        camara.escenaRef = firmaEscena(camara.video);
        camara.escenaCambio = false;
      }
      caja.innerHTML = `<p class="camara__ayuda">Quitado de la venta</p>`;
      caja.dataset.codigo = '';
    } else {
      fichaCamara(codigo);
    }
    ventaCamara();
  });
  caja.classList.remove('camara__marcador--flash');
  void caja.offsetWidth;
  caja.classList.add('camara__marcador--flash');
}

function cerrarCamara() {
  if (!camara) return;
  sesionCamara += 1;   // invalida lo que esté en camino de esta apertura
  try { camara.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
  if (camara.lector) { try { camara.lector.reset(); } catch (_) {} }
  clearTimeout(camara.timer);    // el ciclo de lectura está encadenado
  clearInterval(camara.ojo);
  camara.caja.remove();
  const main = $('caja-main');
  if (main) main.style.paddingBottom = '';   // se devuelve el alto normal
  document.removeEventListener('keydown', camara.porTecla);
  camara = null;
  // Solo se repinta si hay algo que mostrar: repintar rehace el buscador y le
  // quita el foco, o sea le cierra el teclado en plena escritura.
  if (estado.codigoSinHallar) pintar();
  enfocarBuscador();
}

// Lo que se le pide a la cámara. Sale aparte porque también se usa al cambiar
// de cámara sin cerrar la hoja.
function pedidoDeVideo(deviceId) {
  const v = {
    // 1920 y no más: en resolución máxima muchas cámaras enfocan más lento, y
    // para un código de barras 1920 sobra. El problema nunca fue la cantidad de
    // píxeles, fue el foco.
    width: { ideal: 1920 }, height: { ideal: 1080 },
    frameRate: { ideal: 30 },
    resizeMode: { ideal: 'none' },
    advanced: [{ focusMode: 'continuous' }],
  };
  if (deviceId) v.deviceId = { exact: deviceId };
  else v.facingMode = { ideal: 'environment' };
  return v;
}

// Las cámaras de atrás que tiene el teléfono. Solo se pueden mirar DESPUÉS de
// que dieron permiso: antes, los nombres vienen vacíos.
async function camarasDeAtras() {
  try {
    const equipos = await navigator.mediaDevices.enumerateDevices();
    const videos = equipos.filter((e) => e.kind === 'videoinput');
    const atras = videos.filter((e) => /back|rear|trasera|environment/i.test(e.label || ''));
    const lista = atras.length ? atras : videos;
    // Por el número que les pone el sistema ("camera 0", "camera2 3"): la 0 es
    // la principal. El orden en que las devuelve el navegador no lo respeta.
    return lista.slice().sort((a, b) => numeroDeCamara(a) - numeroDeCamara(b));
  } catch (_) { return []; }
}

function numeroDeCamara(equipo) {
  const m = /camera2?\s*(\d+)/i.exec(equipo.label || '');
  return m ? Number(m[1]) : 99;
}

// ¿Sabe enfocar? Una cámara de enfoque fijo —la gran angular de casi todos los
// teléfonos— nunca va a leer un código de cerca, por rápido que vaya el lector.
function sabeEnfocar(pista) {
  try {
    const cap = pista.getCapabilities && pista.getCapabilities();
    if (!cap) return null;                 // el navegador no lo dice
    if (!cap.focusMode) return null;
    return cap.focusMode.includes('continuous') || cap.focusMode.includes('single-shot');
  } catch (_) { return null; }
}

// La cámara que la dueña encontró que SÍ lee. Se recuerda para no tener que
// buscarla de nuevo en cada venta.
const CAMARA_ELEGIDA = 'pinkpower_caja_camara';

function camaraRecordada() {
  try { return localStorage.getItem(CAMARA_ELEGIDA) || ''; } catch (_) { return ''; }
}

function recordarCamara(deviceId) {
  try {
    if (deviceId) localStorage.setItem(CAMARA_ELEGIDA, deviceId);
  } catch (_) {}
}

// Cartel fijo con la cámara que está puesta. Antes solo salía un aviso de paso,
// así que al tocar "cambiar" no se sabía si había cambiado algo.
function pintarCualCamara() {
  if (!camara || !camara.visor) return;
  let cartel = camara.visor.querySelector('.camara__cual');
  if (camara.camaras.length < 2) { if (cartel) cartel.remove(); return; }
  if (!cartel) {
    cartel = document.createElement('div');
    cartel.className = 'camara__cual';
    camara.visor.appendChild(cartel);
  }
  const nombre = (camara.camaras[camara.cual] || {}).label || '';
  cartel.textContent = `Cámara ${camara.cual + 1} de ${camara.camaras.length}`
    + (nombre ? ` · ${nombre.replace(/\s*\(.*\)\s*$/, '').slice(0, 26)}` : '')
    + (camara.enfoca === false ? ' · no enfoca' : '');
  cartel.classList.toggle('camara__cual--mala', camara.enfoca === false);
}

// Cambia de cámara sin cerrar la hoja: en un teléfono con gran angular, macro y
// principal, la que entrega el navegador puede ser una de enfoque fijo, que
// nunca va a enfocar un código de cerca. Va probando las que hay hasta dar con
// una DISTINTA de la puesta: hay teléfonos que entregan la misma por más que se
// les pida otra, y entonces parecía que el botón no hacía nada.
async function cambiarDeCamara() {
  if (!camara || !camara.camaras || camara.camaras.length < 2) return;
  const sesion = camara.sesion;
  const puesta = (() => {
    try { return camara.stream.getVideoTracks()[0].getSettings().deviceId || ''; }
    catch (_) { return ''; }
  })();

  for (let salto = 1; salto <= camara.camaras.length; salto++) {
    const i = (camara.cual + salto) % camara.camaras.length;
    const elegida = camara.camaras[i];
    if (!elegida || !elegida.deviceId || elegida.deviceId === puesta) continue;
    let nuevo;
    try {
      nuevo = await navigator.mediaDevices.getUserMedia({
        video: pedidoDeVideo(elegida.deviceId), audio: false });
    } catch (_) { continue; }                       // esa no se deja: la siguiente
    if (!camara || camara.sesion !== sesion) {      // la cerraron mientras tanto
      try { nuevo.getTracks().forEach((t) => t.stop()); } catch (_) {}
      return;
    }
    let dio = '';
    try { dio = nuevo.getVideoTracks()[0].getSettings().deviceId || ''; } catch (_) {}
    if (dio && puesta && dio === puesta) {          // dio la misma: no sirve
      try { nuevo.getTracks().forEach((t) => t.stop()); } catch (_) {}
      continue;
    }
    try { camara.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    camara.stream = nuevo;
    camara.cual = i;
    camara.video.srcObject = nuevo;
    await camara.video.play().catch(() => {});
    camara.escenaCambio = true;    // otra cámara, otra imagen: se empieza limpio
    camara.enfoca = sabeEnfocar(nuevo.getVideoTracks()[0]);
    recordarCamara(elegida.deviceId);
    pintarCualCamara();
    flash(`Cámara ${camara.cual + 1} de ${camara.camaras.length}`
          + (camara.enfoca === false ? ' · esta no enfoca' : ''), 'ok');
    return;
  }
  flash('Este teléfono no deja cambiar de cámara', 'mal');
}

async function abrirCamara() {
  if (camara) return;
  const caja = document.createElement('div');
  caja.className = 'camara';
  caja.innerHTML = `
    <div class="camara__hoja">
      <div class="camara__venta" id="camara-venta"></div>
      <div class="camara__visor">
        <video class="camara__video" playsinline muted></video>
        <div class="camara__marco"><span></span><span></span><span></span><span></span></div>
        <p class="camara__ayuda">Apuntá al código · si se ve borroso, alejá un poco</p>
      </div>
      <div class="camara__marcador" id="camara-marcador"></div>
      <button class="btn btn--ancho camara__cerrar" type="button">Listo</button>
    </div>`;
  document.body.appendChild(caja);
  const video = caja.querySelector('video');
  const visor = caja.querySelector('.camara__visor');
  const porTecla = (e) => { if (e.key === 'Escape') cerrarCamara(); };
  document.addEventListener('keydown', porTecla);
  caja.querySelector('.camara__cerrar').addEventListener('click', cerrarCamara);

  // Se registra YA, antes de los pasos lentos: si no, durante el arranque
  // "Listo" no cerraba nada y tocar dos veces el botón abría dos cámaras.
  const sesion = ++sesionCamara;
  camara = { sesion, stream: null, video, caja, visor, timer: null, ojo: null, porTecla,
             leidos: new Map(),            // código -> cuándo entró
             candidato: '', candidatoN: 0, // confirmación de los desconocidos
             escenaRef: null, escenaCambio: true,
             paso: 0, vueltas: 0, ms: 0, ultimaCruda: '', motor: '…',
             camaras: [], cual: 0, enfoca: null };
  // Se empieza en limpio, y si había un aviso puesto hay que repintar: si no,
  // el cartel viejo se queda en la pantalla de atrás con un código que el
  // estado ya no tiene, y su botón de reintentar sale a buscar nada.
  if (estado.codigoSinHallar) { estado.codigoSinHallar = ''; pintar(); }
  ventaCamara();

  let stream;
  try {
    // Cámara trasera, la mayor resolución que dé y enfoque continuo: con los
    // ajustes por omisión la imagen salía borrosa y costaba leer el código.
    // resizeMode 'none' evita que el navegador recorte o re-escale para cumplir
    // la medida pedida: se quiere el fotograma tal cual sale del sensor.
    //
    // Si en este teléfono ya se eligió a mano una cámara que lee bien, se abre
    // esa directo: encontrarla cuesta y no se puede pedir que la busque en cada
    // venta. Si ya no existe, se cae a la de siempre.
    const recordada = camaraRecordada();
    try {
      stream = recordada
        ? await navigator.mediaDevices.getUserMedia({
            video: pedidoDeVideo(recordada), audio: false })
        : null;
    } catch (_) { stream = null; }
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: pedidoDeVideo(), audio: false });
    }
  } catch (err) {
    if (camara && camara.sesion === sesion) cerrarCamara();
    else { caja.remove(); document.removeEventListener('keydown', porTecla); }
    flash('No se pudo abrir la cámara. Revisá el permiso.', 'mal');
    return;
  }
  // La cerraron mientras se pedía el permiso: se apaga lo que llegó tarde.
  if (!camara || camara.sesion !== sesion) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    return;
  }
  camara.stream = stream;
  video.srcObject = stream;
  await video.play().catch(() => {});
  // Otra vez: arrancar el video también tarda, y si la cerraron en el medio todo
  // lo que sigue tocaría una cámara que ya no existe.
  if (!camara || camara.sesion !== sesion) return;

  // Tocar la imagen reenfoca, como en la cámara del teléfono. Es lo que saca de
  // apuros cuando el código quedó borroso y la cámara no se da cuenta sola.
  if (visor) {
    visor.addEventListener('click', async () => {
      const pista = stream.getVideoTracks()[0];
      if (!pista) return;
      visor.classList.add('is-enfocando');
      setTimeout(() => visor.classList.remove('is-enfocando'), 600);
      try {
        // Sacarlo de continuo y devolverlo obliga a enfocar de nuevo.
        await pista.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
        await pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      } catch (_) { /* la camara no deja tocar el enfoque: no pasa nada */ }
    });
  }

  // Con el permiso ya dado se puede ver qué cámaras hay. Si el navegador nos dio
  // una que no es la principal (pasa en los teléfonos con varias de atrás), se
  // cambia a la primera de la lista, que es la que el sistema pone primero.
  camara.camaras = await camarasDeAtras();
  camara.cual = 0;
  if (!camara || camara.sesion !== sesion) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    return;
  }
  try {
    const actual = stream.getVideoTracks()[0].getSettings().deviceId;
    const donde = camara.camaras.findIndex((c) => c.deviceId === actual);
    if (donde >= 0) camara.cual = donde;
    camara.enfoca = sabeEnfocar(stream.getVideoTracks()[0]);

    // Si la que nos dieron NO sabe enfocar, se prueban las otras hasta dar con
    // una que sí. Es lo que decide de verdad: una cámara de enfoque fijo no lee
    // un código de cerca ni con el mejor lector. Pero si la cajera ya eligió una
    // a mano, manda la suya: ella vio cuál lee.
    if (camara.enfoca === false && !camaraRecordada()) {
      for (let i = 0; i < camara.camaras.length; i++) {
        const otra = camara.camaras[i];
        if (!otra.deviceId || i === camara.cual) continue;
        let probar;
        try {
          probar = await navigator.mediaDevices.getUserMedia({
            video: pedidoDeVideo(otra.deviceId), audio: false });
        } catch (_) { continue; }
        if (!camara || camara.sesion !== sesion) {
          try { probar.getTracks().forEach((t) => t.stop()); } catch (_) {}
          return;
        }
        const enfoca = sabeEnfocar(probar.getVideoTracks()[0]);
        if (enfoca !== false) {
          try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
          stream = probar;
          camara.stream = probar;
          camara.cual = i;
          camara.enfoca = enfoca;
          video.srcObject = probar;
          await video.play().catch(() => {});
          break;
        }
        try { probar.getTracks().forEach((t) => t.stop()); } catch (_) {}
      }
    }
  } catch (_) { /* si algo falla se sigue con la que ya estaba */ }
  if (!camara || camara.sesion !== sesion) return;

  // Botón para ir cambiando de cámara, si hay más de una atrás. Es la salida
  // cuando la que eligió el navegador no enfoca de cerca.
  if (camara.camaras.length > 1 && visor) {
    const btn = document.createElement('button');
    btn.className = 'camara__cambiar';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Cambiar de cámara');
    btn.innerHTML = svg('<path d="M3 8a2 2 0 0 1 2-2h2.2l1.2-2h6.8l1.2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>'
      + '<path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0"></path>', 1.8)
      + '<span>cambiar</span>';
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); cambiarDeCamara(); });
    visor.appendChild(btn);
  }
  pintarCualCamara();

  const pista = stream.getVideoTracks()[0];
  // Sin zoom automático: el de la cámara es digital y recorta píxeles de verdad,
  // así que ponerlo de entrada empeora la imagen para todos. Queda a mano, en
  // los botones de abajo, para cuando haga falta alejarse del producto.
  try {
    const s = pista.getSettings ? pista.getSettings() : {};
    if ((s.width || 0) < 1280) {   // el navegador dio poco: se insiste una vez
      await pista.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 } });
    }
  } catch (_) {}

  // Acercamiento a mano. Es la salida al problema de fondo: la camara no enfoca
  // de muy cerca, asi que hay que alejar el telefono; acercando con el zoom, el
  // codigo vuelve a llenar el cuadro sin salirse del rango de enfoque.
  try {
    const cap = pista.getCapabilities && pista.getCapabilities();
    if (cap && cap.zoom && cap.zoom.max > cap.zoom.min && visor) {
      let nivel = pista.getSettings().zoom || cap.zoom.min;
      const paso = Math.max((cap.zoom.max - cap.zoom.min) / 8, cap.zoom.step || 0.1);
      const mandos = document.createElement('div');
      mandos.className = 'camara__zoom';
      mandos.innerHTML = '<button type="button" data-zoom="+" aria-label="Acercar">+</button>'
        + '<button type="button" data-zoom="-" aria-label="Alejar">−</button>';
      mandos.addEventListener('click', async (ev) => {
        ev.stopPropagation();          // no vale como toque para reenfocar
        const b = ev.target.closest('[data-zoom]');
        if (!b) return;
        nivel = Math.min(cap.zoom.max, Math.max(cap.zoom.min,
          nivel + (b.dataset.zoom === '+' ? paso : -paso)));
        try { await pista.applyConstraints({ advanced: [{ zoom: nivel }] }); } catch (_) {}
      });
      visor.appendChild(mandos);
    }
  } catch (_) {}

  // Linterna: en la tienda el producto suele quedar a contraluz o en sombra.
  try {
    const puede = pista.getCapabilities && pista.getCapabilities();
    if (puede && puede.torch) {
      const btn = document.createElement('button');
      btn.className = 'camara__luz';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Encender la luz');
      btn.innerHTML = svg('<path d="M9 18h6"></path><path d="M10 22h4"></path>'
        + '<path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"></path>', 1.8);
      let encendida = false;
      btn.addEventListener('click', async () => {
        encendida = !encendida;
        try {
          await pista.applyConstraints({ advanced: [{ torch: encendida }] });
          btn.classList.toggle('is-on', encendida);
        } catch (_) {}
      });
      caja.appendChild(btn);
    }
  } catch (_) {}
  // Vigila si la escena cambió desde el último producto que entró: es lo que
  // distingue "lo volvió a pasar" de "lo dejó delante de la cámara".
  camara.ojo = setInterval(() => {
    if (!camara || camara.escenaCambio) return;
    if (cambioLaEscena(firmaEscena(camara.video), camara.escenaRef)) {
      camara.escenaCambio = true;
    }
  }, 200);

  const motor = await armarMotor(video);
  if (!camara || camara.sesion !== sesion) return;   // la cerraron mientras tanto
  if (!motor) {
    cerrarCamara();
    flash('Este navegador no puede escanear con la cámara', 'mal');
    return;
  }
  camara.motor = motor.nombre;
  if (MODO_PRUEBA) panelDiagnostico();
  cicloEscaneo(motor, sesion);
}

// ── El ciclo de lectura ───────────────────────────────────────────────────────
// Encadenado, no por intervalo: la vuelta siguiente arranca cuando terminó la
// anterior. Con un intervalo fijo, en el teléfono se encimaban las llamadas
// (analizar un fotograma tarda más que el intervalo) y el escaneo se arrastraba.
async function cicloEscaneo(motor, sesion) {
  // Se corta si esta cámara ya no es la de ahora: al cerrar y volver a abrir, el
  // ciclo viejo seguía analizando en paralelo con el nuevo.
  if (!camara || camara.sesion !== sesion) return;
  const arranque = (window.performance || Date).now();
  try {
    const v = camara.video;
    if (v.readyState >= 2 && v.videoWidth) {
      const codigo = await motor.leer(v, camara.paso);
      camara.paso = (camara.paso + 1) % 3;
      camara.vueltas += 1;
      camara.ms = Math.round((window.performance || Date).now() - arranque);
      if (codigo) { camara.ultimaCruda = codigo; alLeer(codigo); }
    }
  } catch (_) { /* un fotograma que no se pudo leer no rompe el ciclo */ }
  if (!camara || camara.sesion !== sesion) return;
  camara.timer = setTimeout(() => cicloEscaneo(motor, sesion), 60);
}

// Cada vuelta mira UNA zona, rotando: el fotograma entero, la franja que se ve
// en el visor, y un recorte cerrado del centro con contraste (el que rescata los
// códigos chicos y los impresos sobre plástico brillante). Así cada vuelta es
// corta y entre tres se cubre todo.
const CONTRASTE = 'grayscale(1) contrast(2.2) brightness(1.1)';

async function armarMotor(video) {
  // 1) El lector del navegador, que va por hardware y es el bueno.
  if ('BarcodeDetector' in window) {
    try {
      let formatos = FORMATOS_CODIGO;
      if (window.BarcodeDetector.getSupportedFormats) {
        // Solo los que dice soportar: pidiéndole uno que no tiene, fallaba el
        // lector entero y se caía al de software, mucho más lento.
        const soportados = await window.BarcodeDetector.getSupportedFormats();
        formatos = FORMATOS_CODIGO.filter((f) => soportados.includes(f));
      }
      if (formatos.length) {
        const detector = new window.BarcodeDetector({ formats: formatos });
        const lienzo = document.createElement('canvas');
        await detector.detect(video);      // una prueba: si no sirve, tira acá
        return {
          nombre: 'navegador',
          leer: async (v, paso) => {
            if (paso === 0) {
              const r = await detector.detect(v);
              return r && r.length ? r[0].rawValue : '';
            }
            const zona = zonaVisible(v, camara.visor);
            if (!recorte(v, lienzo, paso === 1 ? zona : zonaCerca(zona),
                         paso === 1 ? null : CONTRASTE)) return '';
            const r = await detector.detect(lienzo);
            return r && r.length ? r[0].rawValue : '';
          },
        };
      }
    } catch (_) { /* sin lector propio: se usa el de software */ }
  }

  // 2) El de software, para los navegadores que no traen lector.
  try {
    await cargarZxing();
    const lector = new window.ZXing.BrowserMultiFormatReader();
    if (camara) camara.lector = lector;
    const lienzo = document.createElement('canvas');
    const leerDe = (cv) => {
      const fuente = new window.ZXing.HTMLCanvasElementLuminanceSource(cv);
      const mapa = new window.ZXing.BinaryBitmap(new window.ZXing.HybridBinarizer(fuente));
      const r = lector.decodeBitmap(mapa);
      return r ? r.getText() : '';
    };
    return {
      nombre: 'software',
      leer: async (v, paso) => {
        // El fotograma entero son casi cuatro millones de píxeles: en el
        // teléfono eso es carísimo, así que se achica antes de analizarlo.
        const zona = paso === 0 ? { w: 1, h: 1 }
                   : paso === 1 ? zonaVisible(v, camara.visor)
                   : zonaCerca(zonaVisible(v, camara.visor));
        if (!recorte(v, lienzo, zona, paso === 2 ? CONTRASTE : null, 1280)) return '';
        try { return leerDe(lienzo); } catch (_) { return ''; }
      },
    };
  } catch (_) {
    return null;
  }
}

// ── Qué se acepta y qué no ────────────────────────────────────────────────────
function alLeer(texto) {
  const codigo = String(texto || '').trim();
  if (!codigo || !camara) return;
  const ahora = Date.now();

  // Un código que ESTÁ en el catálogo entra con una sola lectura. Que una
  // lectura errada caiga justo sobre uno de los mil quinientos códigos de la
  // tienda es practicamente imposible, y exigir dos dejaba afuera los códigos
  // difíciles —que son los que se leen una vez cada tantos intentos— o sea
  // justo los que hay que rescatar.
  // Uno DESCONOCIDO pide dos lecturas iguales, sin apuro de tiempo: ahí sí lo
  // más probable es que sea una lectura errada (así se coló un 663350092868 que
  // no existe, mientras el frasco decía 663350092738).
  if (!estado.porBarcode.has(codigo)) {
    if (camara.candidato !== codigo) {
      camara.candidato = codigo;
      camara.candidatoN = 1;
      return;
    }
    camara.candidatoN += 1;
    if (camara.candidatoN < 2) return;
  }

  // Volver a pasar el mismo producto suma otra unidad, que es lo natural en el
  // mostrador. Pero uno quieto delante de la cámara se lee muchas veces por
  // segundo: para no cobrar de más, solo vuelve a contar cuando la imagen
  // cambió, o sea cuando el producto de verdad se movió.
  const visto = camara.leidos.get(codigo);
  if (visto !== undefined && (ahora - visto < 1200 || !camara.escenaCambio)) {
    const marcador = document.getElementById('camara-marcador');
    if (marcador && marcador.dataset.codigo !== codigo) fichaCamara(codigo);
    return;
  }

  camara.leidos.set(codigo, ahora);
  camara.candidato = '';
  camara.candidatoN = 0;
  camara.escenaRef = firmaEscena(camara.video);
  camara.escenaCambio = false;
  if (navigator.vibrate) navigator.vibrate(40);

  const antes = estado.venta.reduce((n, l) => n + l.cantidad, 0);
  procesarEscaneo(codigo);
  const entro = estado.venta.reduce((n, l) => n + l.cantidad, 0) > antes;
  if (entro) fichaCamara(codigo);
  else fichaCamara(codigo, 'Ese código no está en el catálogo');
  ventaCamara();
}

// ── Diagnóstico (solo en modo prueba) ─────────────────────────────────────────
// Con una foto de esta pantalla se sabe qué lector usó el teléfono, qué
// resolución dio y si está leyendo algo, en vez de andar adivinando.
function panelDiagnostico() {
  const caja = document.createElement('div');
  caja.className = 'camara__diag';
  camara.visor.appendChild(caja);
  const sesion = camara.sesion;
  let antes = 0, cuando = Date.now();
  const refresco = setInterval(() => {
    // Se apaga con SU cámara: mirando solo si hay cámara, tras cerrar y volver a
    // abrir seguía corriendo el de la anterior.
    if (!camara || camara.sesion !== sesion) { clearInterval(refresco); return; }
    const t = Date.now();
    const vps = Math.round((camara.vueltas - antes) * 1000 / Math.max(1, t - cuando));
    antes = camara.vueltas; cuando = t;
    const v = camara.video;
    const cam = (camara.camaras || [])[camara.cual];
    const nombre = cam && cam.label ? cam.label.slice(0, 24) : 'la que dio el navegador';
    const foco = camara.enfoca === true ? 'enfoca'
               : camara.enfoca === false ? 'SIN ENFOQUE' : 'foco: no lo dice';
    caja.innerHTML = `lector: ${esc(camara.motor)} · ${v.videoWidth}×${v.videoHeight}<br>`
      + `cámara ${camara.cual + 1}/${(camara.camaras || []).length || 1}: ${esc(nombre)}<br>`
      + `${esc(foco)} · ${vps}/s · ${camara.ms} ms<br>`
      + `leído: ${esc(camara.ultimaCruda || '—')}`;
  }, 700);
}

// ── Arranque ─────────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') guardarVenta();
});

// El alto real de la barra de arriba y de la cinta de prueba. Escritos a mano en
// el CSS se desincronizan en cuanto se agrega un boton, y la pantalla deja de
// cuadrar por unos pixeles: aparece scroll donde no deberia haberlo.
function medirBarras() {
  const raiz = document.documentElement;
  const top = document.querySelector('.top');
  const cinta = document.querySelector('.cinta-prueba');
  if (top) raiz.style.setProperty('--alto-top',
    Math.ceil(top.getBoundingClientRect().height) + 'px');
  const alto = (cinta && cinta.offsetParent !== null)
    ? Math.ceil(cinta.getBoundingClientRect().height) : 0;
  raiz.style.setProperty('--alto-cinta', alto + 'px');
}

function arrancar() {
  mostrarCaja();
  const recuperada = recuperarVenta();
  if (MODO_PRUEBA) document.body.classList.add('es-prueba');
  pintar();
  medirBarras();
  window.addEventListener('resize', medirBarras);
  cargarCatalogo();
  cargarRecientes();
  detectarCamara();
  // Tres minutos: el servidor rearma su copia cada dos, así que un código nuevo
  // llega en unos cinco minutos como mucho, sin tocar nada.
  setInterval(repasarCatalogo, 180000);
  if (recuperada) {
    setTimeout(() => flash('Retomamos la venta que tenías a medias', 'ok'), 800);
  }
}

if (token) arrancar(); else mostrarLogin();
