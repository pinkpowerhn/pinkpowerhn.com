import { getState, setState } from './state.js';

const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533'%3E%3Crect fill='%231a0a0e' width='400' height='533'/%3E%3Ctext fill='%23e8437a' font-family='sans-serif' font-size='13' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EPinkPower HN%3C/text%3E%3C/svg%3E";

const PAGE_SIZE = 10;

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

  const { activeCollection, activeTag, activeSize, products } = getState();

  // ── Build sidebar HTML ──
  const sections = [];

  // Botón "Todos" + colecciones (acordeón). Las 4 aparecen de inmediato,
  // independiente de cuántos productos hayan cargado en background.
  const noFilter = !activeCollection && !activeTag;
  sections.push(`
    <p class="sidebar-label">Colecciones</p>
    <button class="collection-btn${noFilter ? ' is-active' : ''}" data-handle="">Todos</button>
  `);

  for (const c of collections) {
    const isOpen = activeCollection === c.handle;
    sections.push(`
      <button class="collection-btn${isOpen ? ' is-active' : ''}" data-handle="${c.handle}" aria-expanded="${isOpen}">
        ${c.title}
        <span class="collection-chevron" aria-hidden="true">${isOpen ? '−' : '+'}</span>
      </button>
    `);

    if (isOpen) {
      // Etiquetas de los productos cargados que pertenecen a esta colección
      const tagsInCollection = [...new Set(
        products
          .filter(p => p.collectionHandles.includes(c.handle))
          .flatMap(p => p.tags || [])
      )].sort();

      if (tagsInCollection.length) {
        sections.push(`
          <div class="tag-group">
            <button class="tag-btn${!activeTag ? ' is-active' : ''}" data-tag="">Todas</button>
            ${tagsInCollection.map(t => `
              <button class="tag-btn${activeTag === t ? ' is-active' : ''}" data-tag="${escapeAttr(t)}">${t}</button>
            `).join('')}
          </div>
        `);
      } else {
        sections.push(`<p class="tag-group tag-group--empty">Sin etiquetas todavía</p>`);
      }
    }
  }

  // Tallas (filtro paralelo — solo aparece si algún producto tiene variantes)
  const sizes = [...new Set(
    products.flatMap(p => p.variants.map(v => v.title))
           .filter(t => t && t.toLowerCase() !== 'default title')
  )].sort();
  if (sizes.length) {
    sections.push(`
      <p class="sidebar-label" style="margin-top:1.4rem;">Tallas</p>
      <div class="size-filter">
        ${sizes.map(s => `
          <button class="size-btn${activeSize === s ? ' is-active' : ''}" data-size="${escapeAttr(s)}">${s}</button>
        `).join('')}
      </div>
    `);
  }

  sidebar.innerHTML = sections.join('');
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Product grid ──────────────────────────────────────────
export function renderProductGrid(products, collections, activeCollection, searchQuery) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  const { activeSize, activeTag, currentPage } = getState();
  const filtered = filterProducts(products, collections, activeCollection, searchQuery, activeSize, activeTag);

  updateResultCount(filtered.length);

  if (!filtered.length) {
    grid.innerHTML = `<div class="shop-empty"><p>No se encontraron productos.</p></div>`;
    renderPagination(0, 1);
    return;
  }

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
            ? `<div class="product-card__badge product-card__badge--low">Últimas ${minStock}</div>`
            : ''}
        <div class="product-card__overlay">
          ${!soldOut
            ? `<button class="btn btn-primary" data-action="add-to-cart" data-id="${p.id}">Agregar</button>`
            : ''}
        </div>
      </div>
      <div class="product-card__info">
        <p class="product-card__name">${p.title}</p>
        <p class="product-card__price">L. ${price}</p>
        ${!soldOut
          ? `<button class="btn btn-primary product-card__mobile-add" data-action="add-to-cart" data-id="${p.id}">Agregar</button>`
          : ''}
      </div>
    </article>
  `;
}

// ── Filter — pure function ────────────────────────────────
export function filterProducts(products, collections, activeCollection, searchQuery, activeSize, activeTag) {
  let result = products;

  if (activeCollection) {
    result = result.filter(p => p.collectionHandles.includes(activeCollection));
  }

  if (activeTag) {
    result = result.filter(p => (p.tags || []).includes(activeTag));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(p => p.title.toLowerCase().includes(q));
  }

  if (activeSize) {
    result = result.filter(p =>
      p.variants.some(v => v.title === activeSize)
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
