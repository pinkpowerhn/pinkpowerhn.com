import { getState, setState } from './state.js';

const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533'%3E%3Crect fill='%231a0a0e' width='400' height='533'/%3E%3Ctext fill='%23e8437a' font-family='sans-serif' font-size='13' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EPinkPower HN%3C/text%3E%3C/svg%3E";

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

// ── Collection sidebar ────────────────────────────────────
export function renderCollectionSidebar(collections) {
  const sidebar = document.getElementById('collection-sidebar');
  if (!sidebar) return;

  const { activeCollection } = getState();

  const allBtn = `<button class="collection-btn${!activeCollection ? ' is-active' : ''}" data-handle="">Todos</button>`;
  const btns = collections.map(c => `
    <button class="collection-btn${activeCollection === c.handle ? ' is-active' : ''}" data-handle="${c.handle}">
      ${c.title}
    </button>
  `).join('');

  sidebar.innerHTML = `<p class="sidebar-label">Colecciones</p>${allBtn}${btns}`;
}

// ── Product grid ──────────────────────────────────────────
export function renderProductGrid(products, collections, activeCollection, searchQuery) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  const filtered = filterProducts(products, collections, activeCollection, searchQuery);

  updateResultCount(filtered.length);

  if (!filtered.length) {
    grid.innerHTML = `<div class="shop-empty"><p>No se encontraron productos.</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => productCardHTML(p)).join('');
}

function productCardHTML(p) {
  const img     = p.images[0];
  const soldOut = !p.availableForSale;
  const price   = p.price.toLocaleString('es-HN', { minimumFractionDigits: 2 });
  const imgSrc  = img ? img.url : FALLBACK_IMG;
  const imgAlt  = img ? (img.altText || p.title) : p.title;

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
        ${soldOut ? '<div class="product-card__badge">Agotado</div>' : ''}
        <div class="product-card__overlay">
          ${!soldOut
            ? `<button class="btn btn-primary" data-action="add-to-cart" data-id="${p.id}">Agregar</button>`
            : ''}
          <button class="btn btn-outline" data-action="quick-view" data-id="${p.id}">Ver Detalle</button>
        </div>
      </div>
      <div class="product-card__info">
        <p class="product-card__name">${p.title}</p>
        <p class="product-card__price">L. ${price}</p>
      </div>
    </article>
  `;
}

// ── Filter — pure function ────────────────────────────────
export function filterProducts(products, collections, activeCollection, searchQuery) {
  let result = products;

  if (activeCollection) {
    const col = collections.find(c => c.handle === activeCollection);
    if (col) {
      const ids = new Set(col.productIds);
      result = result.filter(p => ids.has(p.id));
    }
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(p => p.title.toLowerCase().includes(q));
  }

  return result;
}

function updateResultCount(n) {
  const el = document.getElementById('result-count');
  if (el) el.textContent = `${n} producto${n !== 1 ? 's' : ''}`;
}
