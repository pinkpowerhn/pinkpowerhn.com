import { getState, setState } from './state.js';
import { addToCart } from './cart.js';

const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Crect fill='%231a0a0e' width='600' height='600'/%3E%3Ctext fill='%23e8437a' font-family='sans-serif' font-size='14' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EPinkPower HN%3C/text%3E%3C/svg%3E";

let _carouselIndex  = 0;
let _selectedVariant = null;
let _currentProduct  = null;

// ── Open ──────────────────────────────────────────────────
export function openModal(product) {
  _currentProduct  = product;
  _carouselIndex   = 0;
  _selectedVariant = getDefaultVariant(product);

  const modal = document.getElementById('product-modal');
  if (!modal) return;

  modal.innerHTML = buildModalHTML(product);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setState({ modalProductId: product.id });

  wireModalEvents(modal, product);

  // Focus the close button
  const closeBtn = modal.querySelector('#modal-close');
  if (closeBtn) closeBtn.focus();
}

// ── Close ─────────────────────────────────────────────────
export function closeModal() {
  const modal = document.getElementById('product-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  _currentProduct  = null;
  _selectedVariant = null;
  setState({ modalProductId: null });
}

// ── Helpers ───────────────────────────────────────────────
function getDefaultVariant(product) {
  return product.variants.find(v => v.availableForSale) || product.variants[0] || null;
}

function hasRealVariants(product) {
  return product.variants.length > 1 ||
    (product.variants.length === 1 && product.variants[0].title !== 'Default Title');
}

// ── Build HTML ────────────────────────────────────────────
function buildModalHTML(p) {
  const soldOut = !p.availableForSale;
  const price   = (_selectedVariant?.price ?? p.price)
    .toLocaleString('es-HN', { minimumFractionDigits: 2 });

  // Carousel
  const slides = p.images.length
    ? p.images.map((img, i) => `
        <div class="carousel-slide${i === 0 ? ' is-active' : ''}" data-index="${i}">
          <img
            src="${img.url}"
            alt="${img.altText || p.title}"
            loading="${i === 0 ? 'eager' : 'lazy'}"
            onerror="this.src='${FALLBACK_IMG}'"
          />
        </div>
      `).join('')
    : `<div class="carousel-slide is-active"><div class="carousel-placeholder"></div></div>`;

  const arrows = p.images.length > 1 ? `
    <button class="carousel-arrow carousel-arrow--prev" id="carousel-prev" aria-label="Anterior">&#8249;</button>
    <button class="carousel-arrow carousel-arrow--next" id="carousel-next" aria-label="Siguiente">&#8250;</button>
  ` : '';

  const dots = p.images.length > 1 ? `
    <div class="carousel-dots">
      ${p.images.map((_, i) => `
        <button class="carousel-dot${i === 0 ? ' is-active' : ''}" data-dot="${i}" aria-label="Imagen ${i + 1}"></button>
      `).join('')}
    </div>
  ` : '';

  // Variants
  const variantSection = hasRealVariants(p) ? `
    <div class="modal-variants">
      <p class="modal-variants__label">Talla / Variante</p>
      <div class="modal-variants__options">
        ${p.variants.map(v => `
          <button
            class="variant-btn${v.id === _selectedVariant?.id ? ' is-active' : ''}${!v.availableForSale ? ' is-unavailable' : ''}"
            data-variant-id="${v.id}"
            ${!v.availableForSale ? 'disabled' : ''}
          >${v.title}</button>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Description — hidden if empty
  const descSection = p.description
    ? `<p class="modal-description">${p.description}</p>`
    : '';

  const atLimit = !soldOut && _selectedVariant
    ? isAtLimit(_selectedVariant)
    : false;

  const addBtn = soldOut
    ? `<button class="btn btn-primary" disabled>Agotado</button>`
    : `<button class="btn btn-primary" id="modal-add-btn"${atLimit ? ' disabled' : ''}>
        ${atLimit ? 'Límite alcanzado' : 'Agregar al Carrito'}
       </button>`;

  return `
    <div class="modal-backdrop" id="modal-backdrop"></div>
    <div class="modal-panel">
      <button class="modal-close" id="modal-close" aria-label="Cerrar">&times;</button>
      <div class="modal-body">

        <!-- Carousel -->
        <div class="modal-carousel">
          <div class="carousel-track" id="carousel-track">${slides}</div>
          ${arrows}
          ${dots}
        </div>

        <!-- Info -->
        <div class="modal-info">
          <p class="modal-product-name">${p.title}</p>
          <p class="modal-price" id="modal-price">L. ${price}</p>
          ${soldOut ? '<p class="modal-sold-out-label">Producto agotado</p>' : ''}
          ${descSection}
          ${variantSection}
          <div class="modal-actions">${addBtn}</div>
        </div>

      </div>
    </div>
  `;
}

// ── Wire events ───────────────────────────────────────────
function wireModalEvents(modal, product) {
  modal.querySelector('#modal-close')   ?.addEventListener('click', closeModal);
  modal.querySelector('#modal-backdrop')?.addEventListener('click', closeModal);

  modal.querySelector('#carousel-prev')?.addEventListener('click', () => moveCarousel(-1, product));
  modal.querySelector('#carousel-next')?.addEventListener('click', () => moveCarousel(+1, product));

  modal.querySelectorAll('.carousel-dot').forEach(dot => {
    dot.addEventListener('click', () => setCarouselIndex(parseInt(dot.dataset.dot, 10), modal, product));
  });

  modal.querySelectorAll('.variant-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const variant = product.variants.find(v => v.id === btn.dataset.variantId);
      if (!variant || !variant.availableForSale) return;
      _selectedVariant = variant;

      modal.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      const priceEl = modal.querySelector('#modal-price');
      if (priceEl) {
        priceEl.textContent = `L. ${variant.price.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`;
      }
      refreshAddBtn(modal);
    });
  });

  modal.querySelector('#modal-add-btn')?.addEventListener('click', () => {
    if (!_currentProduct || !_selectedVariant) return;
    addToCart(_currentProduct, _selectedVariant);
    refreshAddBtn(modal);
  });

  // Focus trap
  const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])';
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    const nodes = [...modal.querySelectorAll(FOCUSABLE)];
    if (!nodes.length) return;
    const first = nodes[0];
    const last  = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });
}

// ── Add button state ──────────────────────────────────────
function isAtLimit(variant) {
  if (variant.inventoryQuantity === null) return false; // untracked = no limit
  const cart = getState().cart;
  const inCart = cart.find(i => i.variantId === variant.id);
  const qty = inCart ? inCart.quantity : 0;
  return qty >= variant.inventoryQuantity;
}

function refreshAddBtn(modal) {
  const btn = modal.querySelector('#modal-add-btn');
  if (!btn || !_selectedVariant) return;
  const at = isAtLimit(_selectedVariant);
  btn.disabled = at;
  btn.textContent = at ? 'Límite alcanzado' : 'Agregar al Carrito';
}

// ── Carousel ──────────────────────────────────────────────
function moveCarousel(dir, product) {
  const total = product.images.length;
  const modal = document.getElementById('product-modal');
  setCarouselIndex((_carouselIndex + dir + total) % total, modal, product);
}

function setCarouselIndex(index, modal, product) {
  if (!modal) return;
  _carouselIndex = index;

  modal.querySelectorAll('.carousel-slide').forEach((s, i) => {
    s.classList.toggle('is-active', i === index);
  });
  modal.querySelectorAll('.carousel-dot').forEach((d, i) => {
    d.classList.toggle('is-active', i === index);
  });
}
