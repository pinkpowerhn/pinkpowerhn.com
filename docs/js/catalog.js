import { getState, setState } from './state.js';
import { tokenize, buildCollMap, scoreProduct } from './search.js';
import { shareLink } from './share.js';

const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533'%3E%3Crect fill='%231a0a0e' width='400' height='533'/%3E%3Ctext fill='%23e8437a' font-family='sans-serif' font-size='13' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EPinkPower HN%3C/text%3E%3C/svg%3E";

// Scroll infinito: 24 productos al inicio y se cargan de a 24 conforme se baja.
const INITIAL = 24;
const BATCH = 24;
let _gridFiltered = [];   // lista filtrada actual (de donde se cargan más al bajar)
let _gridShown = 0;       // cuántas tarjetas hay puestas en la grilla
let _gridIO = null;       // IntersectionObserver del centinela del fondo

// ── Skeletons ─────────────────────────────────────────────
export function renderSkeletons(n = 8) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  grid.innerHTML = Array.from({ length: n }, () => `
    <div class="product-card product-card--skeleton">
      <div class="product-card__image skeleton"></div>
      <div class="product-card__info">
        <div class="skeleton skeleton--text" style="width:70%;height:1rem;margin-bottom:.5rem"></div>
        <div class="skeleton skeleton--text" style="width:40%;height:.85rem"></div>
      </div>
    </div>
  `).join('');
}

// ── Íconos de categoría ───────────────────────────────────
// Íconos de línea (heredan el color con currentColor → rosa del tema). Se eligen
// por el handle de la colección; si llega una colección nueva de Shopify sin
// ícono propio, se usa uno genérico de etiqueta.
const _svg = paths =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const COLLECTION_ICONS = {
  // Body Care & Fragancias — frasco con dosificador y destello
  'body-care-fragancias': _svg('<path d="M8 9.5h4.5a1.4 1.4 0 0 1 1.4 1.4v7.7a1.4 1.4 0 0 1-1.4 1.4H8a1.4 1.4 0 0 1-1.4-1.4v-7.7A1.4 1.4 0 0 1 8 9.5Z"/><path d="M9.6 9.5v-1.6h2.3"/><path d="M11.9 7.9V6.4h1.9"/><path d="M13.8 6.4v1.3"/><path d="M17.4 8.1l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4L15.5 10l1.4-.5.5-1.4Z"/>'),
  // Perfumes — frasco redondo con atomizador
  'perfumes': _svg('<circle cx="11.3" cy="15.1" r="5.2"/><path d="M9.6 10.1V8h3.4v2.1"/><path d="M10 8V6.2h2.6V8"/><path d="M13 7.1h2.5V5.4"/><circle cx="16.4" cy="4.7" r=".95"/><path d="M18 4h.01M18.4 5.5h.01"/>'),
  // Sets y Regalos — caja de regalo
  'sets-y-regalos': _svg('<path d="M5.5 9.6h13V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V9.6Z"/><path d="M4.3 7.2h15.4v2.4H4.3Z"/><path d="M12 7.2V20"/><path d="M12 7.2C12 7.2 10.6 4 8.7 4 7.5 4 7.1 5 7.1 5.7 7.1 7 9 7.2 12 7.2Z"/><path d="M12 7.2C12 7.2 13.4 4 15.3 4 16.5 4 16.9 5 16.9 5.7 16.9 7 15 7.2 12 7.2Z"/>'),
  // Hogar — casa con corazón
  'hogar': _svg('<path d="M4.5 11.2 12 5l7.5 6.2"/><path d="M6.2 10v9.3h11.6V10"/><path d="M12 17.3 10.1 15.5a1.25 1.25 0 0 1 1.77-1.77l.13.12.13-.12a1.25 1.25 0 0 1 1.77 1.77L12 17.3Z"/>'),
  // Ropa Interior — brassiere
  'lenceria': _svg('<path d="M3.5 8H20.5V9.4C17.5 10 15.3 11.6 14 14.4 13.2 16.1 12.7 16.8 12 16.8 11.3 16.8 10.8 16.1 10 14.4 8.7 11.6 6.5 10 3.5 9.4Z"/>'),
  // Hombres — busto de persona
  'hombres': _svg('<path d="M12 11.2A3.1 3.1 0 1 0 12 5a3.1 3.1 0 0 0 0 6.2Z"/><path d="M5.8 19.6c0-3.4 2.8-5.7 6.2-5.7s6.2 2.3 6.2 5.7"/>'),
  // Accesorios — bolso
  'accesorios': _svg('<path d="M5.3 9h13.4l-1 10.2a1 1 0 0 1-1 .9H7.3a1 1 0 0 1-1-.9L5.3 9Z"/><path d="M9 9V7.2a3 3 0 0 1 6 0V9"/>'),
  // Cuidado Íntimo y Afeitado — rastrillo
  'cuidado-intimo-y-afeitado': _svg('<path d="M7 4.5h10a1 1 0 0 1 1 1V8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"/><path d="M8 9v1.2M10 9v1.2M12 9v1.2M14 9v1.2M16 9v1.2"/><path d="M11.2 10.4h1.6v8.4a.8.8 0 0 1-1.6 0V10.4Z"/>'),
  // Ropa Deportiva — mancuerna
  'ropa-deportiva': _svg('<path d="M7 8.5v7M9.3 6.8v10.4M14.7 6.8v10.4M17 8.5v7"/><path d="M9.3 12h5.4"/>'),
};

