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

// Icono de bolsita de compras para el botón "Agregar al Carrito".
const BAG_SVG = `<svg class="btn-bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`;

// Llamita para la franja naranja de "pocas unidades" (va rellena de blanco).
const FIRE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 23a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 14 5 16a7 7 0 0 0 7 7z"></path></svg>`;

// Íconos de confianza (línea inferior de la ficha): envío, originalidad y pago.
const TRUST = [
  { label: 'Envíos a todo Honduras', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="14" height="12" rx="1"></rect><path d="M15 8h4l3 3v5h-7z"></path><circle cx="5.5" cy="18.5" r="2"></circle><circle cx="18" cy="18.5" r="2"></circle></svg>` },
  { label: 'Productos 100% originales', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"></circle><path d="m9.5 8.7 1.8 1.8 3.2-3.4"></path><path d="M8.5 14.2 7 22l5-2.6L17 22l-1.5-7.8"></path></svg>` },
  { label: 'Pago seguro', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 11.5 2 2 4-4"></path></svg>` },
];

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
  // Botón de compartir flotante sobre la foto (esquina inferior derecha, estilo Amazon).
  // El aviso de "pocas unidades" ya NO va encima de la foto: ahora es una franja
  // naranja debajo del precio (ver buildInfo), para dejar la foto limpia.
  const shareFloat = `
    <button class="pp-share-float" id="pp-share-float" type="button" aria-label="Compartir producto">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>
        <line x1="8.6" y1="10.7" x2="15.4" y2="6.3"></line><line x1="8.6" y1="13.3" x2="15.4" y2="17.7"></line>
      </svg>
    </button>`;
  return `
    <div class="modal-carousel">
      ${buildCarousel(p.images, p.title)}
      ${shareFloat}
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

// Convierte el descriptionHtml de Shopify en texto plano CONSERVANDO los saltos
// de párrafo (los <p> y <br> pasan a saltos de línea reales). Se pinta luego con
// textContent + CSS white-space: pre-line, así respetamos el espaciado que la
// dueña escribe en Shopify sin inyectar HTML (cero riesgo de XSS). Si no hay
// HTML, cae al texto plano tal cual.
function descriptionToText(html, plain) {
  if (!html) return plain || '';
  let s = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')                 // <br> -> salto
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|tr)\s*>/gi, '\n') // fin de bloque -> salto
    .replace(/<[^>]+>/g, '');                            // fuera el resto de etiquetas
  // Decodifica entidades (&aacute;, &amp;, …) de forma segura: el textarea nunca
  // ejecuta nada, solo devuelve el texto en .value.
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  s = ta.value;
  return s
    .replace(/ /g, ' ')      // &nbsp; -> espacio normal
    .replace(/[ \t]+\n/g, '\n')   // sin espacios colgando al final de línea
    .replace(/\n{3,}/g, '\n\n')   // máximo una línea en blanco entre párrafos
    .trim();
}

function buildInfo(p) {
  const soldOut = !p.availableForSale;
  const price   = priceHN(_selectedVariant?.price ?? p.price);
  // Descripción al FINAL de la ficha, en un recuadro rosa con florecita. Se recorta
  // a 2 líneas y, si sobra texto, aparece "Ver más" (con chevron) debajo para
  // desplegarla. El botón solo se muestra si realmente se desborda (wirePageEvents).
  const desc = (p.descriptionHtml || p.description) ? `
    <div class="modal-desc-wrap">
      <div class="modal-description" id="modal-desc"><span class="modal-desc-flower" aria-hidden="true">🌸</span><span class="modal-desc-text" id="modal-desc-text"></span></div>
      <button class="modal-desc-toggle" id="modal-desc-toggle" type="button" hidden>
        <span class="modal-desc-toggle__txt">Ver más</span>
        <svg class="modal-desc-toggle__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
    </div>` : '';

  const atLimit    = !soldOut && _selectedVariant ? isAtLimit(_selectedVariant) : false;
  const faltaTalla = !soldOut && hasRealVariants(p) && !_selectedVariant;
  // Botón con icono de bolsita al inicio y la etiqueta en un <span> aparte (así se
  // puede cambiar el texto sin borrar el icono).
  const bagBtn = (label, id, disabled) =>
    `<button class="btn btn-primary"${id ? ` id="${id}"` : ''}${disabled ? ' disabled' : ''}>${BAG_SVG}<span class="btn-label">${label}</span></button>`;
  const addBtn = soldOut
    ? bagBtn('Agotado', null, true)
    : faltaTalla
      ? bagBtn('Elige una talla', 'modal-add-btn', true)
      : bagBtn(atLimit ? 'Sin más stock' : 'Agregar al Carrito', 'modal-add-btn', atLimit);

  // Franja naranja de "pocas unidades", debajo del precio (antes iba encima de la foto).
  const low = soldOut ? null : lowStockLabel(p);
  const stockBanner = low
    ? `<p class="modal-stock-banner">${FIRE_SVG}<span>${low === 'Solo queda 1' ? '¡Solo queda 1 disponible!' : `¡${esc(low)} disponibles!`}</span></p>`
    : '';

  // Íconos de confianza (envío / originalidad / pago) al pie de la ficha.
  const trust = `
    <ul class="pp-trust">
      ${TRUST.map(t => `<li class="pp-trust__item">${t.svg}<span>${t.label}</span></li>`).join('')}
    </ul>`;

  return `
    <div class="pp-info modal-info">
      <p class="modal-product-name">${esc(p.title)}</p>
      ${p.productType ? `<p class="modal-product-type">${esc(p.productType)}</p>` : ''}
      <p class="modal-price" id="modal-price">L. ${price}</p>
      ${soldOut ? '<p class="modal-sold-out-label">Producto agotado</p>' : ''}
      ${stockBanner}
      ${buildVariants(p)}
      <div class="modal-actions">
        ${addBtn}
      </div>
      ${trust}
      ${desc}
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

  // Compartir: solo el icono flotante sobre la foto (el botón cuadrado de abajo se quitó).
  page.querySelector('#pp-share-float')?.addEventListener('click', () => {
    shareLink(productShareUrl(product.id), product.title);
  });

  // Descripción "Ver más / Ver menos": el botón solo aparece si el texto se
  // desborda del recorte; al tocarlo, despliega o vuelve a colapsar.
  const descEl = page.querySelector('#modal-desc');
  const descToggle = page.querySelector('#modal-desc-toggle');
  const descWrap = page.querySelector('.modal-desc-wrap');
  const descText = page.querySelector('#modal-desc-text');
  if (descText) {
    // textContent (no innerHTML): respeta los saltos con CSS pre-line y evita XSS.
    descText.textContent = descriptionToText(product.descriptionHtml, product.description);
  }
  if (descEl && descToggle && descWrap) {
    // Recortada a 2 líneas; si el texto se desborda, se muestra "Ver más".
    if (descEl.scrollHeight - descEl.clientHeight > 4) descToggle.hidden = false;
    descToggle.addEventListener('click', () => {
      const expanded = descWrap.classList.toggle('is-expanded');
      descToggle.classList.toggle('is-expanded', expanded);   // rota el chevron
      const txt = descToggle.querySelector('.modal-desc-toggle__txt');
      if (txt) txt.textContent = expanded ? 'Ver menos' : 'Ver más';
    });
  }
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
  const label = btn.querySelector('.btn-label');
  if (label) label.textContent = at ? 'Sin más stock' : 'Agregar al Carrito';
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
