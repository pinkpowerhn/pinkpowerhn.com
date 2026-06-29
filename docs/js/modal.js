import { getState, setState } from './state.js';
import { addToCart, canAddNow } from './cart.js';
import { showToast } from './toast.js';
import { onAdded } from './aroma.js';
import { shareLink, productShareUrl } from './share.js';

const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Crect fill='%231a0a0e' width='600' height='600'/%3E%3Ctext fill='%23e8437a' font-family='sans-serif' font-size='14' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EPinkPower HN%3C/text%3E%3C/svg%3E";

let _carouselIndex  = 0;
let _selectedVariant = null;
let _currentProduct  = null;

// ── Open ──────────────────────────────────────────────────
export function openModal(product) {
  _currentProduct  = product;
  _carouselIndex   = 0;
  // Con tallas reales NO se preselecciona ninguna: la clienta debe elegir una
  // antes de poder agregar. Sin tallas (variante única), se usa la de siempre.
  _selectedVariant = hasRealVariants(product) ? null : getDefaultVariant(product);

  const modal = document.getElementById('product-modal');
  if (!modal) return;

  modal.innerHTML = buildModalHTML(product);
  modal.classList.remove('is-closing');
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

  closeLightbox(); // por si quedó abierto el visor de foto

  const panel = modal.querySelector('.modal-panel');

  const finish = () => {
    panel?.removeEventListener('animationend', finish);
    modal.classList.remove('is-closing');
    modal.hidden = true;
    document.body.style.overflow = '';
    _currentProduct  = null;
    _selectedVariant = null;
    setState({ modalProductId: null });
  };

  if (panel) {
    modal.classList.add('is-closing'); // dispara la animación de salida
    panel.addEventListener('animationend', finish);
  } else {
    finish();
  }
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

  // Aviso de stock (mismo criterio que la tarjeta), arriba a la derecha de la foto
  const availVars = p.variants.filter(v => v.availableForSale && v.inventoryQuantity !== null);
  const minStock  = availVars.length ? Math.min(...availVars.map(v => v.inventoryQuantity)) : null;
  const lowStock  = !soldOut && minStock !== null && minStock <= 3;
  const badgeHTML = soldOut
    ? '<div class="modal-badge">Agotado</div>'
    : lowStock
      ? `<div class="modal-badge modal-badge--low">${minStock === 1 ? 'Solo queda 1' : `Últimas ${minStock}`}</div>`
      : '';

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

  // Botón para ver la foto completa (sin recorte). Por defecto la foto se muestra
  // recortada para llenar el recuadro; al tocar este botón se ve la imagen entera.
  const fitBtn = p.images.length ? `
    <button class="carousel-fit" id="carousel-fit" type="button" aria-label="Ver la foto completa">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>
      </svg>
      <span class="carousel-fit__txt">Ver completa</span>
    </button>
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

  // Falta elegir talla: el producto tiene variantes reales y aún no hay una
  // seleccionada. El botón queda deshabilitado pidiendo elegir talla.
  const faltaTalla = !soldOut && hasRealVariants(p) && !_selectedVariant;

  const addBtn = soldOut
    ? `<button class="btn btn-primary" disabled>Agotado</button>`
    : faltaTalla
      ? `<button class="btn btn-primary" id="modal-add-btn" disabled>Elige una talla</button>`
      : `<button class="btn btn-primary" id="modal-add-btn"${atLimit ? ' disabled' : ''}>
          ${atLimit ? 'Sin más stock' : 'Agregar al Carrito'}
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
          ${fitBtn}
          ${badgeHTML}
        </div>

        <!-- Info -->
        <div class="modal-info">
          <p class="modal-product-name">${p.title}</p>
          ${p.productType ? `<p class="modal-product-type">${p.productType}</p>` : ''}
          <p class="modal-price" id="modal-price">L. ${price}</p>
          ${soldOut ? '<p class="modal-sold-out-label">Producto agotado</p>' : ''}
          ${descSection}
          ${variantSection}
          <div class="modal-actions">
            ${addBtn}
            <button class="btn btn-outline modal-share" id="modal-share" type="button" aria-label="Compartir producto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>
                <line x1="8.6" y1="10.7" x2="15.4" y2="6.3"></line><line x1="8.6" y1="13.3" x2="15.4" y2="17.7"></line>
              </svg>
              Compartir
            </button>
          </div>
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

  // Ver la foto completa: al tocar la imagen (o el botón) se abre a pantalla
  // completa en un visor aparte, sin alterar el tamaño del modal.
  const openFull = () => openLightbox(product, _carouselIndex);
  modal.querySelector('#carousel-fit')?.addEventListener('click', openFull);
  modal.querySelectorAll('.carousel-slide img').forEach(img => {
    img.addEventListener('click', openFull);
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
    if (!canAddNow(_selectedVariant.id)) return; // ignora clics muy seguidos
    onAdded(_currentProduct, addToCart(_currentProduct, _selectedVariant));
    refreshAddBtn(modal);
  });

  modal.querySelector('#modal-share')?.addEventListener('click', () => {
    // Link que muestra la foto del producto en la vista previa al compartir.
    shareLink(productShareUrl(product.id), product.title);
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
  btn.textContent = at ? 'Sin más stock' : 'Agregar al Carrito';
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

// ── Visor de foto a pantalla completa (lightbox) ──────────
function openLightbox(product, startIndex) {
  const imgs = product.images || [];
  if (!imgs.length) return;
  let idx = startIndex || 0;

  let lb = document.getElementById('img-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'img-lightbox';
    lb.className = 'img-lightbox';
    document.body.appendChild(lb);
  }

  const go = d => { idx = (idx + d + imgs.length) % imgs.length; render(); };

  const render = () => {
    const multi = imgs.length > 1;
    const cur = imgs[idx];
    lb.innerHTML = `
      <button class="img-lightbox__close" id="lb-close" aria-label="Cerrar">&times;</button>
      <img src="${cur.url}" alt="${cur.altText || product.title}" onerror="this.src='${FALLBACK_IMG}'">
      ${multi ? `
        <button class="img-lightbox__arrow img-lightbox__arrow--prev" id="lb-prev" aria-label="Anterior">&#8249;</button>
        <button class="img-lightbox__arrow img-lightbox__arrow--next" id="lb-next" aria-label="Siguiente">&#8250;</button>
        <div class="img-lightbox__count">${idx + 1} / ${imgs.length}</div>
      ` : ''}
    `;
    lb.querySelector('#lb-close').addEventListener('click', closeLightbox);
    lb.querySelector('#lb-prev')?.addEventListener('click', e => { e.stopPropagation(); go(-1); });
    lb.querySelector('#lb-next')?.addEventListener('click', e => { e.stopPropagation(); go(+1); });
    // Tocar la imagen cierra el visor (zoom-out)
    lb.querySelector('img').addEventListener('click', closeLightbox);
  };

  render();
  lb.hidden = false;

  // Tocar el fondo cierra
  lb.onclick = e => { if (e.target === lb) closeLightbox(); };

  // Deslizar para cambiar de foto (móvil)
  let x0 = null;
  lb.ontouchstart = e => { x0 = e.changedTouches[0].clientX; };
  lb.ontouchend = e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (imgs.length > 1 && Math.abs(dx) > 45) go(dx < 0 ? +1 : -1);
  };

  // Teclado (escritorio)
  lb._onKey = e => {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') go(+1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', lb._onKey);
}

function closeLightbox() {
  const lb = document.getElementById('img-lightbox');
  if (!lb) return;
  lb.hidden = true;
  lb.innerHTML = '';
  if (lb._onKey) { document.removeEventListener('keydown', lb._onKey); lb._onKey = null; }
}
