// ── Modo Mayoreo ──────────────────────────────────────────
// Login de mayorista + cambio de catálogo a precios de mayoreo, con
// transiciones suaves (View Transitions API) y degradado elegante si el
// navegador no la soporta.
import { getState, setState } from './state.js';
import { mayoreoLogin, fetchMayoreoProducts, fetchConfig, fetchMisPedidos } from './api.js';

const TOKEN_KEY = 'pinkpower_mayoreo_token';
const USER_KEY  = 'pinkpower_mayoreo_user';
const TEL_KEY   = 'pinkpower_mayoreo_tel';

// ¿La admin tiene habilitados los catálogos para mayoristas? Se refresca en cada
// carga de sesión (enterMayoreo). Por defecto true: un fallo de red no oculta nada.
let catalogoHabilitado = true;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Envuelve un cambio de DOM en una transición de vista (si está disponible).
function withViewTransition(fn) {
  if (document.startViewTransition) document.startViewTransition(fn);
  else fn();
}

// ── Markup (se inyecta una sola vez) ──────────────────────
function ensureMarkup() {
  if (document.getElementById('mayoreo-modal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="mayoreo-modal" class="my-modal" hidden>
      <div class="my-modal__backdrop" data-close></div>
      <div class="my-modal__panel" role="dialog" aria-modal="true" aria-labelledby="my-title">
        <button class="my-modal__close" data-close aria-label="Cerrar">&times;</button>
        <div class="my-modal__icon">🛍️</div>
        <h2 id="my-title" class="my-modal__title">Acceso Mayoreo</h2>
        <p class="my-modal__sub">Ingresá con tu usuario y contraseña de mayorista.</p>
        <form id="my-form" class="my-form">
          <label class="my-field">
            <span>Usuario</span>
            <input type="text" id="my-usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required />
          </label>
          <label class="my-field">
            <span>Contraseña</span>
            <div class="my-pwd-wrap">
              <input type="password" id="my-password" autocomplete="current-password" required />
              <button type="button" class="my-pwd-eye" aria-label="Mostrar u ocultar contraseña"></button>
            </div>
          </label>
          <p id="my-error" class="my-form__error" hidden></p>
          <button type="submit" id="my-submit" class="btn btn-primary my-form__submit">Ingresar</button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
  document.getElementById('my-form').addEventListener('submit', onSubmit);
  const EYE = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.4 18.4 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2m-6.7-1.1a3 3 0 1 1-4.2-4.2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const eye = wrap.querySelector('.my-pwd-eye');
  eye.innerHTML = EYE;
  eye.addEventListener('click', () => {
    const inp = document.getElementById('my-password');
    const reveal = inp.type === 'password';
    inp.type = reveal ? 'text' : 'password';
    eye.innerHTML = reveal ? EYE_OFF : EYE;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('mayoreo-modal').hidden) closeModal();
  });
}

// ── Modal ─────────────────────────────────────────────────
function openModal() {
  ensureMarkup();
  const m = document.getElementById('mayoreo-modal');
  document.getElementById('my-error').hidden = true;
  document.getElementById('my-form').reset();
  m.hidden = false;
  document.body.style.overflow = 'hidden';   // bloquea el scroll de la página
  requestAnimationFrame(() => m.classList.add('is-open'));
  setTimeout(() => document.getElementById('my-usuario').focus(), 60);
}

function closeModal() {
  const m = document.getElementById('mayoreo-modal');
  if (!m || m.hidden) return;
  m.classList.remove('is-open');
  document.body.style.overflow = '';   // restaura el scroll
  setTimeout(() => { m.hidden = true; }, 260);
}

async function onSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('my-submit');
  const err = document.getElementById('my-error');
  const usuario  = document.getElementById('my-usuario').value.trim();
  const password = document.getElementById('my-password').value;
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Ingresando…';
  try {
    const data = await mayoreoLogin(usuario, password);
    const nombre = data.nombre || data.usuario;
    const telefono = data.telefono || '';
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, nombre);
    localStorage.setItem(TEL_KEY, telefono);
    closeModal();
    await enterMayoreo(data.token, nombre, telefono);
    // Llevar la vista al catálogo para que se vean los precios de mayoreo.
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (ex) {
    err.textContent = ex.message || 'No se pudo iniciar sesión';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

// ── Entrar / salir del modo mayoreo ───────────────────────
async function enterMayoreo(token, nombre, telefono = '') {
  // Config primero: es un endpoint chico y rápido. Con eso ya sabemos si los
  // catálogos están habilitados y montamos el menú de cuenta de una vez, sin
  // esperar a que cargue todo el catálogo de mayoreo (así el menú no tarda unos
  // segundos en aparecer completo).
  const cfg = await fetchConfig().catch(() => null);
  catalogoHabilitado = !cfg || cfg.catalogo_habilitado !== false;
  // Actualización directa (sin view-transition: chocaba con el cierre del modal
  // y dejaba la pantalla en el estado viejo hasta refrescar).
  document.body.classList.add('is-mayoreo');
  mountAccount(nombre);
  let productos;
  try {
    productos = await fetchMayoreoProducts(token);
  } catch (e) {
    // Solo limpiamos la sesión si el token es inválido/vencido (401). Ante un
    // error transitorio (red, 502) la mantenemos para no desloguear sin querer.
    if (e && e.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      unmountAccount();
      document.body.classList.remove('is-mayoreo');
    }
    return;
  }
  // En mayoreo solo deben existir las colecciones que tienen al menos un
  // producto con precio de mayoreo. Filtramos `collections` en el estado (no
  // solo el carrusel) para que la lista de categorías, la barra de tallas y la
  // búsqueda tampoco muestren colecciones vacías. `productos` ya son solo los
  // de mayoreo, así que basta con quedarnos con sus colecciones.
  const conMayoreo = new Set();
  productos.forEach(p => (p.collectionHandles || []).forEach(h => conMayoreo.add(h)));
  const todasCols = getState().collections || [];
  const colsMayoreo = todasCols.filter(c => conMayoreo.has(c.handle));
  setState({
    products: productos,
    // Si por algún motivo no se pudo determinar (productos sin colecciones),
    // dejamos las colecciones completas para no vaciar el catálogo.
    collections: colsMayoreo.length ? colsMayoreo : todasCols,
    productsLoaded: true,
    mayoreo: true,
    mayoreoUser: nombre || '',
    mayoreoTelefono: telefono || '',
    activeCollection: null, activeTag: null, activeSize: null,
    searchQuery: '', priceMin: null, priceMax: null, currentPage: 1,
  });

  // Si volvió de generar un PDF ("Volver a mis pedidos"), reabrimos Mis pedidos
  // y limpiamos el parámetro de la URL para que un refresh no lo vuelva a abrir.
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('abrir') === 'pedidos' && catalogoHabilitado) {
      params.delete('abrir');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      setTimeout(() => openPedidosModal(), 500);
    }
  } catch (_) {}
}