const ICON_DEFAULT = _svg('<path d="M20.6 13.4 13.4 20.6a1.5 1.5 0 0 1-2.1 0L4 13.2V5a1 1 0 0 1 1-1h8.2l7.4 7.3a1.5 1.5 0 0 1 0 2.1Z"/><path d="M8 8h.01"/>');

function iconFor(handle) {
  return COLLECTION_ICONS[handle] || ICON_DEFAULT;
}

// Subcategorías definidas a mano por colección, a pedido del cliente. Cuando una
// colección está aquí, se muestran EXACTAMENTE estas etiquetas (las presentes) y
// en este orden, sin la detección automática. Así el cliente controla la lista y
// el orden, y se excluye todo lo demás.
const SUBCAT_ORDER = {
  'body-care-fragancias': [
    'Splash', 'Cremas', 'Jabones', 'Exfoliantes',
    'Aceites y Serums', 'Afeitado', 'Antibacteriales', 'Mini Body Care',
  ],
  'perfumes': ['Perfumes', 'Mini Perfumes', 'Decants'],
  'sets-y-regalos': ['Sets Mini', 'Sets Body Care', 'Sets de Perfume'],
  'hogar': ['Velas Aromáticas', 'Spray Ambiental', 'Fragancia Ambiental de Pared', 'Fragancias para Carro'],
  'lenceria': ['Panties', 'Brassieres', 'Set de Lencería'],
  'hombres': ['Perfumes', 'Body Spray', 'Cremas', 'Jabones', 'Antibacteriales', 'Mini Body Care', 'Mini Perfumes'],
  // Nota: la última etiqueta es "Candelabro para Velas" en Shopify (la clienta la
  // llama "Candelabros"). Se usa el nombre real para que calce con los productos.
  'accesorios': ['Bolsos y Carteras', 'Llaveros y Monederos', 'Maquillaje', 'Holder para Antibacterial', 'Difusores para Carro', 'Difusores Ambientales de Pared', 'Candelabro para Velas'],
};

