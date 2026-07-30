// Ficha de producto como PÁGINA dedicada (antes era un modal). Ocupa toda la
// pantalla con su propia barra superior (regresar + breadcrumb + carrito), la
// galería, la info con tallas, y una sección de productos relacionados. El
// catálogo queda debajo intacto, así al regresar se conserva la posición del
// scroll donde se hizo clic. La navegación (regresar/breadcrumb/carrito/tarjetas
// relacionadas) la maneja app.js por delegación; aquí solo va lo interno de la
// ficha (galería, tallas, agregar, compartir, visor de foto). La animación de
// entrada es puro CSS (se dispara al renderizar).
import { getState, setState } from './state.js';
import { addToCart, canAddNow } from './cart.js';
import { onAdded } from './aroma.js';
import { shareLink, productShareUrl } from './share.js';
import { productCardHTML } from './catalog.js';
import { lowStockLabel, variantStockNote } from './stock.js';

const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Crect fill='%231a0a0e' width='600' height='600'/%3E%3Ctext fill='%23e8437a' font-family='sans-serif' font-size='14' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EPinkPower HN%3C/text%3E%3C/svg%3E";

const PAGE_ID = 'product-page';

let _carouselIndex   = 0;
let _selectedVariant = null;
let _currentProduct  = null;
let _catalogScrollY  = 0;   // posición del catálogo para restaurarla al cerrar

// ── Abrir / cerrar ────────────────────────────────────────
// La ficha se muestra en el flujo del documento (usa el scroll del navegador, como
// el inicio), ocultando el catálogo mientras está abierta. Así la barra de scroll
// no la tapa el header y este puede quedar transparente igual que en el inicio. El
// catálogo queda en el DOM (oculto) para restaurar su posición exacta al regresar.
export function openProductPage(product) {
  _currentProduct  = product;
  _carouselIndex   = 0;
  // Con tallas reales NO se preselecciona ninguna: hay que elegir una antes de
  // agregar. Sin tallas (variante única) se usa la de siempre.
  _selectedVariant = hasRealVariants(product) ? null : getDefaultVariant(product);

  const page = document.getElementById(PAGE_ID);
  if (!page) return;

  // Al ENTRAR desde el catálogo (no al saltar entre relacionados) se guarda su
  // posición de scroll para restaurarla al cerrar.
  if (!document.body.classList.contains('pp-open')) _catalogScrollY = window.scrollY;

  // El header queda fijo encima; se deja su altura real para separar el contenido.
  const nav = document.querySelector('nav');
  page.style.setProperty('--nav-h', `${nav ? nav.offsetHeight : 72}px`);

  page.innerHTML = buildPageHTML(product);
  page.hidden = false;
  document.body.classList.add('pp-open');  // oculta el catálogo; la ficha usa el scroll del documento
  // 'instant' a propósito: sin behavior, el scroll respeta el `scroll-behavior:smooth`
  // global (index.html) y hace un desplazamiento suave hacia arriba que se veía como
  // si el detalle "subiera". Así el salto al inicio es inmediato.
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });   // la ficha empieza arriba
  setState({ modalProductId: product.id });

  wirePageEvents(page, product);
}

export function closeProductPage() {
  const page = document.getElementById(PAGE_ID);
  if (!page || page.hidden) return;
  closeLightbox();                         // por si quedó abierto el visor
  page.hidden = true;
  page.innerHTML = '';
  document.body.classList.remove('pp-open');   // vuelve a mostrar el catálogo
  // Instantáneo también aquí: restaura la posición exacta del catálogo sin el scroll
  // suave (que se vería como un deslizamiento al regresar).
  window.scrollTo({ top: _catalogScrollY, left: 0, behavior: 'instant' });   // restaura la posición del catálogo
  _currentProduct  = null;
  _selectedVariant = null;
  setState({ modalProductId: null });
}

export function isProductPageOpen() {
  const page = document.getElementById(PAGE_ID);
  return !!(page && !page.hidden);
}

