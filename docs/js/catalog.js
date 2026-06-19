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
      // Solo las etiquetas que de verdad le corresponden a esta colección
      // (las que computeTagAssignments asignó a c.handle).
      const tagsInCollection = [...new Set(
        products
          .filter(p => p.collectionHandles.includes(c.handle))
          .flatMap(p => p.tags || [])
      )].filter(t => tagAssignment[t] === c.handle).sort();

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

  const { activeCollection, activeSize, products } = getState();

  if (!isLingerieCollection(activeCollection, collections)) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  // Tallas disponibles en los productos de esa colección
  const sizes = [...new Set(
    products
      .filter(p => p.collectionHandles.includes(activeCollection))
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
export function renderProductGrid(products, collections, activeCollection, searchQuery) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

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
    grid.innerHTML = `<div class="shop-empty"><p>No se encontraron productos.</p></div>`;
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
      result = result.filter(p => scoreProduct(p, tokens, collMap) > 0);
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