// ── Sidebar — Colecciones (con etiquetas desplegables) ────
// Top level = Colecciones. Click en una colección la expande y muestra sus
// etiquetas. Todo dinámico desde Shopify — no hay nada hardcoded.
export function renderCollectionSidebar(collections) {
  const sidebar = document.getElementById('collection-sidebar');
  if (!sidebar) return;

  const { activeCollection, activeTag, products, productsLoaded } = getState();

  // Conteo global de cada etiqueta (en cuántos productos aparece en toda la
  // tienda). Sirve para medir la "contención": qué parte de los productos de una
  // etiqueta vive dentro de una colección. Una etiqueta cuyos productos viven casi
  // todos aquí es "propia" de la colección; si está repartida (p. ej. un holder de
  // Accesorios etiquetado con el producto que sostiene) no es propia y no se cuela.
  const globalTag = {};
  for (const p of products)
    for (const t of new Set(p.tags || [])) globalTag[t] = (globalTag[t] || 0) + 1;

  // ── Build sidebar HTML ──
  // Las colecciones van directo (sin título "Colecciones" ni botón "Todos":
  // hacer clic en una colección ya muestra todos sus productos).
  const sections = [];

  for (const c of collections) {
    const isOpen = activeCollection === c.handle;
    sections.push(`
      <button class="collection-btn${isOpen ? ' is-active' : ''}" data-handle="${c.handle}" aria-expanded="${isOpen}">
        <span class="collection-ic">${iconFor(c.handle)}</span>
        <span class="collection-name">${c.title}</span>
        <span class="collection-chevron" aria-label="${isOpen ? 'Minimizar' : 'Desplegar'}">${isOpen ? '−' : '+'}</span>
      </button>
    `);

    if (isOpen) {
      // Qué etiquetas mostrar en el submenú de esta colección.
      //
      // Hay dos tipos de colección y se detectan solos (sin nombres fijos):
      //  • De categoría (Accesorios, Hogar, Perfumes…): sus productos ya quedan
      //    cubiertos por sus etiquetas "propias" (las que casi solo viven aquí).
      //    Mostramos solo esas, para no colar etiquetas ajenas — p. ej. en
      //    Accesorios los "holders" llevan también la etiqueta del producto que
      //    sostienen, pero esa etiqueta vive mayormente en otra colección.
      //  • Transversal (Hombres): sus propias cubren muy poco porque agrupa por
      //    público, no por categoría. Ahí el filtro útil es la categoría real de
      //    cada producto (Cremas, Jabones, Sets de Perfume…), así que mostramos
      //    todas las subcategorías presentes.
      // En ambos casos se oculta la etiqueta que está sobre casi todos los
      // productos (no filtra nada útil, p. ej. "Hombre" dentro de Hombres).
      const prodsInC = products.filter(p => p.collectionHandles.includes(c.handle));
      const sizeC = prodsInC.length || 1;
      const countInC = {};
      for (const p of prodsInC) for (const t of new Set(p.tags || [])) countInC[t] = (countInC[t] || 0) + 1;

      const NATIVE = 0.85;   // contención mínima para que una etiqueta sea "propia"
      const esTrivial = t => countInC[t] >= 0.9 * sizeC;

      // Propias: casi todos sus productos (en toda la tienda) viven en esta
      // colección. Una etiqueta puede ser propia de más de una colección a la vez
      // (p. ej. "Sets de Perfume" es propia de Perfumes y de Sets y Regalos).
      const propias = new Set(
        Object.keys(countInC).filter(t => !esTrivial(t) && countInC[t] / globalTag[t] >= NATIVE));
      const cubiertos = prodsInC.filter(p => (p.tags || []).some(t => propias.has(t))).length;
      const bienCubierta = cubiertos / sizeC >= 0.6;

      let tagsInCollection;
      const ordenManual = SUBCAT_ORDER[c.handle];
      if (ordenManual) {
        // Lista manual del cliente: exactamente estas etiquetas, en este orden.
        // Se muestran todas (la lista es curada) sin depender de cuántos productos
        // hayan cargado ya, para que no falte ninguna mientras la tienda carga.
        tagsInCollection = ordenManual.slice();
      } else {
        tagsInCollection = bienCubierta
          ? [...propias].sort()
          : Object.keys(countInC).filter(t => !esTrivial(t)).sort();
        // Salvaguarda para colecciones chicas (p. ej. 1–2 productos): si quedó
        // vacía pero sí hay etiquetas, las mostramos (mejor que "Sin etiquetas").
        if (!tagsInCollection.length) tagsInCollection = Object.keys(countInC).sort();
      }

      if (tagsInCollection.length) {
        sections.push(`
          <div class="tag-group">
            ${tagsInCollection.map(t => `
              <button class="tag-btn${activeTag === t ? ' is-active' : ''}" data-tag="${escapeAttr(t)}">${t}</button>
            `).join('')}
          </div>
        `);
      } else {
        sections.push(`<p class="tag-group tag-group--empty">${productsLoaded ? 'Sin etiquetas' : 'Cargando…'}</p>`);
      }
    }
  }

  // (Las tallas se muestran ahora en el toolbar superior, solo en ropa interior;
  //  el filtro de precio se quitó del menú a pedido del cliente.)

  sidebar.innerHTML = sections.join('');
}