// ── Datos / helpers ───────────────────────────────────────
function getDefaultVariant(product) {
  return product.variants.find(v => v.availableForSale) || product.variants[0] || null;
}

function hasRealVariants(product) {
  return product.variants.length > 1 ||
    (product.variants.length === 1 && product.variants[0].title !== 'Default Title');
}

// Colección "principal" del producto para el breadcrumb: la que se está viendo si
// el producto pertenece a ella; si no, la primera colección conocida del producto.
function primaryCollection(p) {
  const { collections, activeCollection } = getState();
  const known = new Map((collections || []).map(c => [c.handle, c]));
  let handle = null;
  if (activeCollection && p.collectionHandles.includes(activeCollection)) handle = activeCollection;
  else handle = (p.collectionHandles || []).find(h => known.has(h)) || null;
  const c = handle ? known.get(handle) : null;
  return c ? { handle: c.handle, title: c.title } : null;
}

// Productos relacionados: comparten colección (peso 2) o etiqueta (peso 1) con
// este. Se priorizan los disponibles y luego el puntaje. Máximo `limit`.
function relatedProducts(p, limit = 10) {
  const { products } = getState();
  const myColls = new Set(p.collectionHandles || []);
  const myTags  = new Set(p.tags || []);
  const scored = [];
  for (const q of products) {
    if (q.id === p.id) continue;
    let score = 0;
    for (const h of (q.collectionHandles || [])) if (myColls.has(h)) score += 2;
    for (const t of (q.tags || [])) if (myTags.has(t)) score += 1;
    if (score > 0) scored.push({ q, score });
  }
  scored.sort((a, b) =>
    (Number(b.q.availableForSale) - Number(a.q.availableForSale)) || (b.score - a.score));
  return scored.slice(0, limit).map(x => x.q);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const priceHN = n => n.toLocaleString('es-HN', { minimumFractionDigits: 2 });

// ── HTML: se arma por secciones para que se lea fácil ─────
function buildPageHTML(p) {
  return `
    <div class="pp-shell">
      ${buildTopbar(p)}
      <div class="pp-main">
        <div class="pp-gallery">${buildGallery(p)}</div>
        ${buildInfo(p)}
      </div>
      ${buildRelated(p)}
    </div>`;
}

function buildTopbar(p) {
  const cat = primaryCollection(p);
  // Solo el breadcrumb: la categoría hace de "volver". Va en <div>, NO en <nav>:
  // el CSS global `nav{position:fixed}` lo convertiría en una barra fija.
  return `
    <div class="pp-topbar">
      <div class="pp-breadcrumb" role="navigation" aria-label="Ruta de navegación">
        ${cat ? `<a href="#shop/collection/${encodeURIComponent(cat.handle)}" data-pp-nav>${esc(cat.title)}</a>
          <span class="pp-bc-sep" aria-hidden="true">›</span>` : ''}
        <span class="pp-bc-current" aria-current="page">${esc(p.title)}</span>
      </div>
    </div>`;
}

function buildGallery(p) {
  const soldOut = !p.availableForSale;
  const low = soldOut ? null : lowStockLabel(p);
  const badge = soldOut
    ? '<div class="modal-badge">Agotado</div>'
    : low ? `<div class="modal-badge modal-badge--low">${low}</div>` : '';
  return `
    <div class="modal-carousel">
      ${buildCarousel(p.images, p.title)}
      ${badge}
    </div>`;
}

function buildCarousel(images, title) {
  const slides = images.length
    ? images.map((img, i) => `
        <div class="carousel-slide${i === 0 ? ' is-active' : ''}" data-index="${i}">
          <img src="${img.url}" alt="${esc(img.altText || title)}"
               loading="${i === 0 ? 'eager' : 'lazy'}" onerror="this.src='${FALLBACK_IMG}'">
        </div>`).join('')
    : `<div class="carousel-slide is-active"><div class="carousel-placeholder"></div></div>`;

  const multi = images.length > 1;
  const arrows = multi ? `
    <button class="carousel-arrow carousel-arrow--prev" id="carousel-prev" aria-label="Anterior">&#8249;</button>
    <button class="carousel-arrow carousel-arrow--next" id="carousel-next" aria-label="Siguiente">&#8250;</button>` : '';
  const dots = multi ? `
    <div class="carousel-dots">
      ${images.map((_, i) => `<button class="carousel-dot${i === 0 ? ' is-active' : ''}" data-dot="${i}" aria-label="Imagen ${i + 1}"></button>`).join('')}
    </div>` : '';

  // El viewport recorta; el track es una fila (flex) que se desliza con translateX.
  // Tocar la foto la abre completa (no hace falta un botón, ya se intuye).
  return `<div class="carousel-viewport"><div class="carousel-track" id="carousel-track">${slides}</div></div>${arrows}${dots}`;
}

function buildInfo(p) {
  const soldOut = !p.availableForSale;
  const price   = priceHN(_selectedVariant?.price ?? p.price);
  const desc    = p.description ? `<p class="modal-description">${p.description}</p>` : '';

  const atLimit    = !soldOut && _selectedVariant ? isAtLimit(_selectedVariant) : false;
  const faltaTalla = !soldOut && hasRealVariants(p) && !_selectedVariant;
  const addBtn = soldOut
    ? `<button class="btn btn-primary" disabled>Agotado</button>`
    : faltaTalla
      ? `<button class="btn btn-primary" id="modal-add-btn" disabled>Elige una talla</button>`
      : `<button class="btn btn-primary" id="modal-add-btn"${atLimit ? ' disabled' : ''}>${atLimit ? 'Sin más stock' : 'Agregar al Carrito'}</button>`;

  return `
    <div class="pp-info modal-info">
      <p class="modal-product-name">${esc(p.title)}</p>
      ${p.productType ? `<p class="modal-product-type">${esc(p.productType)}</p>` : ''}
      <p class="modal-price" id="modal-price">L. ${price}</p>
      ${soldOut ? '<p class="modal-sold-out-label">Producto agotado</p>' : ''}
      ${desc}
      ${buildVariants(p)}
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
    </div>`;
}

function buildVariants(p) {
  if (!hasRealVariants(p)) return '';
  const opts = p.variants.map(v => `
    <button
      class="variant-btn${v.id === _selectedVariant?.id ? ' is-active' : ''}${!v.availableForSale ? ' is-unavailable' : ''}"
      data-variant-id="${v.id}" ${!v.availableForSale ? 'disabled' : ''}
    >${esc(v.title)}</button>`).join('');
  return `
    <div class="modal-variants">
      <p class="modal-variants__label">Talla / Variante</p>
      <div class="modal-variants__options">${opts}</div>
      <p class="modal-variant-stock" id="modal-variant-stock">${variantStockNote(_selectedVariant)}</p>
    </div>`;
}

function buildRelated(p) {
  const rel = relatedProducts(p);
  if (!rel.length) return '';
  return `
    <section class="pp-related">
      <h3 class="pp-related__title">También te puede gustar</h3>
      <div class="product-grid pp-related__grid">${rel.map(productCardHTML).join('')}</div>
    </section>`;
}

// ── Eventos internos de la ficha ──────────────────────────
function wirePageEvents(page, product) {
  page.querySelector('#carousel-prev')?.addEventListener('click', () => moveCarousel(-1, product));
  page.querySelector('#carousel-next')?.addEventListener('click', () => moveCarousel(+1, product));
  page.querySelectorAll('.carousel-dot').forEach(dot => {
    dot.addEventListener('click', () => setCarouselIndex(parseInt(dot.dataset.dot, 10), page));
  });

  const openFull = () => openLightbox(product, _carouselIndex);
  page.querySelectorAll('.carousel-slide img').forEach(img => img.addEventListener('click', openFull));

  // Deslizar con el dedo para cambiar de foto (móvil).
  const viewport = page.querySelector('.carousel-viewport');
  if (viewport && product.images.length > 1) {
    let x0 = null;
    viewport.addEventListener('touchstart', e => { x0 = e.changedTouches[0].clientX; }, { passive: true });
    viewport.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) moveCarousel(dx < 0 ? +1 : -1, product);
    }, { passive: true });
  }

  page.querySelectorAll('.variant-btn').forEach(btn => {
    btn.addEventListener('click', () => selectVariant(page, product, btn.dataset.variantId));
  });

  page.querySelector('#modal-add-btn')?.addEventListener('click', () => {
    if (!_currentProduct || !_selectedVariant) return;
    if (!canAddNow(_selectedVariant.id)) return;
    onAdded(_currentProduct, addToCart(_currentProduct, _selectedVariant));
    refreshAddBtn(page);
  });

  page.querySelector('#modal-share')?.addEventListener('click', () => {
    shareLink(productShareUrl(product.id), product.title);
  });
}

