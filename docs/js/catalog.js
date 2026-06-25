import { getState, setState } from './state.js';
import { tokenize, buildCollMap, scoreProduct } from './search.js';

const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533'%3E%3Crect fill='%231a0a0e' width='400' height='533'/%3E%3Ctext fill='%23e8437a' font-family='sans-serif' font-size='13' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EPinkPower HN%3C/text%3E%3C/svg%3E";

const PAGE_SIZE = 20;

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

// ── Sidebar — Colecciones (con etiquetas desplegables) ────
// Top level = Colecciones. Click en una colección la expande y muestra sus
// etiquetas. Todo dinámico desde Shopify — no hay nada hardcoded.
export function renderCollectionSidebar(collections) {
  const sidebar = document.getElementById('collection-sidebar');
  if (!sidebar) return;

  const { activeCollection, activeTag, products, productsLoaded } = getState();

  // Cada etiqueta se asigna a UNA colección (la que de verdad le corresponde)
  // para que no se cuele en submenús ajenos. Ver computeTagAssignments.
  const tagAssignment = computeTagAssignments(products, collections);

  // ── Build sidebar HTML ──
  // Las colecciones van directo (sin título "Colecciones" ni botón "Todos":
  // hacer clic en una colección ya muestra todos sus productos).
  const sections = [];

  for (const c of collections) {
    const isOpen = activeCollection === c.handle;
    sections.push(`
      <button class="collection-btn${isOpen ? ' is-active' : ''}" data-handle="${c.handle}" aria-expanded="${isOpen}">
        <span class="collection-name">${c.title}</span>
        <span class="collection-chevron" aria-label="${isOpen ? 'Minimizar' : 'Desplegar'}">${isOpen ? '−' : '+'}</span>
      </button>
    `);

    if (isOpen) {
      // Qué etiquetas mostrar en el submenú de esta colección.
      //
      // Hay dos tipos de colección y se detectan solos (sin nombres fijos):
      //  • De categoría (Accesorios, Hogar, Ropa…): sus propios productos ya
      //    están cubiertos por sus etiquetas "propias". Mostramos solo esas, para
      //    no colar etiquetas ajenas (p. ej. en Accesorios los "holders" llevan
      //    también la etiqueta del producto que sostienen — eso no debe salir).
      //  • Transversal (Hombres, Sets…): sus etiquetas propias cubren poco; el
      //    filtro útil es la categoría real de cada producto (Perfumes, Cremas…),
      //    cuyo hogar es otra colección. Ahí mostramos las categorías presentes.
      // En ambos casos se ocultan las etiquetas que están sobre casi todos los
      // productos (no filtran nada útil, p. ej. "Hombre" dentro de Hombres).
      const prodsInC = products.filter(p => p.collectionHandles.includes(c.handle));
      const sizeC = prodsInC.length || 1;
      const countInC = {};
      for (const p of prodsInC) for (const t of (p.tags || [])) countInC[t] = (countInC[t] || 0) + 1;

      const esTrivial = t => countInC[t] >= 0.9 * sizeC;
      const propias = new Set(
        Object.keys(countInC).filter(t => tagAssignment[t] === c.handle && !esTrivial(t)));
      const cubiertos = prodsInC.filter(p => (p.tags || []).some(t => propias.has(t))).length;
      const bienCubierta = cubiertos / sizeC >= 0.6;

      const tagsInCollection = bienCubierta
        ? [...propias].sort()
        : Object.keys(countInC)
            .filter(t => !esTrivial(t) && countInC[t] >= 2 && countInC[t] / sizeC >= 0.08)
            .sort();

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

// Asigna cada etiqueta a UNA sola colección: aquella donde vive casi toda
// su "gente". Si casi todos los productos con la etiqueta T están dentro de la
// colección C (contención ≥ 85%), T le pertenece a C. Si T califica para varias
// colecciones, gana la más específica (la más pequeña). Si no llega al umbral en
// ninguna pero su mayor concentración es razonable (≥ 50%), se asigna a esa; si
// está muy repartida (marca, promos), no se muestra en ningún submenú.
function computeTagAssignments(products, collections) {
  const THRESHOLD   = 0.85; // "casi todos"
  const MIN_FALLBACK = 0.6;  // concentración mínima para el respaldo (un 50/50
                             // se considera transversal y no se muestra)

  // Tamaño de cada colección (para elegir la más específica en empates)
  const collSize = {};
  for (const c of collections) {
    collSize[c.handle] = products.filter(p => p.collectionHandles.includes(c.handle)).length;
  }

  // Productos por etiqueta
  const byTag = {};
  for (const p of products) {
    for (const t of (p.tags || [])) {
      (byTag[t] || (byTag[t] = [])).push(p);
    }
  }

  const assignment = {};
  for (const [tag, prods] of Object.entries(byTag)) {
    const total = prods.length;
    let best = null;            // mayor contención (para el respaldo)
    const qualifying = [];      // colecciones que superan el umbral

    for (const c of collections) {
      const inC = prods.filter(p => p.collectionHandles.includes(c.handle)).length;
      const containment = inC / total;
      if (containment >= THRESHOLD) {
        qualifying.push({ handle: c.handle, size: collSize[c.handle] });
      }
      if (!best || containment > best.containment) {
        best = { handle: c.handle, containment };
      }
    }

    if (qualifying.length) {
      // La más específica = la colección con menos productos
      qualifying.sort((a, b) => a.size - b.size);
      assignment[tag] = qualifying[0].handle;
    } else if (best && best.containment >= MIN_FALLBACK) {
      assignment[tag] = best.handle;
    } else {
      assignment[tag] = null; // etiqueta transversal → no se muestra en submenús
    }
  }
  return assignment;
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
  const list = activeFilterList(collections, getState());
  if (!list.length) { cont.hidden = true; cont.innerHTML = ''; return; }
  cont.hidden = false;
  cont.innerHTML =
    `<span class="active-filters__label">Filtros activos:</span>` +
    list.map(f => `<button class="filter-chip" data-clear="${f.key}">${_esc(f.label)}<span class="filter-chip__x" aria-hidden="true">×</span></button>`).join('') +
    `<button class="filter-chip filter-chip--all" data-clear="all">Limpiar todo</button>`;
  cont.querySelectorAll('[data-clear]').forEach(b =>
    b.addEventListener('click', () => clearFilter(b.dataset.clear)));
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
  const { activeCollection, activeTag } = getState();
  const h = activeTag ? `#shop/tag/${encodeURIComponent(activeTag)}`
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

  const { activeSize, activeTag, priceMin, priceMax, sortBy, currentPage, productsLoaded } = getState();
  let filtered = filterProducts(products, collections, activeCollection, searchQuery, activeSize, activeTag, priceMin, priceMax);

  // Orden por precio (el orden por relevancia ya lo da el filtro de búsqueda)
  if (sortBy === 'price-asc') {
    filtered = [...filtered].sort((a, b) => a.price - b.price);
  } else if (sortBy === 'price-desc') {
    filtered = [...filtered].sort((a, b) => b.price - a.price);
  }

  if (!filtered.length) {
    // Si todavía hay productos cargando en background, mostrar skeleton
    // (no "No se encontraron productos") — puede que solo no hayan llegado aún.
    if (!productsLoaded) {
      renderSkeletons(8);
      const rc = document.getElementById('result-count');
      if (rc) rc.textContent = '';
      renderPagination(0, 1);
      return;
    }
    updateResultCount(0);
    const hayFiltros = activeFilterList(collections, getState()).length > 0;
    grid.innerHTML = hayFiltros
      ? `<div class="shop-empty"><p>No hay productos con los filtros activos.</p>
           <button class="btn btn-primary" data-clear="all">Limpiar filtros</button></div>`
      : `<div class="shop-empty"><p>No se encontraron productos.</p></div>`;
    grid.querySelector('[data-clear="all"]')?.addEventListener('click', () => clearFilter('all'));
    renderPagination(0, 1);
    return;
  }

  updateResultCount(filtered.length);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, currentPage || 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  grid.innerHTML = slice.map(p => productCardHTML(p)).join('');
  renderPagination(totalPages, page);
}

// ── Pagination ────────────────────────────────────────────
function renderPagination(totalPages, current) {
  const main = document.querySelector('.shop-main');
  if (!main) return;

  // Defensa: eliminar cualquier #pagination huérfano fuera de .shop-main
  // (puede pasar si una versión anterior del JS lo dejó en otro lugar)
  document.querySelectorAll('#pagination').forEach(node => {
    if (!main.contains(node)) node.remove();
  });

  let el = main.querySelector('#pagination');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pagination';
    el.className = 'pagination';
    el.setAttribute('role', 'navigation');
    el.setAttribute('aria-label', 'Paginación');
    main.appendChild(el);
  } else if (el.parentElement !== main || main.lastElementChild !== el) {
    // Re-anclar como último hijo de .shop-main (debajo del grid)
    main.appendChild(el);
  }

  if (totalPages <= 1) { el.innerHTML = ''; return; }

  // Truncated page list: 1 … (c-1) c (c+1) … last
  const pages = new Set([1, totalPages, current, current - 1, current + 1]);
  const list = [...pages].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  const items = [];
  items.push(`<button class="page-btn page-nav" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>`);
  let prev = 0;
  for (const n of list) {
    if (n - prev > 1) items.push(`<span class="page-ellipsis">…</span>`);
    items.push(`<button class="page-btn${n === current ? ' is-active' : ''}" data-page="${n}">${n}</button>`);
    prev = n;
  }
  items.push(`<button class="page-btn page-nav" data-page="${current + 1}" ${current === totalPages ? 'disabled' : ''} aria-label="Siguiente">›</button>`);

  el.innerHTML = items.join('');
}

function productCardHTML(p) {
  const img      = p.images[0];
  const soldOut  = !p.availableForSale;
  const price    = p.price.toLocaleString('es-HN', { minimumFractionDigits: 2 });
  const imgSrc   = img ? img.url : FALLBACK_IMG;
  const imgAlt   = img ? (img.altText || p.title) : p.title;

  // Low-stock: any available variant with tracked inventory ≤ 5
  const availableVariants = p.variants.filter(v => v.availableForSale && v.inventoryQuantity !== null);
  const minStock = availableVariants.length
    ? Math.min(...availableVariants.map(v => v.inventoryQuantity))
    : null;
  const lowStock = !soldOut && minStock !== null && minStock <= 3;

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
            ? `<div class="product-card__badge product-card__badge--low">${minStock === 1 ? 'Solo queda 1' : `Últimas ${minStock}`}</div>`
            : ''}
        <div class="product-card__overlay">
          ${!soldOut
            ? `<button class="btn btn-primary" data-action="add-to-cart" data-id="${p.id}">Agregar</button>`
            : ''}
        </div>
      </div>
      <div class="product-card__info">
        <p class="product-card__name">${p.title}</p>
        <p class="product-card__type">${p.productType || ''}</p>
        <p class="product-card__price">L. ${price}</p>
        ${!soldOut
          ? `<button class="btn btn-primary product-card__mobile-add" data-action="add-to-cart" data-id="${p.id}">Agregar</button>`
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
