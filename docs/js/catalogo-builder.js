// ── Constructor de catálogos para revendedoras ────────────
// Página aparte (paso a paso): elegir productos → precios → diseño → generar.
// Requiere sesión de mayoreo (token en localStorage). Marca blanca: el link
// final no muestra nada de PinkPower.
import { fetchMayoreoProducts, fetchCollections, crearCatalogo, editarCatalogo, listarCatalogos, eliminarCatalogo, guardarLogoMayorista } from './api.js';

const TOKEN_KEY = 'pinkpower_mayoreo_token';
const DRAFT_KEY = 'pinkpower_catalogo_draft';

// Dominio neutro (marca blanca) donde se sirven los catálogos públicos. Los links
// que comparte la mayorista salen con este dominio, sin rastro de PinkPower.
const CATALOGO_BASE = 'https://tucatalogo.shop';

const PASOS = ['productos', 'precios', 'diseno', 'generar'];

// Paletas de color listas (un toque y queda bonito).
const PALETAS = [
  { nombre: 'Rosa',     fondo: '#fff0f5', texto: '#3a0a1e', acento: '#e8437a' },
  { nombre: 'Pastel',   fondo: '#f5f7ff', texto: '#2a2a4a', acento: '#8a7bd8' },
  { nombre: 'Durazno',  fondo: '#fff4ec', texto: '#5a2a18', acento: '#f0814f' },
  { nombre: 'Menta',    fondo: '#eefaf3', texto: '#143a2a', acento: '#1faa6b' },
  { nombre: 'Elegante', fondo: '#faf7f2', texto: '#2a2218', acento: '#b89150' },
  { nombre: 'Oscuro',   fondo: '#1f1d24', texto: '#f3eef7', acento: '#e8437a' },
];

const state = {
  token: null,
  productos: [],          // catálogo de mayoreo (normalizado)
  colecciones: [],        // [{handle, title}]
  filtroColeccion: '',    // handle activo | ''
  busqueda: '',
  sel: new Map(),         // id -> { id, nombre, imagen, precio, coleccion }
  diseno: {
    titulo: '', subtitulo: '',
    colorFondo: '#fff0f5', colorTexto: '#3a0a1e', colorAcento: '#e8437a',
    logo: '', whatsapp: '', columnas: 4, separarPorColeccion: true,
  },
  paso: 'productos',
  diasConfig: null,       // días que configuró la admin
  telefonoCuenta: '',     // teléfono registrado de la mayorista (para precargar el WhatsApp)
  logoCuenta: '',         // logo guardado de la mayorista (para precargar en cada catálogo)
  editando: null,         // token del catálogo en edición | null = creando nuevo
};

// ── Borrador (no perder el trabajo si recarga) ────────────
function guardarBorrador() {
  if (state.editando) return;   // al editar no pisamos el borrador de "crear"
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      items: [...state.sel.values()],
      diseno: state.diseno,
      paso: state.paso,
    }));
  } catch (_) { /* almacenamiento lleno o privado: seguimos sin guardar */ }
}

function cargarBorrador() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.items) || !d.items.length) return false;
    state.sel = new Map(d.items.map(it => [it.id, it]));
    if (d.diseno) state.diseno = { ...state.diseno, ...d.diseno };
    state.paso = PASOS.includes(d.paso) ? d.paso : 'productos';
    return true;
  } catch (_) { return false; }
}

function limpiarBorrador() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
}

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function imgDe(p) { return (p.images && p.images[0] && p.images[0].url) || ''; }

// Colección principal del producto (la primera que sea de mayoreo). Sirve para
// agrupar el catálogo por colección.
function colDeProducto(p) {
  const handles = p.collectionHandles || [];
  for (const c of state.colecciones) if (handles.includes(c.handle)) return c.title;
  return '';
}

// Placeholder lindo para productos sin foto (en vez de un emoji suelto).
const NOIMG = `<div class="cb-noimg">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
  <span>Sin foto</span></div>`;

// ── Skeletons ─────────────────────────────────────────────
function skProductos() {
  const cards = Array.from({ length: 10 }).map(() => `
    <div class="sk-pcard"><div class="sk sk-pcard__img"></div>
      <div class="sk sk-line" style="width:80%"></div>
      <div class="sk sk-line" style="width:55%"></div></div>`).join('');
  return `
    <div class="cb-chips" style="margin-bottom:1rem">
      <span class="sk sk-chip"></span><span class="sk sk-chip"></span>
    </div>
    <div class="cb-grid">${cards}</div>`;
}

function skLista() {
  return Array.from({ length: 4 }).map(() => `<div class="sk sk-row"></div>`).join('');
}

// ── Init ──────────────────────────────────────────────────
export async function initBuilder() {
  state.token = localStorage.getItem(TOKEN_KEY);
  const root = $('#cb-root');
  if (!state.token) {
    root.innerHTML = `<div class="cb-empty">
      <div class="cb-empty__icon">🔒</div>
      <h2>Necesitás iniciar sesión de mayoreo</h2>
      <p>Volvé a la tienda y entrá con tu usuario de mayorista.</p>
      <a class="cb-btn cb-btn--primary" href="/">Ir a la tienda</a>
    </div>`;
    return;
  }
  root.innerHTML = `
    <header class="cb-head">
      <a class="cb-back" href="/" title="Volver a la tienda">←</a>
      <h1>Crear catálogo</h1>
    </header>
    <div class="cb-body">${skProductos()}</div>`;
  try {
    const [prods, cols, lista] = await Promise.all([
      fetchMayoreoProducts(state.token),
      fetchCollections(),
      listarCatalogos(state.token).catch(() => ({ dias: null, catalogos: [] })),
    ]);
    // La admin puede tener los catálogos deshabilitados: no mostramos el módulo.
    if (lista.habilitado === false) {
      root.innerHTML = `<div class="cb-empty">
        <div class="cb-empty__icon">🔒</div>
        <h2>Catálogos no disponibles</h2>
        <p>Esta función está deshabilitada por el momento.</p>
        <a class="cb-btn cb-btn--primary" href="/">Volver a la tienda</a>
      </div>`;
      return;
    }
    // Solo productos con existencia: no tiene sentido armar un catálogo con
    // productos agotados (availableForSale ya contempla el inventario no
    // rastreado como disponible). Esto es solo para el armado del catálogo.
    state.productos = prods.filter(p => p.availableForSale);
    // Texto buscable precomputado (una vez): nombre + marca (productType) +
    // tipo (tags) + descripción, todo sin tildes. Así el buscador filtra por
    // cualquiera de esos campos, no solo por el nombre.
    state.productos.forEach(p => { p._buscable = textoBuscable(p); });
    state.diasConfig = lista.dias;
    // Teléfono registrado de la mayorista: se usa para precargar el WhatsApp del
    // catálogo (así el botón de "Hacer pedido" sale siempre con su número).
    state.telefonoCuenta = (lista.telefono || '').toString().trim();
    // Logo guardado de la mayorista: se precarga en cada catálogo nuevo.
    state.logoCuenta = lista.logo || '';
    // Solo colecciones que tienen al menos un producto de mayoreo.
    const conProd = new Set();
    prods.forEach(p => (p.collectionHandles || []).forEach(h => conProd.add(h)));
    state.colecciones = cols.filter(c => conProd.has(c.handle));
    // Si venimos de un pedido ("crear catálogo con estos productos"), arrancamos
    // directo un catálogo nuevo con esos productos ya seleccionados.
    const desdePedido = localStorage.getItem('pinkpower_catalogo_desde_pedido');
    if (desdePedido) {
      localStorage.removeItem('pinkpower_catalogo_desde_pedido');
      try {
        const prods = JSON.parse(desdePedido);
        if (Array.isArray(prods) && prods.length) { iniciarCatalogoDesdePedido(prods); return; }
      } catch (_) { /* dato inválido: seguimos al flujo normal */ }
    }
    // "Mis catálogos" (la lista) es SIEMPRE la pantalla de entrada. El asistente
    // de creación se abre solo al tocar "Crear catálogo nuevo".
    mostrarLista();
  } catch (e) {
    root.innerHTML = `<div class="cb-empty"><div class="cb-empty__icon">😕</div>
      <h2>No se pudo cargar</h2><p>Revisá tu conexión e intentá de nuevo.</p>
      <a class="cb-btn" href="/mi-catalogo/">Reintentar</a></div>`;
  }
}