// ── Barra de tallas en el toolbar (solo en la categoría de ropa interior) ──
function isLingerieCollection(handle, collections) {
  if (!handle) return false;
  if (handle === 'lenceria') return true;
  const c = (collections || []).find(c => c.handle === handle);
  return /lencer|ropa\s*interior|interior/i.test(c?.title || '');
}

export function renderSizeBar(collections) {
  const bar = document.getElementById('size-filter-bar');
  if (!bar) return;

  const { activeCollection, activeTag, activeSize, products } = getState();

  // Mostramos las tallas cuando se está viendo ropa interior, ya sea:
  //  a) por la colección de lencería directamente, o
  //  b) por una etiqueta cuyos productos viven mayormente en lencería
  //     (p. ej. compartir el link de la etiqueta "Panties").
  let pool = [];
  if (isLingerieCollection(activeCollection, collections)) {
    pool = products.filter(p => p.collectionHandles.includes(activeCollection));
  } else if (activeTag) {
    const tagged = products.filter(p => (p.tags || []).includes(activeTag));
    const lingerieHandles = collections
      .filter(c => isLingerieCollection(c.handle, collections))
      .map(c => c.handle);
    const inLingerie = tagged.filter(p =>
      p.collectionHandles.some(h => lingerieHandles.includes(h))
    );
    // Si la mayoría de los productos con esa etiqueta son de lencería → tallas
    if (tagged.length && inLingerie.length / tagged.length >= 0.5) {
      pool = tagged;
    }
  }

  if (!pool.length) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  // Tallas disponibles en esos productos
  const sizes = [...new Set(
    pool
      .flatMap(p => p.variants.map(v => v.title))
      .filter(t => t && t.toLowerCase() !== 'default title')
  )].sort(bySizeOrder);

  if (!sizes.length) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  bar.hidden = false;
  bar.innerHTML = `
    <span class="size-filter-bar__label">Talla:</span>
    ${sizes.map(s => `
      <button class="size-btn${activeSize === s ? ' is-active' : ''}" data-size="${escapeAttr(s)}">${s}</button>
    `).join('')}
  `;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Orden lógico de tallas (XS, S, M, L, XL, XXL…), no alfabético
function sizeRank(title) {
  const k = String(title).trim().toLowerCase()
    .replace('extra small', 'xs')
    .replace('extra large', 'xl')
    .replace('small', 's')
    .replace('medium', 'm')
    .replace('large', 'l');
  const order = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'];
  const i = order.indexOf(k);
  return i === -1 ? 999 : i;
}

function bySizeOrder(a, b) {
  const ra = sizeRank(a), rb = sizeRank(b);
  if (ra !== rb) return ra - rb;
  // Tallas no estándar (p. ej. numéricas) → orden natural
  return a.localeCompare(b, undefined, { numeric: true });
}

// ── Price range slider ────────────────────────────────────
// Dos <input type=range> superpuestos. Mientras se arrastra solo se repinta
// el relleno y la etiqueta (evento input, sin setState para no perder el
// arrastre). Al soltar (change) se aplica el filtro.
function wirePriceSlider(root) {
  const wrap = root.querySelector('.price-range');
  if (!wrap) return;

  const lo    = parseFloat(wrap.dataset.lo);
  const hi    = parseFloat(wrap.dataset.hi);
  const minI  = root.querySelector('#price-range-min');
  const maxI  = root.querySelector('#price-range-max');
  const fill  = root.querySelector('#price-range-fill');
  const label = root.querySelector('#price-range-label');
  if (!minI || !maxI || !fill || !label) return;

  const span = (hi - lo) || 1;
  const fmt  = n => Math.round(n).toLocaleString('es-HN');

  function paint() {
    const a = Math.min(parseFloat(minI.value), parseFloat(maxI.value));
    const b = Math.max(parseFloat(minI.value), parseFloat(maxI.value));
    fill.style.left  = ((a - lo) / span) * 100 + '%';
    fill.style.right = (100 - ((b - lo) / span) * 100) + '%';
    label.textContent = `L. ${fmt(a)} — L. ${fmt(b)}`;
  }

  minI.addEventListener('input', () => {
    if (parseFloat(minI.value) > parseFloat(maxI.value)) minI.value = maxI.value;
    paint();
  });
  maxI.addEventListener('input', () => {
    if (parseFloat(maxI.value) < parseFloat(minI.value)) maxI.value = minI.value;
    paint();
  });

  const apply = () => {
    const a = parseFloat(minI.value);
    const b = parseFloat(maxI.value);
    setState({
      priceMin: a <= lo ? null : a,   // en el extremo = sin tope
      priceMax: b >= hi ? null : b,
      currentPage: 1,
    });
  };
  minI.addEventListener('change', apply);
  maxI.addEventListener('change', apply);

  paint();
}

// ── Product grid ──────────────────────────────────────────
// ── Indicador de filtros activos ──────────────────────────
function _esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function activeFilterList(collections, st) {
  const out = [];
  if (st.searchQuery) out.push({ key: 'search', label: `Búsqueda: "${st.searchQuery}"` });
  if (st.activeCollection) {
    const c = (collections || []).find(x => x.handle === st.activeCollection);
    out.push({ key: 'collection', label: `Categoría: ${c ? c.title : st.activeCollection}` });
  }
  if (st.activeTag)  out.push({ key: 'tag',  label: st.activeTag });
  if (st.activeSize) out.push({ key: 'size', label: `Talla: ${st.activeSize}` });
  if (st.priceMin != null || st.priceMax != null) {
    const a = st.priceMin != null ? `L.${st.priceMin}` : '0';
    const b = st.priceMax != null ? `L.${st.priceMax}` : 'máx';
    out.push({ key: 'price', label: `Precio: ${a}–${b}` });
  }
  return out;
}

export function renderActiveFilters(collections) {
  const cont = document.getElementById('active-filters');
  if (!cont) return;
  const st = getState();
  const list = activeFilterList(collections, st);
  if (!list.length) { cont.hidden = true; cont.innerHTML = ''; return; }
  cont.hidden = false;
  let html =
    `<span class="active-filters__label">Filtros activos:</span>` +
    list.map(f => `<button class="filter-chip" data-clear="${f.key}">${_esc(f.label)}<span class="filter-chip__x" aria-hidden="true">×</span></button>`).join('') +
    `<button class="filter-chip filter-chip--all" data-clear="all">Limpiar todo</button>`;
  // Si hay una búsqueda activa, ofrecer compartir ese grupo de productos por link.
  if (st.searchQuery) {
    html += `<button class="filter-share" id="share-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="10.7" x2="15.4" y2="6.3"></line><line x1="8.6" y1="13.3" x2="15.4" y2="17.7"></line></svg>
      Compartir esta búsqueda</button>`;
  }
  cont.innerHTML = html;
  cont.querySelectorAll('[data-clear]').forEach(b =>
    b.addEventListener('click', () => clearFilter(b.dataset.clear)));
  const sh = cont.querySelector('#share-search');
  if (sh) sh.addEventListener('click', () => {
    const q = getState().searchQuery;
    const url = `${location.origin}${location.pathname}#shop/search/${encodeURIComponent(q)}`;
    shareLink(url, `Mirá estos productos (${q}) en PinkPower HN`);
  });
}

export function clearFilter(key) {
  const patch = { currentPage: 1 };
  if (key === 'all') {
    Object.assign(patch, { activeCollection: null, activeTag: null, activeSize: null, priceMin: null, priceMax: null, searchQuery: '' });
    _clearSearchInputs();
  } else if (key === 'search') { patch.searchQuery = ''; _clearSearchInputs(); }
  else if (key === 'collection') patch.activeCollection = null;
  else if (key === 'tag')  patch.activeTag = null;
  else if (key === 'size') patch.activeSize = null;
  else if (key === 'price') { patch.priceMin = null; patch.priceMax = null; }
  setState(patch);
  syncCatalogHash();   // que la URL refleje los filtros que quedaron (no re-aplicar al refrescar)
}

// Pone la URL acorde a la colección/etiqueta activas. Se llama tras acciones del
// usuario que cambian filtros (no en la carga inicial, para no pisar la ruta).
export function syncCatalogHash() {
  const { activeCollection, activeTag, searchQuery } = getState();
  const h = searchQuery ? `#shop/search/${encodeURIComponent(searchQuery)}`
          : activeTag ? `#shop/tag/${encodeURIComponent(activeTag)}`
          : activeCollection ? `#shop/collection/${activeCollection}`
          : '#shop';
  if (location.hash.startsWith('#shop') && !location.hash.includes('/product/') && location.hash !== h) {
    history.replaceState(null, '', h);
  }
}

function _clearSearchInputs() {
  document.querySelectorAll('#search-input, #search-overlay input').forEach(i => { i.value = ''; });
}

export function renderProductGrid(products, collections, activeCollection, searchQuery) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  renderActiveFilters(collections);

  const { activeSize, activeTag, priceMin, priceMax, sortBy, currentPage, productsLoaded, hideSoldOut } = getState();
  let filtered = filterProducts(products, collections, activeCollection, searchQuery, activeSize, activeTag, priceMin, priceMax);

  // Ocultar agotados si la admin activó esa opción (temporal, desde el panel).
  if (hideSoldOut) filtered = filtered.filter(p => p.availableForSale);

  // Orden por precio (el orden por relevancia ya lo da el filtro de búsqueda)
  if (sortBy === 'price-asc') {
    filtered = [...filtered].sort((a, b) => a.price - b.price);
  } else if (sortBy === 'price-desc') {
    filtered = [...filtered].sort((a, b) => b.price - a.price);
  }

  // Los agotados siempre al final (sin alterar el orden dentro de cada grupo:
  // Array.sort es estable, así que se respeta el orden por precio/relevancia).
  filtered = [...filtered].sort((a, b) =>
    (a.availableForSale === b.availableForSale) ? 0 : (a.availableForSale ? -1 : 1));

  if (!filtered.length) {
    // Si todavía hay productos cargando en background, mostrar skeleton
    // (no "No se encontraron productos") — puede que solo no hayan llegado aún.
    if (!productsLoaded) {
      renderSkeletons(8);
      const rc = document.getElementById('result-count');
      if (rc) rc.textContent = '';
      _teardownSentinel();
      return;
    }
    updateResultCount(0);
    const hayFiltros = activeFilterList(collections, getState()).length > 0;
    grid.innerHTML = hayFiltros
      ? `<div class="shop-empty"><p>No hay productos con los filtros activos.</p>
           <button class="btn btn-primary" data-clear="all">Limpiar filtros</button></div>`
      : `<div class="shop-empty"><p>No se encontraron productos.</p></div>`;
    grid.querySelector('[data-clear="all"]')?.addEventListener('click', () => clearFilter('all'));
    _teardownSentinel();
    return;
  }

  updateResultCount(filtered.length);

  // Scroll infinito: se muestran 24 y el resto se carga al bajar.
  _gridFiltered = filtered;
  _gridShown = Math.min(INITIAL, filtered.length);
  grid.innerHTML = filtered.slice(0, _gridShown).map(p => productCardHTML(p)).join('');
  _setupInfinite();
}