function selectVariant(page, product, variantId) {
  const variant = product.variants.find(v => v.id === variantId);
  if (!variant || !variant.availableForSale) return;
  _selectedVariant = variant;

  page.querySelectorAll('.variant-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.variantId === variantId));

  const priceEl = page.querySelector('#modal-price');
  if (priceEl) priceEl.textContent = `L. ${priceHN(variant.price)}`;
  const stockEl = page.querySelector('#modal-variant-stock');
  if (stockEl) stockEl.textContent = variantStockNote(variant);
  refreshAddBtn(page);
}

// ── Estado del botón agregar ──────────────────────────────
function isAtLimit(variant) {
  if (variant.inventoryQuantity === null) return false; // sin control = sin límite
  const inCart = getState().cart.find(i => i.variantId === variant.id);
  return (inCart ? inCart.quantity : 0) >= variant.inventoryQuantity;
}

function refreshAddBtn(page) {
  const btn = page.querySelector('#modal-add-btn');
  if (!btn || !_selectedVariant) return;
  const at = isAtLimit(_selectedVariant);
  btn.disabled = at;
  btn.textContent = at ? 'Sin más stock' : 'Agregar al Carrito';
}

// ── Carrusel ──────────────────────────────────────────────
function moveCarousel(dir, product) {
  const total = product.images.length;
  setCarouselIndex((_carouselIndex + dir + total) % total, document.getElementById(PAGE_ID));
}

function setCarouselIndex(index, page) {
  if (!page) return;
  _carouselIndex = index;
  const track = page.querySelector('#carousel-track');
  if (track) track.style.transform = `translateX(-${index * 100}%)`;
  page.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('is-active', i === index));
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
      <img src="${cur.url}" alt="${esc(cur.altText || product.title)}" onerror="this.src='${FALLBACK_IMG}'">
      ${multi ? `
        <button class="img-lightbox__arrow img-lightbox__arrow--prev" id="lb-prev" aria-label="Anterior">&#8249;</button>
        <button class="img-lightbox__arrow img-lightbox__arrow--next" id="lb-next" aria-label="Siguiente">&#8250;</button>
        <div class="img-lightbox__count">${idx + 1} / ${imgs.length}</div>` : ''}`;
    lb.querySelector('#lb-close').addEventListener('click', closeLightbox);
    lb.querySelector('#lb-prev')?.addEventListener('click', e => { e.stopPropagation(); go(-1); });
    lb.querySelector('#lb-next')?.addEventListener('click', e => { e.stopPropagation(); go(+1); });
    lb.querySelector('img').addEventListener('click', closeLightbox);
  };

  render();
  lb.hidden = false;
  lb.onclick = e => { if (e.target === lb) closeLightbox(); };

  let x0 = null;
  lb.ontouchstart = e => { x0 = e.changedTouches[0].clientX; };
  lb.ontouchend = e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (imgs.length > 1 && Math.abs(dx) > 45) go(dx < 0 ? +1 : -1);
  };

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