// ── Shell (cabecera + pasos) ──────────────────────────────
const ICON_BACK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

function renderShell() {
  $('#cb-root').innerHTML = `
    <header class="cb-head cb-head--wizard">
      <button class="cb-back" id="cb-back" title="Volver a Mis catálogos" aria-label="Volver a Mis catálogos">${ICON_BACK}</button>
      <nav class="cb-steps" id="cb-steps"></nav>
    </header>
    <main class="cb-body" id="cb-body"></main>
    <footer class="cb-foot" id="cb-foot"></footer>`;
  $('#cb-back').addEventListener('click', () => mostrarLista());
}

function actualizarTituloHead() {
  const h = $('#cb-titulo-head');
  if (h) h.textContent = state.editando ? 'Editar catálogo' : 'Crear catálogo';
}

function renderSteps() {
  const labels = { productos: 'Productos', precios: 'Precios', diseno: 'Diseño', generar: 'Generar' };
  const idx = PASOS.indexOf(state.paso);
  $('#cb-steps').innerHTML = PASOS.map((p, i) => `
    <button class="cb-step ${i === idx ? 'is-active' : ''} ${i < idx ? 'is-done' : ''}"
            data-paso="${p}" ${i > idx && !puedeAvanzarHasta(p) ? 'disabled' : ''}>
      <span class="cb-step__n">${i < idx ? '✓' : i + 1}</span>${labels[p]}
    </button>`).join('');
  $('#cb-steps').querySelectorAll('.cb-step').forEach(b =>
    b.addEventListener('click', () => irA(b.dataset.paso)));
}

function puedeAvanzarHasta(paso) {
  const i = PASOS.indexOf(paso);
  // Para pasar de "productos" hay que tener al menos 1 seleccionado.
  if (i >= 1 && state.sel.size === 0) return false;
  // Para llegar a "generar" hace falta un título y un WhatsApp (para que la
  // clienta pueda hacerle el pedido a la mayorista).
  if (paso === 'generar' && !state.diseno.titulo.trim()) return false;
  if (paso === 'generar' && !(state.diseno.whatsapp || '').trim()) return false;
  return true;
}

function irA(paso) {
  if (!puedeAvanzarHasta(paso)) return;
  state.paso = paso;
  render();
}

function render() {
  actualizarTituloHead();
  renderSteps();
  if (state.paso === 'productos') renderProductos();
  else if (state.paso === 'precios') renderPrecios();
  else if (state.paso === 'diseno') renderDiseno();
  else if (state.paso === 'generar') renderGenerar();
}

