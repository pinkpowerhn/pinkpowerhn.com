// ── Modo Mayoreo ──────────────────────────────────────────
// Login de mayorista + cambio de catálogo a precios de mayoreo, con
// transiciones suaves (View Transitions API) y degradado elegante si el
// navegador no la soporta.
import { getState, setState } from './state.js';
import { mayoreoLogin, fetchMayoreoProducts, fetchConfig } from './api.js';

const TOKEN_KEY = 'pinkpower_mayoreo_token';
const USER_KEY  = 'pinkpower_mayoreo_user';
const TEL_KEY   = 'pinkpower_mayoreo_tel';

// ¿La admin tiene habilitados los catálogos para mayoristas? Se refresca en cada
// carga de sesión (enterMayoreo). Por defecto true: un fallo de red no oculta nada.
let catalogoHabilitado = true;

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
  // El flag de catálogos se pide en paralelo; no es crítico para entrar.
  const cfgPromise = fetchConfig().catch(() => null);
  let productos;
  try {
    productos = await fetchMayoreoProducts(token);
  } catch (e) {
    // Solo limpiamos la sesión si el token es inválido/vencido (401). Ante un
    // error transitorio (red, 502) la mantenemos para no desloguear sin querer.
    if (e && e.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    return;
  }
  const cfg = await cfgPromise;
  catalogoHabilitado = !cfg || cfg.catalogo_habilitado !== false;
  // Actualización directa (sin view-transition: chocaba con el cierre del modal
  // y dejaba la pantalla en el estado viejo hasta refrescar).
  document.body.classList.add('is-mayoreo');
  mountAccount(nombre);
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
      ${catalogoHabilitado ? '<a class="my-account__link" id="my-catalogo" href="/mi-catalogo/">🛍️ Mis catálogos</a>' : ''}
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
      ${catalogoHabilitado ? '<a class="my-drawer-account__catalogo" href="/mi-catalogo/">🛍️ Mis catálogos</a>' : ''}
      <button class="my-drawer-account__logout" id="my-drawer-logout">Cerrar sesión</button>`;
    panel.appendChild(block);
    block.querySelector('#my-drawer-logout').addEventListener('click', exitMayoreo);
  }
  block.querySelector('.my-drawer-account__name').textContent = nombre || 'Mayorista';
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
  const link = document.getElementById('mayoreo-access');
  if (link) link.addEventListener('click', e => { e.preventDefault(); openModal(); });
}

// Restaura la sesión guardada (se llama cuando el catálogo normal ya cargó).
export async function restoreMayoreo() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) await enterMayoreo(token, localStorage.getItem(USER_KEY) || '',
                                localStorage.getItem(TEL_KEY) || '');
}