// ── Scroll infinito ───────────────────────────────────────
// Quita el centinela y desconecta el observer.
function _teardownSentinel() {
  if (_gridIO) { _gridIO.disconnect(); _gridIO = null; }
  document.querySelectorAll('#grid-sentinel, #pagination').forEach(n => n.remove());
}

// Carga el siguiente lote de productos al fondo de la grilla (sin recargarla).
function _loadMore() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  if (_gridShown >= _gridFiltered.length) { _teardownSentinel(); return; }
  const next = _gridFiltered.slice(_gridShown, _gridShown + BATCH);
  grid.insertAdjacentHTML('beforeend', next.map(productCardHTML).join(''));
  _gridShown += next.length;
  if (_gridShown >= _gridFiltered.length) _teardownSentinel();
}

// Coloca un centinela debajo de la grilla; al acercarse, carga más.
function _setupInfinite() {
  _teardownSentinel();
  if (_gridShown >= _gridFiltered.length) return;   // ya están todos

  const main = document.querySelector('.shop-main');
  if (!main) return;
  const el = document.createElement('div');
  el.id = 'grid-sentinel';
  el.className = 'grid-sentinel';
  el.innerHTML = '<span class="grid-spinner" aria-hidden="true"></span>';
  main.appendChild(el);

  // Sin IntersectionObserver (navegador viejo): mostrar todo de una.
  if (!('IntersectionObserver' in window)) {
    const grid = document.getElementById('product-grid');
    if (grid) grid.insertAdjacentHTML('beforeend',
      _gridFiltered.slice(_gridShown).map(productCardHTML).join(''));
    _gridShown = _gridFiltered.length;
    el.remove();
    return;
  }
  _gridIO = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) _loadMore();
  }, { rootMargin: '700px 0px' });
  _gridIO.observe(el);
}