// ── Paso 1: Productos ─────────────────────────────────────
// Normaliza para buscar: minúsculas y SIN tildes/ñ→n, para que "bano" encuentre
// "Baño", "locion" encuentre "Loción", etc. (los nombres traen muchas tildes y
// en el teléfono se suele escribir sin ellas).
function normalizarBusqueda(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Texto donde busca el filtro: nombre + marca (productType) + tipo (tags) +
// descripción, todo normalizado (sin tildes).
function textoBuscable(p) {
  return normalizarBusqueda([
    p.title,
    p.productType,
    (p.tags || []).join(' '),
    p.description,
  ].filter(Boolean).join(' '));
}

function productosFiltrados() {
  // Cada palabra escrita debe aparecer en el texto buscable (en cualquier orden),
  // así "bbw gel" o "vanilla jabon" encuentran el producto por marca/tipo/nombre.
  const terminos = normalizarBusqueda(state.busqueda).trim().split(/\s+/).filter(Boolean);
  return state.productos.filter(p => {
    if (state.filtroColeccion && !(p.collectionHandles || []).includes(state.filtroColeccion)) return false;
    if (terminos.length) {
      const txt = p._buscable != null ? p._buscable : textoBuscable(p);
      if (!terminos.every(t => txt.includes(t))) return false;
    }
    return true;
  });
}

function productosDeColeccion(handle) {
  return state.productos.filter(p => (p.collectionHandles || []).includes(handle));
}

// Tarjeta de un producto en la grilla de selección.
function pcardHTML(p) {
  const on = state.sel.has(p.id);
  const img = imgDe(p);
  return `<button class="cb-pcard ${on ? 'is-on' : ''}" data-id="${esc(p.id)}">
    <div class="cb-pcard__img">${img ? `<img src="${esc(img)}" alt="" loading="lazy"/>` : NOIMG}
      <span class="cb-pcard__check">✓</span></div>
    <span class="cb-pcard__name">${esc(p.title)}</span>
  </button>`;
}

// Vuelve a enganchar el click de cada tarjeta (agregar/quitar del catálogo).
function wireGridCards() {
  $('#cb-body').querySelectorAll('.cb-pcard').forEach(b =>
    b.addEventListener('click', () => { toggleProducto(b.dataset.id); guardarBorrador(); renderProductos(); }));
}

// Actualiza SOLO la grilla y el contador de "visibles" sin re-renderizar todo el
// paso. Clave para que el buscador no pierda el foco al escribir (antes se
// re-creaba el input en cada tecla y no dejaba seguir escribiendo).
function actualizarGrilla() {
  const grid = $('#cb-grid');
  if (!grid) return;
  const lista = productosFiltrados();
  grid.innerHTML = lista.map(pcardHTML).join('') || '<p class="cb-hint">No hay productos con ese filtro.</p>';
  wireGridCards();
  const addBtn = $('#cb-add-todos');
  if (addBtn) addBtn.textContent = `Agregar los ${lista.length} visibles`;
}

let _busqTimer = null;

function renderProductos() {
  const lista = productosFiltrados();
  const chips = state.colecciones.map(c => {
    const total = productosDeColeccion(c.handle).length;
    const todos = total > 0 && productosDeColeccion(c.handle).every(p => state.sel.has(p.id));
    return `<button class="cb-chip ${todos ? 'is-on' : ''}" data-col="${esc(c.handle)}">
      ${esc(c.title)} <span class="cb-chip__n">${total}</span></button>`;
  }).join('');

  $('#cb-body').innerHTML = `
    ${state.colecciones.length ? `
    <div class="cb-cols">
      <p class="cb-cols__label">Tocá una colección para verla y agregarla completa:</p>
      <div class="cb-chips">${chips}</div>
      <p class="cb-hint" style="margin:.5rem 0 0">Un mismo producto puede estar en varias colecciones, por eso los números de las colecciones pueden sumar más que el total.</p>
    </div>` : ''}
    <div class="cb-tools">
      <div class="cb-search">
        <input id="cb-buscar" class="cb-input" type="search" autocomplete="off" placeholder="Buscar por nombre, marca o tipo…" value="${esc(state.busqueda)}" />
        <button type="button" class="cb-search__x" id="cb-buscar-x" aria-label="Limpiar búsqueda"${state.busqueda ? '' : ' hidden'}>✕</button>
      </div>
      <div class="cb-select" id="cb-coleccion"></div>
      <button class="cb-btn cb-btn--ghost" id="cb-add-todos">Agregar los ${lista.length} visibles</button>
    </div>
    <p class="cb-hint">
      ${state.sel.size} seleccionado${state.sel.size === 1 ? '' : 's'}. Tocá un producto para agregarlo o quitarlo.
      ${state.sel.size ? '<button class="cb-link-btn" id="cb-quitar-todos">Quitar todos</button>' : ''}
    </p>
    <div class="cb-grid" id="cb-grid">
      ${lista.map(pcardHTML).join('') || '<p class="cb-hint">No hay productos con ese filtro.</p>'}
    </div>`;

  // Buscar: actualiza solo la grilla (con un pequeño retraso) para no re-crear el
  // input en cada tecla; así se puede escribir la palabra completa sin perder el
  // foco ni el cursor.
  const buscarInp = $('#cb-buscar');
  const buscarX = $('#cb-buscar-x');
  buscarInp.addEventListener('input', (e) => {
    state.busqueda = e.target.value;
    if (buscarX) buscarX.hidden = !e.target.value;
    clearTimeout(_busqTimer);
    _busqTimer = setTimeout(actualizarGrilla, 200);
  });
  // La "x" limpia el filtro y vuelve a enfocar para seguir escribiendo.
  if (buscarX) buscarX.addEventListener('click', () => {
    state.busqueda = '';
    buscarInp.value = '';
    buscarX.hidden = true;
    buscarInp.focus();
    actualizarGrilla();
  });
  montarSelectColeccion();
  $('#cb-add-todos').addEventListener('click', () => {
    productosFiltrados().forEach(p => addProducto(p));
    guardarBorrador(); renderProductos();
  });
  const quitar = $('#cb-quitar-todos');
  if (quitar) quitar.addEventListener('click', () => { state.sel.clear(); guardarBorrador(); renderProductos(); });
  // Chips de colección: filtran la grilla a esa colección Y marcan/desmarcan
  // todos sus productos. Así al tocar una colección SOLO quedan visibles (y con
  // el check) los que son de ella, sin mezclarse con los de otras colecciones.
  $('#cb-body').querySelectorAll('.cb-chip').forEach(b =>
    b.addEventListener('click', () => {
      state.filtroColeccion = b.dataset.col;
      toggleColeccion(b.dataset.col);
      guardarBorrador(); renderProductos();
    }));
  wireGridCards();

  setFoot(`${state.sel.size} producto${state.sel.size === 1 ? '' : 's'}`,
          state.sel.size ? 'Siguiente →' : '', () => irA('precios'));
}

function toggleColeccion(handle) {
  const prods = productosDeColeccion(handle);
  const todos = prods.length && prods.every(p => state.sel.has(p.id));
  if (todos) prods.forEach(p => state.sel.delete(p.id));   // ya estaban todos: los quita
  else prods.forEach(p => addProducto(p));                 // si no: los agrega
}

// Select custom (dropdown lindo) para filtrar por colección.
function montarSelectColeccion() {
  const host = $('#cb-coleccion');
  if (!host) return;
  const opciones = [{ handle: '', title: 'Todas las colecciones', n: state.productos.length },
    ...state.colecciones.map(c => ({ handle: c.handle, title: c.title, n: productosDeColeccion(c.handle).length }))];
  const actual = opciones.find(o => o.handle === state.filtroColeccion) || opciones[0];

  host.innerHTML = `
    <button type="button" class="cb-select__btn" id="cb-sel-btn" aria-haspopup="listbox" aria-expanded="false">
      <span class="cb-select__cur">${esc(actual.title)}</span>
      <svg class="cb-select__chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </button>`;

  const btn = $('#cb-sel-btn');
  const abrir = () => {
    if (host.querySelector('.cb-select__panel')) return cerrar();
    const panel = document.createElement('div');
    panel.className = 'cb-select__panel';
    panel.setAttribute('role', 'listbox');
    panel.innerHTML = opciones.map(o => `
      <button type="button" class="cb-select__opt ${o.handle === state.filtroColeccion ? 'is-sel' : ''}" data-h="${esc(o.handle)}">
        <span>${esc(o.title)}</span><span class="cb-select__n">${o.n}</span>
      </button>`).join('');
    host.appendChild(panel);
    host.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    panel.querySelectorAll('.cb-select__opt').forEach(b =>
      b.addEventListener('click', () => { state.filtroColeccion = b.dataset.h; renderProductos(); }));
    setTimeout(() => document.addEventListener('click', fuera), 0);
  };
  const cerrar = () => {
    const panel = host.querySelector('.cb-select__panel');
    if (panel) panel.remove();
    host.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', fuera);
  };
  const fuera = (e) => { if (!host.contains(e.target)) cerrar(); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); abrir(); });
}