function exitMayoreo() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TEL_KEY);
  unmountAccount();
  document.body.classList.remove('is-mayoreo');
  // Recargar es lo más seguro para restaurar el catálogo normal completo.
  location.reload();
}

// ── Menú de cuenta de mayorista (dropdown en el nav) ──────
function mountAccount(nombre) {
  let acc = document.getElementById('my-account');
  if (!acc) {
    const right = document.querySelector('nav .nav-group--right') || document.querySelector('nav');
    acc = document.createElement('div');
    acc.id = 'my-account';
    acc.className = 'my-account';
    acc.innerHTML = `
      <button class="my-account__btn btn btn-primary" id="my-account-btn" aria-haspopup="true" aria-expanded="false">
        <span class="my-account__name"></span>
        <svg class="my-account__chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>`;
    right.appendChild(acc);

    // El menú vive en el <body> (fixed) para no quedar atrapado en el stacking
    // del nav (que lo dejaba debajo de la barra de filtros para los clics).
    const menu = document.createElement('div');
    menu.id = 'my-account-menu';
    menu.className = 'my-account__menu';
    menu.hidden = true;
    menu.innerHTML = `
      ${catalogoHabilitado ? '<a class="my-account__link" id="my-catalogo" href="/mi-catalogo/">🛍️ Mi catálogo en línea</a>' : ''}
      ${catalogoHabilitado ? '<button class="my-account__link" id="my-pedidos">📦 Mis pedidos</button>' : ''}
      <button class="my-account__logout" id="my-logout">Cerrar sesión</button>`;
    document.body.appendChild(menu);

    const btn = acc.querySelector('#my-account-btn');
    const positionMenu = () => {
      const r = btn.getBoundingClientRect();
      menu.style.top = `${r.bottom + 8}px`;
      menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      if (willOpen) positionMenu();
      menu.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', e => {
      if (e.target !== btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    window.addEventListener('resize', () => { if (!menu.hidden) positionMenu(); });
    menu.querySelector('#my-logout').addEventListener('click', exitMayoreo);
    const pedidosBtn = menu.querySelector('#my-pedidos');
    if (pedidosBtn) pedidosBtn.addEventListener('click', () => {
      menu.hidden = true;
      document.getElementById('my-account-btn')?.setAttribute('aria-expanded', 'false');
      openPedidosModal();
    });
  }
  acc.querySelector('.my-account__name').textContent = nombre || 'Mayorista';
  acc.hidden = false;

  // En móvil el botón del nav rompía el header, así que el control de sesión
  // vive dentro de la cinta lateral (hamburguesa). CSS decide cuál se ve.
  mountDrawerAccount(nombre);
}

// Bloque de sesión de mayoreo dentro del menú lateral (visible solo en móvil).
function mountDrawerAccount(nombre) {
  let block = document.getElementById('my-drawer-account');
  if (!block) {
    const panel = document.querySelector('#menu-drawer .menu-panel');
    if (!panel) return;
    block = document.createElement('div');
    block.id = 'my-drawer-account';
    block.className = 'my-drawer-account';
    block.innerHTML = `
      <p class="my-drawer-account__hello">Sesión de mayoreo</p>
      <p class="my-drawer-account__name"></p>
      ${catalogoHabilitado ? '<a class="my-drawer-account__catalogo" href="/mi-catalogo/">🛍️ Mi catálogo en línea</a>' : ''}
      ${catalogoHabilitado ? '<button class="my-drawer-account__catalogo" id="my-drawer-pedidos">📦 Mis pedidos</button>' : ''}
      <button class="my-drawer-account__logout" id="my-drawer-logout">Cerrar sesión</button>`;
    panel.appendChild(block);
    block.querySelector('#my-drawer-logout').addEventListener('click', exitMayoreo);
    const drawerPedidos = block.querySelector('#my-drawer-pedidos');
    if (drawerPedidos) drawerPedidos.addEventListener('click', () => {
      const drawer = document.getElementById('menu-drawer');
      if (drawer) drawer.hidden = true;
      document.body.classList.remove('menu-open');
      openPedidosModal();
    });
  }
  block.querySelector('.my-drawer-account__name').textContent = nombre || 'Mayorista';
}

// ── Mis pedidos (catálogo PDF de pedidos pagados) ─────────
// Dos pantallas: (1) lista de pedidos pagados (solo verlos); (2) detalle de un
// pedido con sus productos (se pueden desmarcar) y dos acciones: crear catálogo
// PDF o descargar las fotos. El PDF reusa el armador (arranca en el paso de
// precios, en modo solo-PDF).
let _pedidosCache = null;

function fmtFecha(iso) {
  if (!iso) return '';
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [y, m, d] = String(iso).split('-');
  return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1] || ''} ${y}`;
}

// Arma los productos de un pedido. El backend ya manda foto, colección (categoría),
// marca y precios de CADA producto —incluidos los agotados, que no salen en el
// catálogo de mayoreo—, así que usamos eso primero y, si faltara algo, caemos al
// catálogo ya cargado (getState) emparejando por product_id.
function resolverItemsPedido(pedido) {
  const productos = getState().products || [];
  const cols = getState().collections || [];
  const colTitulo = (handles) => {
    for (const c of cols) if ((handles || []).includes(c.handle)) return c.title;
    return '';
  };
  return (pedido.items || []).map(it => {
    const full = productos.find(p => String(p.id) === String(it.product_id));
    return {
      id: String(it.product_id || ''),
      nombre: it.titulo || (full && full.title) || 'Producto',
      imagen: it.imagen || (full && full.images && full.images[0] ? full.images[0].url : ''),
      coleccion: it.coleccion || (full ? colTitulo(full.collectionHandles) : ''),
      marca: it.marca || (full ? (full.productType || '') : ''),
      mayoreo: it.mayoreo != null ? it.mayoreo : (full ? full.price : null),
      detalle: it.detalle != null ? it.detalle : (full && full.retailPrice != null ? full.retailPrice : null),
    };
  }).filter(p => p.id || p.nombre);
}

function ensurePedidosMarkup() {
  if (document.getElementById('my-pedidos-modal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="my-pedidos-modal" class="my-modal" hidden>
      <div class="my-modal__backdrop" data-pcerrar></div>
      <div class="my-modal__panel my-modal__panel--pedidos" role="dialog" aria-modal="true">
        <button class="my-modal__close" data-pcerrar aria-label="Cerrar">&times;</button>
        <div id="my-pedidos-view"></div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-pcerrar]').forEach(el => el.addEventListener('click', closePedidosModal));
  document.addEventListener('keydown', e => {
    const m = document.getElementById('my-pedidos-modal');
    if (e.key === 'Escape' && m && !m.hidden) closePedidosModal();
  });
}

function closePedidosModal() {
  const m = document.getElementById('my-pedidos-modal');
  if (!m || m.hidden) return;
  m.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => { m.hidden = true; }, 260);
}

async function openPedidosModal() {
  ensurePedidosMarkup();
  const m = document.getElementById('my-pedidos-modal');
  const view = document.getElementById('my-pedidos-view');
  m.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => m.classList.add('is-open'));
  // Encabezado + esqueleto (evita el parpadeo de "no tenés pedidos" mientras carga).
  view.innerHTML = `
    <div class="my-modal__icon">📦</div>
    <h2 class="my-modal__title">Mis pedidos</h2>
    <p class="my-modal__sub">Elegí un pedido pagado para ver sus productos.</p>
    <div class="my-pedidos">
      <div class="my-ped-sk"></div><div class="my-ped-sk"></div><div class="my-ped-sk"></div>
    </div>`;
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const pedidos = await fetchMisPedidos(token);
    _pedidosCache = Array.isArray(pedidos) ? pedidos : [];
    renderListaPedidos(_pedidosCache);
  } catch (_) {
    const cont = view.querySelector('.my-pedidos');
    if (cont) cont.innerHTML = '<p class="my-pedidos__msg">No se pudieron cargar tus pedidos. Probá de nuevo.</p>';
  }
}

// Pantalla 1: solo la lista de pedidos. Cada pedido se toca para ver su detalle.
function renderListaPedidos(pedidos) {
  const view = document.getElementById('my-pedidos-view');
  if (!view) return;
  if (!Array.isArray(pedidos) || !pedidos.length) {
    view.innerHTML = `
      <div class="my-modal__icon">📦</div>
      <h2 class="my-modal__title">Mis pedidos</h2>
      <p class="my-pedidos__msg">Todavía no tenés pedidos pagados.</p>
      <p class="my-pedidos__hint">Cuando un pedido esté pagado, acá vas a poder crear su catálogo en PDF o descargar sus fotos.</p>`;
    return;
  }
  const filas = pedidos.map((p, i) => {
    const items = resolverItemsPedido(p);
    const n = items.length;
    const thumbs = items.slice(0, 4).map(it =>
      `<span class="my-ped-thumb">${it.imagen ? `<img src="${esc(it.imagen)}" alt="" loading="lazy"/>` : ''}</span>`).join('');
    const extra = n > 4 ? `<span class="my-ped-thumb my-ped-thumb--more">+${n - 4}</span>` : '';
    return `
      <button class="my-pedido my-pedido--sel" data-i="${i}">
        <div class="my-pedido__info">
          <b>${esc(p.name || 'Pedido')}</b>
          <span>${fmtFecha(p.fecha)} · ${n} producto${n === 1 ? '' : 's'}</span>
        </div>
        <div class="my-ped-thumbs">${thumbs}${extra}</div>
        <span class="my-pedido__chev" aria-hidden="true">›</span>
      </button>`;
  }).join('');
  view.innerHTML = `
    <div class="my-modal__icon">📦</div>
    <h2 class="my-modal__title">Mis pedidos</h2>
    <p class="my-modal__sub">Elegí un pedido pagado para ver sus productos.</p>
    <div class="my-pedidos">${filas}</div>`;
  view.querySelectorAll('.my-pedido--sel').forEach(btn =>
    btn.addEventListener('click', () => mostrarDetallePedido(pedidos[+btn.dataset.i])));
}

// Pantalla 2: SOLO los productos del pedido, con casilla para desmarcar los que
// no quiera incluir, y dos acciones (crear catálogo PDF / descargar imágenes).
function mostrarDetallePedido(pedido) {
  const view = document.getElementById('my-pedidos-view');
  if (!view) return;
  const items = resolverItemsPedido(pedido);
  const sel = new Set(items.map((_, i) => i));   // todos marcados por defecto

  const filas = items.map((it, i) => `
    <label class="my-ped-item">
      <input type="checkbox" class="my-ped-item__chk" data-i="${i}" checked />
      <span class="my-ped-item__box" aria-hidden="true"></span>
      <span class="my-ped-item__img">${it.imagen ? `<img src="${esc(it.imagen)}" alt=""/>` : ''}</span>
      <span class="my-ped-item__txt">
        ${it.marca ? `<span class="my-ped-item__marca">${esc(it.marca)}</span>` : ''}
        <span class="my-ped-item__name">${esc(it.nombre)}</span>
      </span>
    </label>`).join('');

  view.innerHTML = `
    <div class="my-ped-dethead">
      <button class="my-ped-back" data-back aria-label="Volver a mis pedidos">‹</button>
      <div class="my-ped-dethead__txt">
        <h2 class="my-modal__title my-modal__title--sm">${esc(pedido.name || 'Pedido')}</h2>
        <p class="my-modal__sub">Desmarcá los que no quieras incluir.</p>
      </div>
    </div>
    <div class="my-pedidos my-pedidos--items">${filas}</div>
    <div class="my-ped-acts">
      <button class="btn btn-primary my-ped-act" data-act="pdf">Crear catálogo PDF</button>
      <button class="my-ped-act my-ped-act--ghost" data-act="fotos">Descargar imágenes</button>
    </div>`;

  const acts = view.querySelectorAll('.my-ped-act');
  const refrescarActs = () => acts.forEach(b => { b.disabled = sel.size === 0; });

  view.querySelector('[data-back]').addEventListener('click', () => renderListaPedidos(_pedidosCache || []));
  view.querySelectorAll('.my-ped-item__chk').forEach(chk =>
    chk.addEventListener('change', () => {
      const i = +chk.dataset.i;
      if (chk.checked) sel.add(i); else sel.delete(i);
      chk.closest('.my-ped-item').classList.toggle('is-off', !chk.checked);
      refrescarActs();
    }));
  view.querySelector('[data-act="pdf"]').addEventListener('click', () =>
    crearCatalogoDesdePedido(items.filter((_, i) => sel.has(i))));
  view.querySelector('[data-act="fotos"]').addEventListener('click', (e) =>
    descargarImagenesPedido(items.filter((_, i) => sel.has(i)), e.currentTarget));
  refrescarActs();
}

// "Crear catálogo PDF": manda los productos ya resueltos (con colección, marca y
// precios) al armador, que arranca en el paso de precios en modo solo-PDF.
function crearCatalogoDesdePedido(items) {
  if (!items.length) return;
  const prods = items.map(it => ({
    id: it.id || '', nombre: it.nombre || 'Producto', imagen: it.imagen || '',
    coleccion: it.coleccion || '', marca: it.marca || '',
    mayoreo: it.mayoreo != null ? it.mayoreo : null,
    detalle: it.detalle != null ? it.detalle : null,
  }));
  try {
    localStorage.setItem('pinkpower_catalogo_desde_pedido', JSON.stringify(prods));
    localStorage.setItem('pinkpower_catalogo_solo_pdf', '1');
  } catch (_) {}
  window.location.href = '/mi-catalogo/';
}

// "Descargar imágenes": abre la hoja de compartir del celular con TODAS las fotos
// (desde ahí la mayorista elige "Guardar en Fotos"). Si el navegador no soporta
// compartir archivos (compu), las descarga una por una.
async function descargarImagenesPedido(items, btn) {
  const conFoto = items.filter(it => it.imagen);
  const original = btn ? btn.textContent : '';
  const restaurar = (txt, ms) => { if (btn) { btn.textContent = txt; setTimeout(() => { btn.textContent = original; }, ms); } };
  const nombreArchivo = (it, i) => {
    const base = (it.nombre || 'producto').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'producto';
    return `${i + 1}-${base}`;
  };
  const descargar = (files) => {   // descarga directa (blob del mismo origen: siempre funciona)
    files.forEach((f, i) => setTimeout(() => {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url; a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, i * 250));
  };

  if (!conFoto.length) { restaurar('Estos productos no tienen foto', 2000); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Preparando fotos…'; }

  // Descargamos las fotos EN PARALELO (rápido, para no perder el "gesto" que exige
  // navigator.share en el celular) y quedan como File del mismo origen.
  let files = [];
  try {
    files = (await Promise.all(conFoto.map(async (it, i) => {
      try {
        const resp = await fetch(it.imagen, { mode: 'cors' });
        const blob = await resp.blob();
        const ext = ((blob.type || '').split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        return new File([blob], `${nombreArchivo(it, i)}.${ext}`, { type: blob.type || 'image/jpeg' });
      } catch (_) { return null; }
    }))).filter(Boolean);
  } catch (_) { files = []; }

  if (btn) { btn.disabled = false; btn.textContent = original; }
  if (!files.length) { restaurar('No se pudieron descargar, probá de nuevo', 2200); return; }

  // 1) Hoja de compartir del celular (guarda en Fotos). Si NO se puede compartir
  //    archivos, o si share() falla (p. ej. se perdió el gesto), NO mostramos error:
  //    caemos a la descarga directa. Si la mayorista cancela (AbortError), no hacemos nada.
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // canceló: sin ruido ni descarga
      // otro error: seguimos a la descarga directa
    }
  }
  descargar(files);
}

function unmountAccount() {
  const acc = document.getElementById('my-account');
  if (acc) acc.remove();
  const menu = document.getElementById('my-account-menu');
  if (menu) menu.remove();
  const drawerAcc = document.getElementById('my-drawer-account');
  if (drawerAcc) drawerAcc.remove();
}

// ── Init ──────────────────────────────────────────────────
export function hasMayoreoSession() {
  return !!localStorage.getItem(TOKEN_KEY);
}

export function initMayoreo() {
  ensureMarkup();
  // El acceso está en varios lugares (header, cinta lateral y footer), así que se
  // escucha por delegación. Si el clic viene de la cinta lateral, primero se cierra
  // (la cinta va por encima del modal) y luego se abre el login.
  document.addEventListener('click', e => {
    if (!e.target.closest('.mayoreo-access')) return;
    e.preventDefault();
    const drawer = document.getElementById('menu-drawer');
    if (drawer && !drawer.hidden) {
      document.getElementById('menu-close')?.click();
      setTimeout(openModal, 260);   // espera a que termine de cerrarse
      return;
    }
    openModal();
  });
}

// Restaura la sesión guardada (se llama cuando el catálogo normal ya cargó).
export async function restoreMayoreo() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) await enterMayoreo(token, localStorage.getItem(USER_KEY) || '',
                                localStorage.getItem(TEL_KEY) || '');
}