// Un producto tiene variantes "reales" (tallas/opciones a elegir) si tiene más de
// una variante, o una sola que no sea la genérica "Default Title". En esos casos
// no se agrega directo al carrito: hay que elegir la talla primero (se abre el
// modal). Así no se cuela un pedido sin talla.
export function tieneVariantesReales(p) {
  const vs = p.variants || [];
  return vs.length > 1 || (vs.length === 1 && vs[0].title !== 'Default Title');
}

function productCardHTML(p) {
  const img      = p.images[0];
  const soldOut  = !p.availableForSale;
  const price    = p.price.toLocaleString('es-HN', { minimumFractionDigits: 2 });
  const imgSrc   = img ? img.url : FALLBACK_IMG;
  const imgAlt   = img ? (img.altText || p.title) : p.title;
  // Productos con talla: el botón lleva a elegir talla (abre el modal), no agrega.
  const addLabel = !soldOut && tieneVariantesReales(p) ? 'Elegir talla' : 'Agregar';

  // Aviso "pocas unidades" a nivel de PRODUCTO: se suman las existencias de todas
  // las tallas disponibles, no se toma el mínimo de una sola. Antes un set con
  // S=1, M=2, L=2 mostraba "Solo queda 1" aunque en total había 5. Si alguna talla
  // disponible no lleva control de inventario, se trata como ilimitada y no se marca.
  const availableVariants = p.variants.filter(v => v.availableForSale);
  const anyUntracked = availableVariants.some(v => v.inventoryQuantity === null);
  const totalStock = anyUntracked
    ? null
    : availableVariants.reduce((s, v) => s + v.inventoryQuantity, 0);
  const lowStock = !soldOut && totalStock !== null && totalStock > 0 && totalStock <= 3;

  return `
    <article class="product-card${soldOut ? ' product-card--sold-out' : ''}" data-id="${p.id}">
      <div class="product-card__image">
        <img
          src="${imgSrc}"
          alt="${imgAlt}"
          loading="lazy"
          width="400"
          height="533"
          onerror="this.src='${FALLBACK_IMG}'"
        />
        ${soldOut
          ? '<div class="product-card__badge">Agotado</div>'
          : lowStock
            ? `<div class="product-card__badge product-card__badge--low">${totalStock === 1 ? 'Solo queda 1' : `Últimas ${totalStock}`}</div>`
            : ''}
        <div class="product-card__overlay">
          ${!soldOut
            ? `<button class="btn btn-primary" data-action="add-to-cart" data-id="${p.id}">${addLabel}</button>`
            : ''}
        </div>
      </div>
      <div class="product-card__info">
        <p class="product-card__name">${p.title}</p>
        <p class="product-card__type">${p.productType || ''}</p>
        <p class="product-card__price">L. ${price}</p>
        ${!soldOut
          ? `<button class="btn btn-primary product-card__mobile-add" data-action="add-to-cart" data-id="${p.id}">${addLabel}</button>`
          : `<button class="btn product-card__mobile-add product-card__mobile-add--sold" disabled>Agotado</button>`}
      </div>
    </article>
  `;
}