function addProducto(p) {
  if (state.sel.has(p.id)) return;
  // Guardamos también el precio de mayoreo (lo que paga la mayorista) y el de
  // detalle (referencia de tienda) para mostrarlos y calcular la ganancia.
  state.sel.set(p.id, { id: p.id, nombre: p.title, imagen: imgDe(p), precio: '',
    coleccion: colDeProducto(p), mayoreo: p.price, detalle: p.retailPrice });
}
function toggleProducto(id) {
  if (state.sel.has(id)) { state.sel.delete(id); return; }
  const p = state.productos.find(x => x.id === id);
  if (p) addProducto(p);
}

// ── Paso 2: Precios ───────────────────────────────────────
// Precio de mayoreo / detalle del item (lo guardado al agregar; si se editó un
// catálogo viejo, se busca en la lista actual de productos).
function mayoreoDeItem(it) {
  if (it.mayoreo != null) return it.mayoreo;
  const p = state.productos.find(x => x.id === it.id);
  return p ? p.price : null;
}
function detalleDeItem(it) {
  if (it.detalle != null) return it.detalle;
  const p = state.productos.find(x => x.id === it.id);
  return p ? p.retailPrice : null;
}
function parsePrecio(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}
const moneyC = n => 'L.' + Math.round(Number(n));   // compacto, sin decimales

// Texto y estilo de la ganancia según el precio de venta que puso la mayorista.
function gananciaInfo(mayoreo, ventaStr) {
  const may = parsePrecio(mayoreo);
  const venta = parsePrecio(ventaStr);
  if (may == null || venta == null) return { txt: '', cls: '' };
  const g = venta - may;
  const pct = may > 0 ? Math.round(g / may * 100) : 0;
  if (g < 0) return { txt: `Pierde ${moneyC(-g)}`, cls: 'is-loss' };
  return { txt: `Ganás ${moneyC(g)} · +${pct}%`, cls: '' };
}

// Agrupa los seleccionados por colección + precio de mayoreo (los que comparten
// ambos van juntos, para ponerles el precio de una sola vez).
function gruposDePrecios() {
  const map = new Map();  // gkey -> {gkey, col, mayoreo, items}
  for (const it of state.sel.values()) {
    const col = it.coleccion || 'Otros productos';
    const may = mayoreoDeItem(it);
    const gkey = col + '' + (may != null ? String(may) : 'sinprecio');
    if (!map.has(gkey)) map.set(gkey, { gkey, col, mayoreo: may, items: [] });
    map.get(gkey).items.push(it);
  }
  return [...map.values()].sort((a, b) =>
    a.col.localeCompare(b.col) || ((a.mayoreo || 0) - (b.mayoreo || 0)));
}
// Precio común del grupo: el precio si TODOS comparten el mismo; si no, "".
function precioComunDe(items) {
  const first = items[0] ? (items[0].precio || '') : '';
  return items.every(it => (it.precio || '') === first) ? first : '';
}

let _precioVista = 'grupo';   // 'grupo' | 'individual'

function renderPrecios() {
  $('#cb-body').innerHTML = `
    <div class="cb-ptoggle">
      <button type="button" class="cb-ptab ${_precioVista === 'grupo' ? 'is-on' : ''}" data-vista="grupo">Por grupo</button>
      <button type="button" class="cb-ptab ${_precioVista === 'individual' ? 'is-on' : ''}" data-vista="individual">Uno por uno</button>
    </div>
    <p class="cb-hint">${_precioVista === 'grupo'
      ? 'Ponele el precio a todo un grupo (misma colección y mismo precio de mayoreo) de una sola vez. Debajo ves tu ganancia.'
      : 'Ponele el precio a cada producto. Debajo ves tu ganancia. Dejalo en blanco si no querés mostrar precio.'}</p>
    <div id="cb-precios-cuerpo"></div>`;

  $('#cb-body').querySelectorAll('.cb-ptab').forEach(b =>
    b.addEventListener('click', () => { _precioVista = b.dataset.vista; renderPrecios(); }));

  if (_precioVista === 'grupo') pintarPreciosGrupo();
  else pintarPreciosIndividual();

  setFoot('← Productos', 'Siguiente →', () => irA('diseno'), () => irA('productos'));
}

// Vista "Por grupo": una fila por (colección + precio de mayoreo). Ponerle el
// precio al grupo lo aplica a TODOS sus productos.
function pintarPreciosGrupo() {
  const cont = $('#cb-precios-cuerpo');
  const grupos = gruposDePrecios();
  let html = '', colActual = null;
  for (const g of grupos) {
    if (g.col !== colActual) {
      if (colActual !== null) html += `</div>`;
      html += `<div class="cb-pgcol"><h3 class="cb-pgcol__t">${esc(g.col)}</h3>`;
      colActual = g.col;
    }
    const comun = precioComunDe(g.items);
    const gan = gananciaInfo(g.mayoreo, comun);
    html += `
      <div class="cb-pgrow" data-gkey="${esc(g.gkey)}">
        <div class="cb-pgrow__info">
          <div>${g.mayoreo != null ? `Mayoreo <b>${moneyC(g.mayoreo)}</b>` : 'Sin precio de mayoreo'}</div>
          <div class="cb-pgrow__n">${g.items.length} producto${g.items.length === 1 ? '' : 's'}</div>
        </div>
        <div class="cb-prow__pcol">
          <input class="cb-input cb-pgrow__price" type="text" inputmode="decimal" placeholder="tu precio"
                 value="${esc(comun)}" data-mayoreo="${g.mayoreo != null ? esc(g.mayoreo) : ''}" />
          <div class="cb-prow__gan ${gan.cls}">${gan.txt}</div>
        </div>
      </div>`;
  }
  if (colActual !== null) html += `</div>`;
  cont.innerHTML = html || '<p class="cb-hint">No hay productos.</p>';

  const porKey = new Map(grupos.map(g => [g.gkey, g.items]));
  cont.querySelectorAll('.cb-pgrow').forEach(row => {
    const inp = row.querySelector('.cb-pgrow__price');
    inp.addEventListener('input', (e) => {
      (porKey.get(row.dataset.gkey) || []).forEach(it => { it.precio = e.target.value; });
      const gan = row.querySelector('.cb-prow__gan');
      const info = gananciaInfo(e.target.dataset.mayoreo, e.target.value);
      gan.textContent = info.txt;
      gan.classList.toggle('is-loss', info.cls === 'is-loss');
      guardarBorrador();
    });
  });
}