// ── Filter — pure function ────────────────────────────────
export function filterProducts(products, collections, activeCollection, searchQuery, activeSize, activeTag, priceMin = null, priceMax = null) {
  let result = products;

  if (activeCollection) {
    result = result.filter(p => p.collectionHandles.includes(activeCollection));
  }

  if (priceMin != null) {
    result = result.filter(p => p.price >= priceMin);
  }

  if (priceMax != null) {
    result = result.filter(p => p.price <= priceMax);
  }

  if (activeTag) {
    result = result.filter(p => (p.tags || []).includes(activeTag));
  }

  if (searchQuery) {
    const tokens = tokenize(searchQuery);
    if (tokens.length) {
      const collMap = buildCollMap(collections);
      // Puntuar, descartar los que no coinciden y ORDENAR por relevancia
      // (antes solo se filtraba → la coincidencia exacta quedaba enterrada).
      result = result
        .map(p => ({ p, s: scoreProduct(p, tokens, collMap) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.p);
    }
  }

  if (activeSize) {
    // Solo productos donde ESA talla está realmente disponible (con stock),
    // no basta con que la variante exista.
    result = result.filter(p =>
      p.variants.some(v =>
        v.title === activeSize &&
        v.availableForSale &&
        (v.inventoryQuantity === null || v.inventoryQuantity > 0)
      )
    );
  }

  return result;
}

function updateResultCount(n) {
  const el = document.getElementById('result-count');
  if (el) el.textContent = `${n} producto${n !== 1 ? 's' : ''}`;
}

// ── Collection showcase ("Diseñado para ti") ──────────────
// Renders one random product image per collection into #collections-grid
export function renderCollectionShowcase(collections, products) {
  const grid = document.getElementById('collections-grid');
  if (!grid) return;
  if (!collections.length || !products.length) return;

  // Take up to 3 collections that have at least one product with an image
  const cards = [];
  for (const col of collections) {
    if (cards.length === 3) break;
    const members = products.filter(p =>
      p.collectionHandles.includes(col.handle) && p.images.length > 0
    );
    if (!members.length) continue;

    // Pick a random member
    const pick = members[Math.floor(Math.random() * members.length)];
    cards.push({ col, pick });
  }

  if (!cards.length) return;

  grid.innerHTML = cards.map(({ col, pick }) => {
    const img    = pick.images[0];
    const target = `#shop/collection/${col.handle}`;
    return `
      <div class="card" data-collection="${col.handle}" style="cursor:pointer">
        <img
          class="card-bg"
          src="${img.url}"
          alt="${img.altText || pick.title}"
          loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.add('card-bg-fallback')"
        />
        <div class="card-content">
          <p class="card-cat">${pick.title}</p>
          <p class="card-name">${col.title}</p>
          <a href="${target}" class="card-link">Ver Colección</a>
        </div>
      </div>
    `;
  }).join('');

  // Clicking a showcase card navigates to that collection in the shop
  grid.querySelectorAll('.card[data-collection]').forEach(card => {
    card.addEventListener('click', () => {
      const handle = card.dataset.collection;
      setState({ activeCollection: handle });
      history.pushState(null, '', `#shop/collection/${handle}`);
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}