// Vista "Uno por uno": lista completa, un producto por fila (con su ganancia).
function pintarPreciosIndividual() {
  const cont = $('#cb-precios-cuerpo');
  const items = [...state.sel.values()];
  cont.innerHTML = `<div class="cb-plist">
    ${items.map(it => {
      const may = mayoreoDeItem(it), det = detalleDeItem(it);
      const g = gananciaInfo(may, it.precio);
      const costos = [
        may != null ? `Mayoreo: <b>${moneyC(may)}</b>` : '',
        det != null ? `Detalle: ${moneyC(det)}` : '',
      ].filter(Boolean).join(' · ');
      return `
      <div class="cb-prow" data-id="${esc(it.id)}">
        <div class="cb-prow__img">${it.imagen ? `<img src="${esc(it.imagen)}" alt=""/>` : NOIMG}</div>
        <div class="cb-prow__main">
          <div class="cb-prow__name">${esc(it.nombre)}</div>
          ${costos ? `<div class="cb-prow__costos">${costos}</div>` : ''}
        </div>
        <div class="cb-prow__pcol">
          <input class="cb-input cb-prow__price" type="text" inputmode="decimal"
                 placeholder="tu precio" value="${esc(it.precio)}" data-id="${esc(it.id)}"
                 data-mayoreo="${may != null ? esc(may) : ''}" />
          <div class="cb-prow__gan ${g.cls}">${g.txt}</div>
        </div>
        <button class="cb-prow__del" data-id="${esc(it.id)}" title="Quitar">✕</button>
      </div>`;
    }).join('')}
  </div>`;

  cont.querySelectorAll('.cb-prow__price').forEach(inp =>
    inp.addEventListener('input', (e) => {
      const it = state.sel.get(e.target.dataset.id); if (it) it.precio = e.target.value;
      const gan = e.target.closest('.cb-prow__pcol').querySelector('.cb-prow__gan');
      if (gan) {
        const info = gananciaInfo(e.target.dataset.mayoreo, e.target.value);
        gan.textContent = info.txt;
        gan.classList.toggle('is-loss', info.cls === 'is-loss');
      }
      guardarBorrador();
    }));
  cont.querySelectorAll('.cb-prow__del').forEach(b =>
    b.addEventListener('click', () => {
      state.sel.delete(b.dataset.id); guardarBorrador();
      if (state.sel.size) { renderPrecios(); renderSteps(); }
      else irA('productos');   // sin productos: volvemos al paso 1
    }));
}

// Da formato amable al precio: si es solo número, le antepone "L. ".
function precioMostrar(v) {
  v = (v || '').trim();
  if (!v) return '';
  if (/^[\d.,]+$/.test(v)) return 'L. ' + v;
  return v;
}

// ── Paso 3: Diseño + preview en vivo ──────────────────────
function renderDiseno() {
  const d = state.diseno;
  const paletas = PALETAS.map((p, i) => `
    <button type="button" class="cb-pal ${d.colorFondo === p.fondo && d.colorAcento === p.acento ? 'is-on' : ''}" data-pal="${i}" title="${esc(p.nombre)}">
      <span class="cb-pal__sw" style="background:${p.fondo}"></span>
      <span class="cb-pal__sw" style="background:${p.acento}"></span>
      <span class="cb-pal__sw" style="background:${p.texto}"></span>
      <span class="cb-pal__name">${esc(p.nombre)}</span>
    </button>`).join('');

  $('#cb-body').innerHTML = `
    <div class="cb-design">
      <div class="cb-form">

        <div class="cb-group">
          <h3 class="cb-group__t">Portada</h3>
          <div class="cb-logo-row">
            <div class="cb-logo-prev" id="cb-logo-prev">${d.logo ? `<img src="${esc(d.logo)}" alt=""/>` : '<span>Sin logo</span>'}</div>
            <div class="cb-logo-actions">
              <label class="cb-btn cb-btn--ghost cb-btn--sm">Subir logo
                <input type="file" id="cb-logo-input" accept="image/*" hidden /></label>
              ${d.logo ? `<button type="button" class="cb-link-btn" id="cb-logo-del">Quitar</button>` : ''}
            </div>
          </div>
          <p class="cb-hint" style="margin:.1rem 0 .3rem">Tu logo se guarda y aparece solo en tus próximos catálogos.</p>
          <label class="cb-field"><span>Título del catálogo / negocio</span>
            <input class="cb-input" id="cb-titulo" type="text" maxlength="120" placeholder="Ej: Cosméticos Andrea" value="${esc(d.titulo)}"/></label>
          <label class="cb-field"><span>Subtítulo (opcional)</span>
            <input class="cb-input" id="cb-subtitulo" type="text" maxlength="160" placeholder="Ej: Perfumes y cremas — hacé tu pedido" value="${esc(d.subtitulo)}"/></label>
          <p class="cb-hint" id="cb-titulo-aviso">Poné un título para poder generar el link.</p>
        </div>

        <div class="cb-group">
          <h3 class="cb-group__t">Colores</h3>
          <div class="cb-pals">${paletas}</div>
          <div class="cb-colors">
            <label class="cb-field cb-field--color"><span>Fondo</span>
              <input id="cb-fondo" type="color" value="${esc(d.colorFondo)}"/></label>
            <label class="cb-field cb-field--color"><span>Texto</span>
              <input id="cb-texto" type="color" value="${esc(d.colorTexto)}"/></label>
            <label class="cb-field cb-field--color"><span>Acento</span>
              <input id="cb-acento" type="color" value="${esc(d.colorAcento)}"/></label>
          </div>
        </div>

        <div class="cb-group">
          <h3 class="cb-group__t">Presentación</h3>
          <div class="cb-field"><span>Columnas (en compu/tablet)</span>
            <div class="cb-seg" id="cb-cols">
              ${[2, 3, 4].map(n => `<button type="button" class="cb-seg__b ${d.columnas === n ? 'is-on' : ''}" data-cols="${n}">${n}</button>`).join('')}
            </div>
          </div>
          <label class="cb-switch">
            <input type="checkbox" id="cb-separar" ${d.separarPorColeccion ? 'checked' : ''}/>
            <span class="cb-switch__track"></span>
            <span>Separar el catálogo por colección</span>
          </label>
        </div>

        <div class="cb-group">
          <h3 class="cb-group__t">Contacto</h3>
          <label class="cb-field"><span>WhatsApp para pedidos</span>
            <input class="cb-input" id="cb-whatsapp" type="tel" inputmode="numeric" placeholder="Ej: 9999-8888" value="${esc(d.whatsapp)}"/></label>
          <p class="cb-hint">Tus clientas verán un botón para escribirte y hacerte el pedido.</p>
          <p class="cb-hint" id="cb-whatsapp-aviso" style="color:#c0392b;font-weight:600">Poné tu WhatsApp para poder generar el catálogo.</p>
        </div>

        <p class="cb-hint">Así se verá la página que abrirán tus clientas →</p>
      </div>
      <div class="cb-preview-wrap">
        <div class="cb-prev">
          <div class="cb-prev__label">🖥️ En computadora</div>
          <div class="cb-browser">
            <div class="cb-browser__bar"><i></i><i></i><i></i></div>
            <div class="cb-browser__screen" id="cb-preview-desk"></div>
          </div>
        </div>
        <div class="cb-prev">
          <div class="cb-prev__label">📱 En celular</div>
          <div class="cb-phone"><div class="cb-phone__screen" id="cb-preview-mobile"></div></div>
        </div>
      </div>
    </div>`;

  const upd = () => {
    actualizarPreview();
    guardarBorrador();
    const r = $('#cb-foot-right');
    if (r) r.disabled = !puedeAvanzarHasta('generar');
    const aviso = $('#cb-titulo-aviso');
    if (aviso) aviso.style.display = state.diseno.titulo.trim() ? 'none' : '';
    const avisoWa = $('#cb-whatsapp-aviso');
    if (avisoWa) avisoWa.style.display = (state.diseno.whatsapp || '').trim() ? 'none' : '';
  };

  $('#cb-titulo').addEventListener('input', (e) => { d.titulo = e.target.value; upd(); });
  $('#cb-subtitulo').addEventListener('input', (e) => { d.subtitulo = e.target.value; upd(); });
  $('#cb-fondo').addEventListener('input', (e) => { d.colorFondo = e.target.value; upd(); });
  $('#cb-texto').addEventListener('input', (e) => { d.colorTexto = e.target.value; upd(); });
  $('#cb-acento').addEventListener('input', (e) => { d.colorAcento = e.target.value; upd(); });
  $('#cb-whatsapp').addEventListener('input', (e) => { d.whatsapp = e.target.value; upd(); });
  $('#cb-separar').addEventListener('change', (e) => { d.separarPorColeccion = e.target.checked; upd(); });
  $('#cb-cols').querySelectorAll('.cb-seg__b').forEach(b =>
    b.addEventListener('click', () => { d.columnas = +b.dataset.cols; renderDiseno(); }));
  $('#cb-body').querySelectorAll('.cb-pal').forEach(b =>
    b.addEventListener('click', () => {
      const p = PALETAS[+b.dataset.pal];
      d.colorFondo = p.fondo; d.colorTexto = p.texto; d.colorAcento = p.acento;
      renderDiseno();
    }));
  // Logo: subir (con reescalado) o quitar. Al subir, se guarda como el logo por
  // defecto de la mayorista para que sus próximos catálogos lo traigan puesto.
  $('#cb-logo-input').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) procesarLogo(f, (dataUrl) => {
      d.logo = dataUrl;
      state.logoCuenta = dataUrl;
      guardarLogoMayorista(state.token, dataUrl).catch(() => {});
      renderDiseno();
    });
  });
  const del = $('#cb-logo-del');
  if (del) del.addEventListener('click', () => { d.logo = ''; renderDiseno(); });

  actualizarPreview();
  setFoot('← Precios', 'Siguiente →', () => irA('generar'), () => irA('precios'),
          !puedeAvanzarHasta('generar'));
  const aviso = $('#cb-titulo-aviso');
  if (aviso) aviso.style.display = state.diseno.titulo.trim() ? 'none' : '';
  const avisoWa = $('#cb-whatsapp-aviso');
  if (avisoWa) avisoWa.style.display = (state.diseno.whatsapp || '').trim() ? 'none' : '';
}

// Reescala el logo en el navegador a un máximo de 360px y lo comprime, para que
// el data URL guardado sea chico (no inflar la fila ni la carga del público).
function procesarLogo(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 360;
      let { width: w, height: h } = img;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(cv.toDataURL('image/jpeg', 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// Construye el HTML del preview para una cantidad de columnas dada.
function previewInner(cols) {
  const d = state.diseno;
  const items = [...state.sel.values()];
  const separar = d.separarPorColeccion && items.some(i => i.coleccion);

  const cardHTML = (it) => {
    const precio = precioMostrar(it.precio);
    return `<div class="pv-card">
      <div class="pv-card__img">${it.imagen ? `<img src="${esc(it.imagen)}" alt=""/>` : NOIMG}</div>
      <div class="pv-card__name">${esc(it.nombre)}</div>
      ${precio ? `<div class="pv-card__price" style="color:${esc(d.colorAcento)}">${esc(precio)}</div>` : ''}
    </div>`;
  };

  let cuerpo;
  if (separar) {
    const grupos = [];
    const idx = new Map();
    items.forEach(it => {
      const k = it.coleccion || '__sin__';
      if (!idx.has(k)) { idx.set(k, grupos.length); grupos.push({ key: k, t: it.coleccion || '', items: [] }); }
      grupos[idx.get(k)].items.push(it);
    });
    // Los productos sin colección van SIEMPRE al final como "Otros productos"
    // (antes quedaban sueltos arriba de todo, sin título).
    const si = grupos.findIndex(g => g.key === '__sin__');
    if (si !== -1 && si !== grupos.length - 1) grupos.push(grupos.splice(si, 1)[0]);
    cuerpo = grupos.slice(0, 5).map(g => `
      <div class="pv-sec" style="color:${esc(d.colorAcento)}">${esc(g.t || 'Otros productos')}<span class="pv-sec__n" style="background:${esc(d.colorAcento)}">${g.items.length}</span></div>
      <div class="pv-grid" style="--pvcols:${cols}">${g.items.slice(0, cols * 2).map(cardHTML).join('')}</div>`).join('');
  } else {
    cuerpo = `<div class="pv-grid" style="--pvcols:${cols}">${items.slice(0, cols * 3).map(cardHTML).join('')}</div>`;
  }

  return `
    <div class="pv" style="background:${esc(d.colorFondo)};color:${esc(d.colorTexto)}">
      <div class="pv-head">
        ${d.logo ? `<img class="pv-logo" src="${esc(d.logo)}" alt=""/>` : ''}
        <div class="pv-title">${esc(d.titulo || 'Título del catálogo')}</div>
        ${d.subtitulo ? `<div class="pv-sub">${esc(d.subtitulo)}</div>` : ''}
        <div class="pv-rule" style="background:${esc(d.colorAcento)}"></div>
      </div>
      ${cuerpo}
      ${d.whatsapp ? `<div class="pv-wa">💬 Hacer pedido</div>` : ''}
    </div>`;
}

function actualizarPreview() {
  const desk = $('#cb-preview-desk');
  const mob = $('#cb-preview-mobile');
  if (desk) desk.innerHTML = previewInner(state.diseno.columnas);  // compu: columnas elegidas
  if (mob) mob.innerHTML = previewInner(2);                        // celular: siempre 2
}

// ── Paso 4: Generar ───────────────────────────────────────
function renderGenerar() {
  const dias = state.diasConfig;
  const editando = !!state.editando;
  $('#cb-body').innerHTML = `
    <div class="cb-generar">
      <div class="cb-resumen">
        <h3>Resumen</h3>
        <ul>
          <li><b>${state.sel.size}</b> producto${state.sel.size === 1 ? '' : 's'}</li>
          <li>Título: <b>${esc(state.diseno.titulo || '(sin título)')}</b></li>
          <li>Duración del link: <b>${editando ? 'se conserva la del catálogo' : (dias ? dias + ' días' : 'ilimitado (no vence)')}</b></li>
        </ul>
        <p class="cb-hint">${editando
          ? 'Vas a guardar los cambios en el mismo link.'
          : (dias
              ? 'Cuando se cumpla el plazo, el link deja de funcionar.'
              : 'El link no vence: lo podés compartir siempre.')}</p>
      </div>
      <button class="cb-btn cb-btn--primary cb-btn--big" id="cb-generar-btn">${editando ? 'Guardar cambios' : 'Generar link'}</button>
      <div id="cb-resultado"></div>
    </div>`;
  $('#cb-generar-btn').addEventListener('click', generar);
  setFoot('← Diseño', '', null, () => irA('diseno'));
}

async function generar() {
  const btn = $('#cb-generar-btn');
  const editando = !!state.editando;
  btn.disabled = true; btn.textContent = editando ? 'Guardando…' : 'Generando…';
  const d = state.diseno;
  const items = [...state.sel.values()].map(it => ({
    id: it.id, nombre: it.nombre, imagen: it.imagen, precio: precioMostrar(it.precio),
    coleccion: it.coleccion || '',
  }));
  const payload = {
    titulo: d.titulo, subtitulo: d.subtitulo,
    colorFondo: d.colorFondo, colorTexto: d.colorTexto,
    items,
    opciones: {
      colorAcento: d.colorAcento, logo: d.logo, whatsapp: d.whatsapp,
      columnas: d.columnas, separarPorColeccion: d.separarPorColeccion,
    },
  };
  try {
    let catToken, dias;
    if (editando) {
      await editarCatalogo(state.token, state.editando, payload);
      catToken = state.editando;
    } else {
      const r = await crearCatalogo(state.token, payload);
      catToken = r.token; dias = r.dias;
    }
    limpiarBorrador();
    const link = `${CATALOGO_BASE}/c/?c=${catToken}`;
    const waText = encodeURIComponent(`Mirá mi catálogo 🛍️\n${link}`);
    $('#cb-resultado').innerHTML = `
      <div class="cb-ok">
        <div class="cb-ok__icon">✅</div>
        <h3>${editando ? '¡Cambios guardados!' : '¡Tu catálogo está listo!'}</h3>
        <p class="cb-hint">${editando
          ? 'Tu catálogo se actualizó en el mismo link:'
          : (dias ? `Dura ${dias} días. Compartí este link con tus clientas:` : 'Compartí este link con tus clientas (no vence):')}</p>
        <div class="cb-linkbox">
          <input id="cb-link" class="cb-input" readonly value="${esc(link)}"/>
          <button class="cb-btn" id="cb-copy">Copiar</button>
        </div>
        <a class="cb-btn cb-btn--wa" href="https://wa.me/?text=${waText}" target="_blank" rel="noopener">Compartir por WhatsApp</a>
        <a class="cb-btn cb-btn--ghost" href="${esc(link)}" target="_blank" rel="noopener">Ver cómo quedó</a>
        <a class="cb-btn cb-btn--ghost" href="${esc(link + '&pdf=1')}" target="_blank" rel="noopener">Descargar PDF</a>
        <a class="cb-btn cb-btn--ghost" href="#" id="cb-ver-mis2">Mis catálogos</a>
      </div>`;
    $('#cb-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); $('#cb-copy').textContent = '¡Copiado!'; }
      catch (_) { $('#cb-link').select(); document.execCommand('copy'); $('#cb-copy').textContent = '¡Copiado!'; }
    });
    $('#cb-ver-mis2').addEventListener('click', (e) => { e.preventDefault(); mostrarLista(); });
    btn.style.display = 'none';
  } catch (e) {
    btn.disabled = false; btn.textContent = editando ? 'Guardar cambios' : 'Generar link';
    $('#cb-resultado').innerHTML = `<p class="cb-error">${esc(e.message || 'No se pudo generar')}</p>`;
  }
}

// ── Mis catálogos (apartado propio: crear nuevo + lista + editar + eliminar) ──
function mostrarLista() {
  state.editando = null;
  $('#cb-root').innerHTML = `
    <header class="cb-head">
      <a class="cb-back" href="/" title="Volver a la tienda" aria-label="Volver a la tienda">${ICON_BACK}</a>
      <h1>Mis catálogos</h1>
    </header>
    <main class="cb-body"><div class="cb-mislist">${skLista()}</div></main>`;
  cargarLista();
}

async function cargarLista() {
  const cont = $('#cb-root .cb-body');
  const crearCard = `
    <button class="cb-newcard" id="cb-crear-nuevo">
      <span class="cb-newcard__plus">+</span>
      <span class="cb-newcard__txt"><b>Crear catálogo nuevo</b><small>Armá un catálogo y compartí el link con tus clientas</small></span>
    </button>`;
  try {
    const { catalogos } = await listarCatalogos(state.token);
    if (!catalogos.length) {
      cont.innerHTML = `${crearCard}
        <div class="cb-empty"><div class="cb-empty__icon">🛍️</div>
          <p class="cb-hint">Todavía no has creado catálogos.<br>Tocá <b>“Crear catálogo nuevo”</b> para empezar.</p>
        </div>`;
    } else {
      cont.innerHTML = `${crearCard}
        <div class="cb-mislist">${catalogos.map((c, i) => {
          const link = `${CATALOGO_BASE}/c/?c=${c.token}`;
          const exp = c.expirado;
          const fecha = c.expiraEn ? new Date(c.expiraEn).toLocaleDateString('es-HN', { day: 'numeric', month: 'long' }) : '';
          const venc = exp ? 'Expirado' : (c.expiraEn ? 'Vence el ' + fecha : 'Sin vencimiento');
          return `<div class="cb-miscard ${exp ? 'is-exp' : ''}">
            <div class="cb-miscard__info">
              <b>${esc(c.titulo || '(sin título)')}</b>
              <span>${c.cantidad} producto${c.cantidad === 1 ? '' : 's'} · ${venc}</span>
            </div>
            <div class="cb-miscard__acts">
              ${exp ? '' : `<a class="cb-btn cb-btn--sm" href="${esc(link)}" target="_blank" rel="noopener">Abrir</a>`}
              ${exp ? '' : `<a class="cb-btn cb-btn--sm" href="${esc(link + '&pdf=1')}" target="_blank" rel="noopener" title="Descargar el catálogo en PDF">PDF</a>`}
              <button class="cb-btn cb-btn--sm" data-edit="${i}">Editar</button>
              <button class="cb-btn cb-btn--sm cb-btn--ghost" data-del="${esc(c.token)}">Eliminar</button>
            </div>
          </div>`;
        }).join('')}</div>`;
      cont.querySelectorAll('[data-edit]').forEach(b =>
        b.addEventListener('click', () => editarCat(catalogos[+b.dataset.edit])));
      cont.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        const cat = catalogos.find(c => c.token === b.dataset.del);
        const ok = await confirmar({
          titulo: '¿Eliminar este catálogo?',
          mensaje: `"${cat ? (cat.titulo || 'Sin título') : ''}" se borrará y su link dejará de funcionar para tus clientas. Esta acción no se puede deshacer.`,
          ok: 'Sí, eliminar',
        });
        if (!ok) return;
        b.disabled = true; b.textContent = '…';
        try { await eliminarCatalogo(state.token, b.dataset.del); cargarLista(); }
        catch (_) { b.disabled = false; b.textContent = 'Eliminar'; }
      }));
    }
    $('#cb-crear-nuevo').addEventListener('click', crearNuevo);
  } catch (_) {
    cont.innerHTML = `${crearCard}<p class="cb-error" style="text-align:center;padding:2rem">No se pudieron cargar.</p>`;
    const cn = $('#cb-crear-nuevo'); if (cn) cn.addEventListener('click', crearNuevo);
  }
}

// Diálogo de confirmación (para acciones destructivas). Devuelve Promise<bool>.
function confirmar({ titulo, mensaje, ok = 'Aceptar', cancel = 'Cancelar' }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cb-confirm';
    ov.innerHTML = `
      <div class="cb-confirm__box" role="dialog" aria-modal="true">
        <div class="cb-confirm__icon">🗑️</div>
        <h3 class="cb-confirm__title">${esc(titulo)}</h3>
        <p class="cb-confirm__msg">${esc(mensaje)}</p>
        <div class="cb-confirm__acts">
          <button class="cb-btn cb-btn--ghost" data-x="cancel">${esc(cancel)}</button>
          <button class="cb-btn cb-btn--danger" data-x="ok">${esc(ok)}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-open'));
    const cerrar = (val) => { ov.classList.remove('is-open'); setTimeout(() => ov.remove(), 180); resolve(val); };
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.dataset.x === 'cancel') cerrar(false);
      else if (e.target.dataset.x === 'ok') cerrar(true);
    });
    document.addEventListener('keydown', function esc2(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc2); cerrar(false); }
    });
  });
}

// Empezar un catálogo nuevo en blanco (descarta el borrador anterior).
function crearNuevo() {
  state.editando = null;
  state.sel = new Map();
  state.diseno = {
    titulo: '', subtitulo: '',
    colorFondo: '#fff0f5', colorTexto: '#3a0a1e', colorAcento: '#e8437a',
    // Logo y WhatsApp precargados con lo que la mayorista tiene registrado.
    logo: state.logoCuenta || '', whatsapp: state.telefonoCuenta || '', columnas: 4, separarPorColeccion: true,
  };
  state.busqueda = ''; state.filtroColeccion = '';
  state.paso = 'productos';
  limpiarBorrador();
  renderShell();
  render();
}

// Arrancar un catálogo nuevo con los productos de un pedido recién hecho (viene
// del checkout de mayoreo: "crear catálogo con estos productos").
function iniciarCatalogoDesdePedido(prods) {
  state.editando = null;
  state.sel = new Map();
  for (const p of prods) {
    const id = String(p.id);
    const full = state.productos.find(x => x.id === id);
    if (full) addProducto(full);   // producto en la lista actual: datos completos
    else state.sel.set(id, {       // ya no está (agotado): usamos lo que trae el pedido
      id, nombre: p.nombre || 'Producto', imagen: p.imagen || '', precio: '',
      coleccion: '', mayoreo: p.mayoreo != null ? p.mayoreo : null, detalle: null });
  }
  state.diseno = {
    titulo: '', subtitulo: '',
    colorFondo: '#fff0f5', colorTexto: '#3a0a1e', colorAcento: '#e8437a',
    logo: state.logoCuenta || '', whatsapp: state.telefonoCuenta || '', columnas: 4, separarPorColeccion: true,
  };
  state.busqueda = ''; state.filtroColeccion = '';
  state.paso = 'productos';
  limpiarBorrador();
  renderShell();
  render();
}

// Cargar un catálogo existente en el asistente para editarlo.
function editarCat(cat) {
  state.editando = cat.token;
  state.sel = new Map();
  (cat.items || []).forEach((it, i) => {
    const key = it.id || ('x' + i);   // id real si lo hay; si no, clave temporal
    // El precio guardado puede venir como "L. 150"; lo dejamos tal cual para editar.
    state.sel.set(key, { id: it.id || key, nombre: it.nombre, imagen: it.imagen || '',
      precio: it.precio || '', coleccion: it.coleccion || '' });
  });
  const op = cat.opciones || {};
  state.diseno = {
    titulo: cat.titulo || '',
    subtitulo: cat.subtitulo || '',
    colorFondo: cat.colorFondo || '#fff0f5',
    colorTexto: cat.colorTexto || '#3a0a1e',
    colorAcento: op.colorAcento || '#e8437a',
    logo: op.logo || state.logoCuenta || '',
    whatsapp: op.whatsapp || state.telefonoCuenta || '',
    columnas: [2, 3, 4].includes(op.columnas) ? op.columnas : 4,
    separarPorColeccion: op.separarPorColeccion !== false,
  };
  state.busqueda = ''; state.filtroColeccion = '';
  state.paso = 'productos';
  renderShell();
  render();
}

// ── Footer de navegación ──────────────────────────────────
// rightDisabled (opcional) deshabilita el botón derecho explícitamente.
function setFoot(leftLabel, rightLabel, onRight, onLeft, rightDisabled = false) {
  const foot = $('#cb-foot');
  // Si el izquierdo trae handler -> botón (ej. "← Precios"). Si no, es info.
  const leftHtml = leftLabel
    ? (onLeft
        ? `<button class="cb-btn cb-btn--ghost" id="cb-foot-left">${esc(leftLabel)}</button>`
        : `<span class="cb-foot__info">${esc(leftLabel)}</span>`)
    : '<span></span>';
  foot.innerHTML = `${leftHtml}${rightLabel ? `<button class="cb-btn cb-btn--primary" id="cb-foot-right"${rightDisabled ? ' disabled' : ''}>${esc(rightLabel)}</button>` : '<span></span>'}`;
  if (leftLabel && onLeft) $('#cb-foot-left').addEventListener('click', onLeft);
  if (rightLabel && onRight) $('#cb-foot-right').addEventListener('click', onRight);
}

initBuilder();
