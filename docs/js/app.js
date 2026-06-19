import { initState, getState, setState, on } from './state.js';
import { showToast } from './toast.js';
import { fetchProductsPage, fetchCollections, fetchConfig, checkHealth, postOrder } from './api.js';
import { renderSkeletons, renderCollectionSidebar, renderProductGrid, renderSizeBar } from './catalog.js';
import { openModal, closeModal } from './modal.js';
import { searchProducts } from './search.js';
import { shareLink, siteUrl } from './share.js';
import { addToCart, removeFromCart, updateQuantity, clearCart, updateCartBadge, buildWhatsAppUrl } from './cart.js';

// iOS Safari solo aplica el estado :active (feedback al tocar) si existe
// algún listener de touch. Este listener vacío lo habilita en todo el sitio.
document.addEventListener('touchstart', () => {}, { passive: true });

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initState();
  updateCartBadge();
  renderSkeletons(12);

  // El splash se muestra su tiempo mínimo y luego se oculta dejando ver el
  // skeleton del grid mientras los productos terminan de cargar.
  hideSplash();

  checkHealth().catch(() =>
    showApiBanner('El servicio está temporalmente no disponible. Intenta más tarde.')
  );

  try {
    // Primer lote grande → casi todas las categorías cargan de una.
    // Si el catálogo supera 250, el resto sigue en background.
    const [firstPage, collections, config] = await Promise.all([
      fetchProductsPage({ first: 250 }),
      fetchCollections(),
      fetchConfig().catch(() => null),
    ]);

    const waNumber = config?.whatsapp ?? null;
    setState({
      products: firstPage.products,
      collections,
      waNumber,
    });
    if (waNumber) {
      document.querySelectorAll('.wa-link').forEach(el => {
        // Si el enlace tiene un mensaje preestablecido (data-wa-text), se incluye
        const msg = el.dataset.waText;
        el.href = msg
          ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`
          : `https://wa.me/${waNumber}`;
      });
    }
    renderFeatured(firstPage.products, collections);
    handleHashRoute();

    // Carga el resto en background sin bloquear la UI. Cada batch se
    // mergea en state → statechange dispara re-render del grid/sidebar.
    loadRemainingProducts(firstPage.cursor, firstPage.hasNext);
  } catch (err) {
    console.error('[PinkPower] Data load error:', err);
    showApiBanner('No se pudo cargar el catálogo. Por favor recarga la página.');
  }
});

// ── Splash ────────────────────────────────────────────────
const SPLASH_MIN_MS = 1300;            // tiempo mínimo visible
const _splashStart  = performance.now();
let _splashHidden   = false;
function hideSplash() {
  if (_splashHidden) return;
  // Garantiza un mínimo en pantalla para que no aparezca y desaparezca de golpe
  const elapsed = performance.now() - _splashStart;
  if (elapsed < SPLASH_MIN_MS) {
    setTimeout(hideSplash, SPLASH_MIN_MS - elapsed);
    return;
  }
  _splashHidden = true;
  document.body.classList.remove('is-loading'); // restaura el scroll
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('is-hidden');
  // Quitar del DOM tras la transición para que no intercepte clics
  setTimeout(() => splash.remove(), 700);
}

async function loadRemainingProducts(cursor, hasNext) {
  while (hasNext) {
    try {
      const page = await fetchProductsPage({ cursor, first: 250 });
      const { products } = getState();
      // Merge sin duplicados por si una página se reintenta
      const existing = new Set(products.map(p => p.id));
      const merged = products.concat(page.products.filter(p => !existing.has(p.id)));
      setState({ products: merged });
      cursor = page.cursor;
      hasNext = page.hasNext;
    } catch (err) {
      console.warn('[PinkPower] Background load failed:', err);
      break; // dejamos lo que ya cargamos
    }
  }
  // Marca que ya no llegarán más productos → el sidebar deja de decir "Cargando…"
  setState({ productsLoaded: true });

  // Ya con todo el catálogo, agrega las colecciones que faltaban (las que
  // tenían sus productos en lotes posteriores) SIN re-armar el carrusel.
  if (!_fbFullDone) {
    _fbFullDone = true;
    const st = getState();
    addMissingFeatured(st.products, st.collections);
  }
}

// ── State subscription ────────────────────────────────────
// Solo redibujamos el grid/sidebar cuando cambia algo que les afecta.
// Así, al agregar al carrito (que solo cambia `cart`) NO se recrea el grid
// — antes eso causaba un parpadeo/"recarga" al hacer click en hover.
let _prevRender = {};
let _prevModalId = null;
on('statechange', state => {
  const { products, collections, activeCollection, activeTag, activeSize,
          priceMin, priceMax, sortBy, searchQuery, currentPage, productsLoaded } = state;

  const gridChanged =
    products       !== _prevRender.products ||
    collections    !== _prevRender.collections ||
    activeCollection !== _prevRender.activeCollection ||
    activeTag      !== _prevRender.activeTag ||
    activeSize     !== _prevRender.activeSize ||
    priceMin       !== _prevRender.priceMin ||
    priceMax       !== _prevRender.priceMax ||
    sortBy         !== _prevRender.sortBy ||
    searchQuery    !== _prevRender.searchQuery ||
    currentPage    !== _prevRender.currentPage ||
    productsLoaded !== _prevRender.productsLoaded;

  if (gridChanged && products.length) {
    renderProductGrid(products, collections, activeCollection, searchQuery);
    renderCollectionSidebar(collections);
    renderSizeBar(collections);
  }

  _prevRender = { products, collections, activeCollection, activeTag, activeSize,
                  priceMin, priceMax, sortBy, searchQuery, currentPage, productsLoaded };

  // Al cerrar la ficha de un producto, devolver la URL al catálogo
  // (así un refresh no reabre el modal).
  const mid = state.modalProductId;
  if (_prevModalId && !mid && location.hash.includes('/product/')) {
    history.replaceState(null, '', catalogHash());
  }
  _prevModalId = mid;

  renderCartDrawer();
  updateCartBadge();
});

// Hash del catálogo según los filtros activos (para restaurar la URL)
function catalogHash() {
  const { activeCollection, activeTag } = getState();
  if (activeTag) return `#shop/tag/${encodeURIComponent(activeTag)}`;
  if (activeCollection) return `#shop/collection/${activeCollection}`;
  return '#shop';
}

// Baja hasta el inicio de los productos (descontando el nav fijo).
function scrollToProducts(behavior = 'smooth') {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const navOffset = 80;
  const top = grid.getBoundingClientRect().top + window.scrollY - navOffset;
  window.scrollTo({ top, behavior });
}

// En móvil, baja a los productos tras elegir un filtro.
function scrollToProductsMobile() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  scrollToProducts('smooth');
}

// Al abrir un link de categoría, baja a los productos. Si el splash todavía
// está (carga inicial), espera a que termine para que el scroll funcione.
function scrollToProductsWhenReady() {
  const go = () => scrollToProducts('auto');
  if (document.body.classList.contains('is-loading')) {
    const t = setInterval(() => {
      if (!document.body.classList.contains('is-loading')) { clearInterval(t); go(); }
    }, 100);
    setTimeout(() => clearInterval(t), 6000); // tope de seguridad
  } else {
    go();
  }
}

// ── Carrusel de colecciones (scroll horizontal) ───────────
// Una fila desplazable: en desktop muestra una colección a la vez y avanza
// sola; en móvil se ven varias con "peek" y se puede deslizar (como B&BW).
let _fbIndex = 0;
let _fbTimer = null;
let _fbFullDone = false; // ya se re-renderizó con todo el catálogo

function renderFeatured(products, collections) {
  const section = document.getElementById('featured');
  const track   = document.getElementById('fb-track');
  if (!section || !track) return;

  // Una diapositiva por colección, con una foto representativa: se toma un
  // producto AL AZAR de esa colección, así en cada visita la foto cambia y
  // no es siempre la misma.
  const slides = [];
  for (const c of collections) {
    const img = pickCollectionImage(products, c.handle);
    if (!img) continue; // colección sin productos/fotos aún → se omite
    slides.push({ handle: c.handle, title: c.title, img });
  }
  if (slides.length < 2) { section.hidden = true; return; }

  track.innerHTML = slides.map((s, i) => fbSlideHTML(s.handle, s.title, s.img, i === 0)).join('');
  fbRenderDots(slides.length);

  section.hidden = false;
  _fbIndex = 0;
  track.scrollLeft = 0;

  // Al desplazar (auto o manual), sincroniza los puntos con la posición
  track.onscroll = () => {
    clearTimeout(track._fbScrollT);
    track._fbScrollT = setTimeout(syncFbDots, 90);
  };

  // Arrastre con mouse (en táctil ya funciona el swipe nativo)
  if (!track._fbDragWired) { wireFbDrag(track); track._fbDragWired = true; }

  startFbAuto();
  // Pausa el auto-avance al pasar el mouse (desktop)
  section.onmouseenter = stopFbAuto;
  section.onmouseleave = startFbAuto;
}

// Centra la diapositiva i dentro del carril
function setFbIndex(i, smooth = true) {
  const track  = document.getElementById('fb-track');
  const slides = track ? [...track.querySelectorAll('.fb-slide')] : [];
  if (!slides.length) return;
  _fbIndex = (i + slides.length) % slides.length;
  const slide = slides[_fbIndex];
  const left  = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
  track.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  markFbDot(_fbIndex);
}

// Detecta cuál diapositiva está centrada y actualiza los puntos
function syncFbDots() {
  const track  = document.getElementById('fb-track');
  const slides = track ? [...track.querySelectorAll('.fb-slide')] : [];
  if (!slides.length) return;
  const center = track.scrollLeft + track.clientWidth / 2;
  let nearest = 0, best = Infinity;
  slides.forEach((s, idx) => {
    const d = Math.abs((s.offsetLeft + s.clientWidth / 2) - center);
    if (d < best) { best = d; nearest = idx; }
  });
  _fbIndex = nearest;
  markFbDot(nearest);
}

function markFbDot(idx) {
  document.querySelectorAll('#fb-dots .fb-dot').forEach((d, i) =>
    d.classList.toggle('is-active', i === idx));
}

function startFbAuto() {
  stopFbAuto();
  _fbTimer = setInterval(() => setFbIndex(_fbIndex + 1), 5000);
}
function stopFbAuto() {
  if (_fbTimer) { clearInterval(_fbTimer); _fbTimer = null; }
}

// Foto al azar de un producto (con imagen) de la colección, o null si no hay.
function pickCollectionImage(products, handle) {
  const pool = products.filter(p => p.collectionHandles.includes(handle) && p.images.length);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].images[0].url;
}

function fbSlideHTML(handle, title, img, eager) {
  return `
      <article class="fb-slide" data-fb-collection="${handle}">
        <div class="fb-slide__media">
          <img src="${img}" alt="${title}" loading="${eager ? 'eager' : 'lazy'}" />
        </div>
        <div class="fb-slide__body">
          <h3 class="fb-slide__title">${title}</h3>
        </div>
      </article>`;
}

function fbRenderDots(n) {
  const dotsBox = document.getElementById('fb-dots');
  if (!dotsBox) return;
  dotsBox.innerHTML = Array.from({ length: n }, (_, i) =>
    `<button class="fb-dot${i === _fbIndex ? ' is-active' : ''}" data-fb-dot="${i}" aria-label="Ir a la colección ${i + 1}"></button>`
  ).join('');
}

// Al terminar de cargar el catálogo, AGREGA solo las colecciones que faltaban
// (sin re-armar ni resetear el carrusel → no salta ni cambia las fotos ya puestas).
function addMissingFeatured(products, collections) {
  const section = document.getElementById('featured');
  const track   = document.getElementById('fb-track');
  if (!section || !track) return;

  const existing = new Set(
    [...track.querySelectorAll('.fb-slide')].map(s => s.dataset.fbCollection)
  );

  let added = 0;
  for (const c of collections) {
    if (existing.has(c.handle)) continue;
    const img = pickCollectionImage(products, c.handle);
    if (!img) continue;
    track.insertAdjacentHTML('beforeend', fbSlideHTML(c.handle, c.title, img, false));
    added++;
  }

  if (!added) return;
  const total = track.querySelectorAll('.fb-slide').length;
  fbRenderDots(total);

  // Si antes estaba oculto por tener <2, ahora muéstralo y arráncalo
  if (section.hidden && total >= 2) {
    section.hidden = false;
    _fbIndex = 0;
    track.scrollLeft = 0;
    if (!track._fbDragWired) { wireFbDrag(track); track._fbDragWired = true; }
    startFbAuto();
  }
}

// Permite arrastrar el carrusel con el mouse (el táctil usa swipe nativo).
function wireFbDrag(track) {
  let down = false, startX = 0, startScroll = 0, moved = false;

  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return; // en táctil deja el scroll nativo
    down = true; moved = false;
    startX = e.clientX;
    startScroll = track.scrollLeft;
    track.style.scrollSnapType = 'none'; // evita saltos mientras se arrastra
    track.style.cursor = 'grabbing';
    try { track.setPointerCapture(e.pointerId); } catch (_) {}
  });

  track.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    track.scrollLeft = startScroll - dx;
  });

  const end = () => {
    if (!down) return;
    down = false;
    track.style.cursor = '';
    track.style.scrollSnapType = ''; // re-activa el snap → encaja en la tarjeta
    syncFbDots();
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointerleave', end);
  track.addEventListener('pointercancel', end);

  // Si hubo arrastre, no dispares el click (no abrir la colección sin querer)
  track.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);
}

// ── Global click delegation ───────────────────────────────
document.addEventListener('click', e => {

  // Menú hamburguesa / botón "Categorías y filtros" — abren la cinta lateral
  if (e.target.closest('#nav-toggle') || e.target.closest('#filters-toggle')) {
    openMenuDrawer();
    return;
  }

  // Cerrar la cinta lateral del menú
  if (e.target.closest('#menu-close') || e.target.closest('#menu-drawer .menu-overlay')) {
    closeMenuDrawer();
    return;
  }

  // Compartir la vista actual del catálogo (colección, etiqueta o búsqueda)
  if (e.target.closest('#share-view')) {
    const hash = location.hash.startsWith('#shop') ? location.hash : '#shop';
    shareLink(siteUrl(hash), shareViewTitle());
    return;
  }

  // Lupa de búsqueda (móvil) — abre el buscador de pantalla completa
  if (e.target.closest('#search-toggle')) {
    openSearchOverlay();
    return;
  }

  // Cerrar la cinta lateral al tocar un enlace de navegación (deja que navegue)
  if (e.target.closest('.menu-links a')) {
    closeMenuDrawer();
    // sin return: el ancla navega normalmente
  }

  // Colección. El chevron (+/−) solo despliega/colapsa el submenú; el NOMBRE
  // despliega (1er clic) o va a TODA la categoría (2º clic, ya abierta).
  const collBtn = e.target.closest('.collection-btn');
  if (collBtn) {
    const clicked = collBtn.dataset.handle;
    if (!clicked) return;
    const { activeCollection } = getState();
    const isOpen = clicked === activeCollection;
    const onChevron = !!e.target.closest('.collection-chevron');

    if (onChevron) {
      // Solo desplegar/colapsar (no navega ni cierra la cinta)
      if (isOpen) {
        // − → minimizar para seguir navegando
        setState({ activeCollection: null, activeTag: null, activeSize: null, currentPage: 1 });
        history.replaceState(null, '', '#shop');
      } else {
        // + → desplegar
        clearSearchInput();
        setState({ activeCollection: clicked, activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
        history.replaceState(null, '', `#shop/collection/${clicked}`);
      }
      return;
    }

    // Clic en el NOMBRE de la colección
    if (isOpen) {
      // ya abierta → ir a TODA la categoría (todos los productos, sin filtro)
      clearSearchInput();
      setState({ activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
      history.replaceState(null, '', `#shop/collection/${clicked}`);
      closeMenuDrawer();
      scrollToProductsMobile();
      return;
    }
    // colapsada → desplegar su submenú
    clearSearchInput();
    setState({ activeCollection: clicked, activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
    history.replaceState(null, '', `#shop/collection/${clicked}`);
    // Si no tiene subcategorías, ir directo a la categoría
    if (!document.querySelector('#collection-sidebar .tag-btn')) {
      closeMenuDrawer();
      scrollToProductsMobile();
    }
    return;
  }

  // Etiqueta dentro de la colección expandida
  const tagBtn = e.target.closest('.tag-btn');
  if (tagBtn) {
    const tag = tagBtn.dataset.tag || null;
    // Limpiar tallas y búsqueda al cambiar de etiqueta del submenú
    clearSearchInput();
    setState({ activeTag: tag, activeSize: null, searchQuery: '', currentPage: 1 });
    // URL compartible: etiqueta sola, o la colección si eligió "Todas"
    const { activeCollection } = getState();
    history.replaceState(null, '', tag
      ? `#shop/tag/${encodeURIComponent(tag)}`
      : (activeCollection ? `#shop/collection/${activeCollection}` : '#shop'));
    closeMenuDrawer();
    scrollToProductsMobile();
    return;
  }

  // Size filter chips (filtro paralelo, independiente del drill-down)
  const sizeBtn = e.target.closest('.size-btn');
  if (sizeBtn) {
    const { activeSize } = getState();
    const size = sizeBtn.dataset.size;
    // Toggle off if same size clicked again
    setState({ activeSize: activeSize === size ? null : size, currentPage: 1 });
    scrollToProductsMobile();
    return;
  }

  // Limpiar filtro de precio
  if (e.target.closest('#price-clear')) {
    setState({ priceMin: null, priceMax: null, currentPage: 1 });
    return;
  }

  // Pagination buttons
  const pageBtn = e.target.closest('.page-btn');
  if (pageBtn && !pageBtn.disabled) {
    const page = parseInt(pageBtn.dataset.page, 10);
    if (Number.isFinite(page) && page >= 1) {
      setState({ currentPage: page });
      // Llevar al inicio de los productos de esa página (no al tope del menú).
      // Se descuenta el alto del navbar fijo para que la primera fila quede visible.
      const grid = document.getElementById('product-grid');
      if (grid) {
        const navOffset = 90;
        const top = grid.getBoundingClientRect().top + window.scrollY - navOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
    return;
  }

  // Carrusel de colecciones — flechas, puntos y abrir colección
  if (e.target.closest('#fb-prev')) { setFbIndex(_fbIndex - 1); startFbAuto(); return; }
  if (e.target.closest('#fb-next')) { setFbIndex(_fbIndex + 1); startFbAuto(); return; }
  const fbDot = e.target.closest('[data-fb-dot]');
  if (fbDot) { setFbIndex(parseInt(fbDot.dataset.fbDot, 10)); startFbAuto(); return; }
  const fbCol = e.target.closest('[data-fb-collection]');
  if (fbCol) {
    const handle = fbCol.dataset.fbCollection;
    clearSearchInput();
    setState({ activeCollection: handle, activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
    history.replaceState(null, '', `#shop/collection/${handle}`);
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // Product card click → open detail (unless hitting the add-to-cart button)
  const card = e.target.closest('.product-card');
  if (card && !e.target.closest('[data-action]')) {
    const id = card.dataset.id;
    const { products } = getState();
    const product = products.find(p => p.id === id);
    if (product) {
      openModal(product);
      history.replaceState(null, '', `#shop/product/${id}`);
    }
    return;
  }

  // Product card overlay actions
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    const id = actionBtn.dataset.id;
    const { products } = getState();
    const product = products.find(p => p.id === id);
    if (!product) return;

    if (actionBtn.dataset.action === 'quick-view') {
      openModal(product);
      history.replaceState(null, '', `#shop/product/${id}`);
    }
    if (actionBtn.dataset.action === 'add-to-cart') {
      const variant = product.variants.find(v => v.availableForSale) || product.variants[0];
      if (variant) showToast(addToCart(product, variant), product.title);
    }
    return;
  }

  // Cart toggle
  if (e.target.closest('#cart-toggle')) {
    if (getState().cartOpen) closeCart();
    else openCart();
    return;
  }

  // Cart close
  if (e.target.closest('#cart-close') || e.target.id === 'cart-overlay') {
    closeCart();
    return;
  }

  // Cart qty +/-
  const qtyBtn = e.target.closest('[data-qty-change]');
  if (qtyBtn) {
    updateQuantity(qtyBtn.dataset.qtyChange, parseInt(qtyBtn.dataset.delta, 10));
    return;
  }

  // Remove cart item
  const removeBtn = e.target.closest('[data-cart-remove]');
  if (removeBtn) {
    removeFromCart(removeBtn.dataset.cartRemove);
    return;
  }

  // Checkout — open form, do NOT go to WhatsApp directly
  if (e.target.closest('#checkout-btn')) {
    showCheckoutModal();
    return;
  }

  // WhatsApp FAB — handled natively by <a href>, no JS needed
});

// ── Search ────────────────────────────────────────────────
let _searchDebounce = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'search-input') return;
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => setState({ searchQuery: e.target.value.trim(), currentPage: 1 }), 300);
});

// Limpia el campo de búsqueda y cancela cualquier búsqueda pendiente.
// Se usa al elegir una categoría/subcategoría para que no se combinen los
// filtros y el catálogo quede vacío.
function clearSearchInput() {
  clearTimeout(_searchDebounce);
  const input = document.getElementById('search-input');
  if (input) input.value = '';
}

// ── Ordenar por precio ───────────────────────────────────
document.addEventListener('change', e => {
  if (e.target.id !== 'sort-select') return;
  setState({ sortBy: e.target.value, currentPage: 1 });
});

// ── Keyboard ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSearchOverlay();
    closeModal();
    closeCheckoutModal();
  }
});

// ── Buscador de pantalla completa ─────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openSearchOverlay() {
  if (document.getElementById('search-overlay')) return;
  document.querySelector('nav')?.classList.remove('is-open');

  const ov = document.createElement('div');
  ov.id = 'search-overlay';
  ov.innerHTML = `
    <div class="search-ov__bar">
      <svg class="search-ov__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="search" id="search-ov-input" placeholder="Buscar productos..." autocomplete="off" aria-label="Buscar productos" />
      <button id="search-ov-close" class="search-ov__close" aria-label="Cerrar">&times;</button>
    </div>
    <div class="search-ov__results" id="search-ov-results"></div>
  `;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';

  const input = ov.querySelector('#search-ov-input');
  renderSearchResults('');
  input.addEventListener('input', () => renderSearchResults(input.value));
  ov.querySelector('#search-ov-close').addEventListener('click', closeSearchOverlay);

  ov.querySelector('#search-ov-results').addEventListener('click', e => {
    const btn = e.target.closest('.search-result');
    if (!btn) return;
    const product = getState().products.find(p => p.id === btn.dataset.id);
    if (product) {
      closeSearchOverlay();
      openModal(product);
      history.replaceState(null, '', `#shop/product/${product.id}`);
    }
  });

  setTimeout(() => input.focus(), 60);
}

function closeSearchOverlay() {
  const ov = document.getElementById('search-overlay');
  if (!ov) return;
  ov.remove();
  document.body.style.overflow = '';
}

function renderSearchResults(query) {
  const box = document.getElementById('search-ov-results');
  if (!box) return;

  const q = String(query).trim();
  const { products, collections } = getState();

  if (!q) {
    box.innerHTML = `<p class="search-ov__hint">Escribe para buscar entre nuestros productos.</p>`;
    return;
  }

  const matches = searchProducts(products, q, collections).slice(0, 40);
  if (!matches.length) {
    box.innerHTML = `<p class="search-ov__hint">No se encontraron productos.</p>`;
    return;
  }

  box.innerHTML = matches.map(p => {
    const img     = p.images[0]?.url || '';
    const price   = p.price.toLocaleString('es-HN', { minimumFractionDigits: 2 });
    const soldOut = !p.availableForSale ? ' · Agotado' : '';
    return `
      <button class="search-result" data-id="${p.id}">
        <img class="search-result__img" src="${img}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
        <span class="search-result__info">
          <span class="search-result__name">${escHtml(p.title)}</span>
          <span class="search-result__price">L. ${price}${soldOut}</span>
        </span>
      </button>`;
  }).join('');
}


// ── Abrir / cerrar carrito (con animación en ambos sentidos) ──
function openCart() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;
  setState({ cartOpen: true }); // statechange → renderCartDrawer construye/refresca
  drawer.hidden = false;
  drawer.classList.remove('is-closing');
  const panel = drawer.querySelector('.cart-panel');
  if (panel) {
    panel.classList.remove('cart-panel--out', 'cart-panel--in');
    void panel.offsetWidth;
    panel.classList.add('cart-panel--in');
  }
}

function closeCart() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer || drawer.hidden || !getState().cartOpen) return;
  const panel = drawer.querySelector('.cart-panel');
  if (!panel) { setState({ cartOpen: false }); drawer.hidden = true; return; }

  // Anima la salida; recién al terminar oculta y actualiza el estado.
  drawer.classList.add('is-closing');
  panel.classList.remove('cart-panel--in');
  panel.classList.add('cart-panel--out');

  const finish = () => {
    panel.removeEventListener('animationend', finish);
    panel.classList.remove('cart-panel--out');
    drawer.classList.remove('is-closing');
    setState({ cartOpen: false });
    drawer.hidden = true;
  };
  panel.addEventListener('animationend', finish);
}

// ── Cinta lateral del menú de productos (con animación) ──────
function openMenuDrawer() {
  const drawer = document.getElementById('menu-drawer');
  if (!drawer) return;
  setState({ menuOpen: true });
  document.body.classList.add('menu-open');
  drawer.hidden = false;
  drawer.classList.remove('is-closing');
  document.getElementById('nav-toggle')?.classList.add('is-active');
  document.getElementById('filters-toggle')?.setAttribute('aria-expanded', 'true');
  const panel = drawer.querySelector('.menu-panel');
  if (panel) {
    panel.classList.remove('menu-panel--out', 'menu-panel--in');
    void panel.offsetWidth;
    panel.classList.add('menu-panel--in');
  }
}

function closeMenuDrawer() {
  const drawer = document.getElementById('menu-drawer');
  if (!drawer || drawer.hidden) return;
  document.getElementById('nav-toggle')?.classList.remove('is-active');
  document.getElementById('filters-toggle')?.setAttribute('aria-expanded', 'false');
  const panel = drawer.querySelector('.menu-panel');
  if (!panel) { setState({ menuOpen: false }); drawer.hidden = true; document.body.classList.remove('menu-open'); return; }

  drawer.classList.add('is-closing');
  panel.classList.remove('menu-panel--in');
  panel.classList.add('menu-panel--out');

  const finish = () => {
    panel.removeEventListener('animationend', finish);
    panel.classList.remove('menu-panel--out');
    drawer.classList.remove('is-closing');
    setState({ menuOpen: false });
    drawer.hidden = true;
    document.body.classList.remove('menu-open');
  };
  panel.addEventListener('animationend', finish);
}

// ── Cart drawer ───────────────────────────────────────────
function renderCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;

  const { cart, cartOpen } = getState();
  drawer.hidden = !cartOpen;

  const total = cart
    .reduce((s, i) => s + i.price * i.quantity, 0)
    .toLocaleString('es-HN', { minimumFractionDigits: 2 });

  const itemsHTML = cart.length
    ? cart.map(i => {
        const linePrice = (i.price * i.quantity).toLocaleString('es-HN', { minimumFractionDigits: 2 });
        const varLabel  = i.variantTitle !== 'Default Title'
          ? `<span class="ci-variant">${i.variantTitle}</span>` : '';
        return `
          <div class="cart-item">
            <img class="cart-item__img" src="${i.imageUrl}" alt="${i.productTitle}"
                 onerror="this.style.display='none'" loading="lazy" />
            <div class="cart-item__info">
              <p class="cart-item__name">${i.productTitle}</p>
              ${varLabel}
              <p class="cart-item__price">L. ${linePrice}</p>
              <div class="qty-control">
                <button class="qty-btn" data-qty-change="${i._key}" data-delta="-1" aria-label="Reducir">−</button>
                <span class="qty-value">${i.quantity}</span>
                <button class="qty-btn" data-qty-change="${i._key}" data-delta="1" aria-label="Aumentar"
                  ${i.maxQty !== null && i.quantity >= i.maxQty ? 'disabled' : ''}>+</button>
              </div>
              ${i.maxQty !== null && i.maxQty <= 3
                ? `<span class="qty-stock-warn">Solo ${i.maxQty} disponibles</span>`
                : ''}
            </div>
            <button class="cart-item__remove" data-cart-remove="${i._key}" aria-label="Eliminar">✕</button>
          </div>
        `;
      }).join('')
    : '<p class="cart-empty">Tu carrito está vacío.</p>';

  const footerHTML = cart.length ? `
    <div class="cart-footer">
      <div class="cart-total">
        <span>Total</span>
        <span>L. ${total}</span>
      </div>
      <button class="btn btn-primary cart-checkout" id="checkout-btn">
        Confirmar Pedido
      </button>
    </div>
  ` : '';

  // Estructura del panel: se crea UNA sola vez. Así, al eliminar/cambiar un
  // ítem solo se refresca el contenido y el panel NO se vuelve a animar
  // (antes parecía que "salía otro sidebar").
  if (!drawer.querySelector('.cart-panel')) {
    drawer.innerHTML = `
      <div id="cart-overlay"></div>
      <div class="cart-panel">
        <div class="cart-header">
          <p class="cart-title">Mi Carrito</p>
          <button id="cart-close" aria-label="Cerrar carrito">&times;</button>
        </div>
        <div class="cart-items"></div>
        <div class="cart-footer-slot"></div>
      </div>
    `;
  }

  drawer.querySelector('.cart-items').innerHTML = itemsHTML;
  drawer.querySelector('.cart-footer-slot').innerHTML = footerHTML;
}

// ── Checkout modal ────────────────────────────────────────
function showCheckoutModal() {
  if (document.getElementById('checkout-modal')) return;

  const { cart } = getState();

  const summaryLines = cart.map(i => {
    const varLabel = i.variantTitle !== 'Default Title' ? ` <span class="co-variant">(${i.variantTitle})</span>` : '';
    const price = (i.price * i.quantity).toLocaleString('es-HN', { minimumFractionDigits: 2 });
    return `
      <div class="co-item">
        <span class="co-item__name">${i.productTitle}${varLabel} × ${i.quantity}</span>
        <span class="co-item__price">L. ${price}</span>
      </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'checkout-modal';
  modal.innerHTML = `
    <div class="co-backdrop" id="co-backdrop"></div>
    <div class="co-panel" role="dialog" aria-modal="true" aria-label="Confirmar pedido">
      <button class="co-close" id="co-close" aria-label="Cerrar">&times;</button>

      <p class="co-title">Confirmar Pedido</p>
      <p class="co-subtitle">Completa tus datos para crear el pedido en nuestra tienda.</p>

      <div class="co-summary">
        ${summaryLines}
      </div>

      <form id="co-form" novalidate>
        <div class="co-field">
          <p class="co-field__label">Tipo de entrega *</p>
          <div class="co-options">
            <label class="co-radio"><input type="radio" name="co-delivery" value="pickup" checked /><span>Pick up — recoger en tienda<em>Gratis</em></span></label>
            <label class="co-radio"><input type="radio" name="co-delivery" value="sps" /><span>Envío en SPS<em>+ L. 95.00</em></span></label>
            <label class="co-radio"><input type="radio" name="co-delivery" value="outside" /><span>Envío fuera de SPS<em>+ L. 110.00</em></span></label>
          </div>
        </div>
        <div class="co-field">
          <p class="co-field__label">Tipo de pago *</p>
          <div class="co-options">
            <label class="co-radio"><input type="radio" name="co-payment" value="transfer" checked /><span>Transferencia</span></label>
            <label class="co-radio"><input type="radio" name="co-payment" value="card" /><span>Tarjeta</span></label>
            <label class="co-radio"><input type="radio" name="co-payment" value="cash" /><span>Efectivo</span></label>
          </div>
        </div>

        <div class="co-totals" id="co-totals"></div>
        <p class="co-warning" id="co-warning" hidden>El pago en efectivo fuera de SPS tiene un 5% de comisión por cobro contra entrega, ya incluido en el total.</p>

        <div class="co-field">
          <label for="co-name">Nombre completo *</label>
          <input type="text" id="co-name" required placeholder="Tu nombre completo" autocomplete="name" />
        </div>
        <div class="co-field">
          <label for="co-phone">Teléfono *</label>
          <input type="tel" id="co-phone" required placeholder="504 XXXX XXXX" autocomplete="tel" />
        </div>
        <div class="co-field">
          <label for="co-email">Email <span class="co-optional">(opcional)</span></label>
          <input type="email" id="co-email" placeholder="tu@correo.com" autocomplete="email" />
        </div>
        <p class="co-error" id="co-error" hidden></p>
        <button type="submit" class="btn btn-primary co-submit" id="co-submit">
          Crear Pedido y Continuar por WhatsApp
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Totales iniciales + recálculo al cambiar entrega/pago
  updateCoTotals(modal);
  modal.querySelector('#co-form').addEventListener('change', e => {
    if (e.target.name === 'co-delivery' || e.target.name === 'co-payment') updateCoTotals(modal);
  });

  // Focus name field
  setTimeout(() => modal.querySelector('#co-name')?.focus(), 50);

  // Wire close
  modal.querySelector('#co-backdrop').addEventListener('click', closeCheckoutModal);
  modal.querySelector('#co-close').addEventListener('click', closeCheckoutModal);

  // Wire submit
  modal.querySelector('#co-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name  = modal.querySelector('#co-name').value.trim();
    const phone = modal.querySelector('#co-phone').value.trim();
    const email = modal.querySelector('#co-email').value.trim();

    if (!name || !phone) {
      showCoError('Por favor completa nombre y teléfono.');
      return;
    }

    const { delivery, payment } = getCoSelection(modal);
    const totals  = computeCheckout(delivery, payment);
    const checkout = {
      deliveryLabel: DELIVERY[delivery].label,
      paymentLabel:  PAYMENT[payment].label,
      ...totals,
    };

    await submitCheckout(name, phone, email, checkout);
  });
}

// ── Cálculo de entrega / pago / comisión ──────────────────
const DELIVERY = {
  pickup:  { label: 'Pick up (recoger en tienda)', cost: 0 },
  sps:     { label: 'Envío en SPS',                cost: 95 },
  outside: { label: 'Envío fuera de SPS',          cost: 110 },
};
const PAYMENT = {
  transfer: { label: 'Transferencia' },
  card:     { label: 'Tarjeta' },
  cash:     { label: 'Efectivo' },
};

function computeCheckout(delivery, payment) {
  const { cart } = getState();
  const productsTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = DELIVERY[delivery]?.cost ?? 0;
  const base = productsTotal + shipping;
  // Efectivo + fuera de SPS → 5% de comisión por cobro contra entrega.
  // Total = (productos + envío) / 0.95, redondeado hacia arriba a entero.
  const cashOnDelivery = payment === 'cash' && delivery === 'outside';
  const finalTotal = cashOnDelivery ? Math.ceil(base / 0.95) : base;
  const commission = finalTotal - base;
  return { productsTotal, shipping, commission, finalTotal, cashOnDelivery };
}

function getCoSelection(modal) {
  const delivery = modal.querySelector('input[name="co-delivery"]:checked')?.value || 'pickup';
  const payment  = modal.querySelector('input[name="co-payment"]:checked')?.value || 'transfer';
  return { delivery, payment };
}

function updateCoTotals(modal) {
  const { delivery, payment } = getCoSelection(modal);
  const t   = computeCheckout(delivery, payment);
  const fmt = n => `L. ${Number(n).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`;

  const box = modal.querySelector('#co-totals');
  if (box) {
    box.innerHTML = `
      <div class="co-total-row"><span>Subtotal productos</span><span>${fmt(t.productsTotal)}</span></div>
      <div class="co-total-row"><span>Envío</span><span>${t.shipping ? fmt(t.shipping) : 'Gratis'}</span></div>
      ${t.commission > 0 ? `<div class="co-total-row co-total-row--fee"><span>Comisión contra entrega (5%)</span><span>${fmt(t.commission)}</span></div>` : ''}
      <div class="co-total-row co-total-row--grand"><span>Total a pagar</span><span>${fmt(t.finalTotal)}</span></div>
    `;
  }
  const warn = modal.querySelector('#co-warning');
  if (warn) warn.hidden = !t.cashOnDelivery;
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.remove();
}

function showCoError(msg) {
  const el = document.getElementById('co-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

async function submitCheckout(name, phone, email, checkout = null) {
  const submitBtn = document.getElementById('co-submit');
  if (submitBtn) { submitBtn.textContent = 'Creando pedido...'; submitBtn.disabled = true; }

  const { cart, waNumber } = getState();

  const orderPayload = {
    customer_name: name,
    phone,
    email: email || undefined,
    line_items: cart.map(i => ({
      variant_id: i.variantId,
      quantity:   i.quantity,
      price:      i.price.toFixed(2),
    })),
  };

  try {
    const orderData = await postOrder(orderPayload);

    const orderName = orderData?.order?.name || null; // e.g. "#1011"
    const url = buildWhatsAppUrl(waNumber, orderName, checkout);

    clearCart();
    closeCheckoutModal();

    // window.location.href works on iOS without user-gesture restrictions
    window.location.href = url;

    // Close cart drawer
    setState({ cartOpen: false });
    document.getElementById('cart-drawer').hidden = true;

  } catch (err) {
    console.error('[PinkPower] Order error:', err);
    showCoError('No se pudo crear el pedido. Por favor intenta de nuevo.');
    if (submitBtn) { submitBtn.textContent = 'Crear Pedido y Continuar por WhatsApp'; submitBtn.disabled = false; }
  }
}

// ── Featured banner ───────────────────────────────────────
function renderFeaturedBanner(collections) {
  if (!collections.length) return;
  const col = collections[Math.floor(Math.random() * collections.length)];

  const badge = document.getElementById('banner-badge');
  const title = document.getElementById('banner-title');
  const link  = document.getElementById('banner-link');

  if (badge) badge.textContent = 'Colección Destacada';
  if (title) title.innerHTML = `${col.title}<br /><em>PinkPower HN</em>`;
  if (link) {
    link.href = `#shop/collection/${col.handle}`;
    link.addEventListener('click', e => {
      e.preventDefault();
      setState({ activeCollection: col.handle });
      history.pushState(null, '', `#shop/collection/${col.handle}`);
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

// Título descriptivo para compartir la vista actual del catálogo
function shareViewTitle() {
  const { activeCollection, activeTag, collections } = getState();
  if (activeTag) return `Catálogo: ${activeTag} · PinkPower HN`;
  if (activeCollection) {
    const c = collections.find(c => c.handle === activeCollection);
    return `Catálogo: ${c ? c.title : ''} · PinkPower HN`;
  }
  return 'Catálogo PinkPower HN';
}

// ── Hash routing ──────────────────────────────────────────
// Esquema de URLs compartibles:
//   #shop                       → catálogo completo
//   #shop/collection/<handle>   → una colección
//   #shop/tag/<etiqueta>        → todos los productos con esa etiqueta
//   #shop/product/<id>          → ficha de un producto (modal)
function handleHashRoute() {
  const hash = location.hash;
  if (!hash.startsWith('#shop')) return;

  const path  = hash.replace('#shop', '').replace(/^\//, '');
  const parts = path.split('/').filter(Boolean);

  // Producto → abrir su ficha
  if (parts[0] === 'product' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    const product = getState().products.find(p => String(p.id) === id);
    if (product) openModal(product);
    return;
  }

  // Cualquier ruta de catálogo: si había una ficha abierta, ciérrala
  if (getState().modalProductId) closeModal();

  if (parts[0] === 'collection' && parts[1]) {
    setState({ activeCollection: decodeURIComponent(parts[1]), activeTag: null, currentPage: 1 });
    scrollToProductsWhenReady(); // link de categoría → bajar a los productos
  } else if (parts[0] === 'tag' && parts[1]) {
    setState({ activeCollection: null, activeTag: decodeURIComponent(parts[1]), currentPage: 1 });
    scrollToProductsWhenReady();
  } else {
    setState({ activeCollection: null, activeTag: null, currentPage: 1 });
  }
}

window.addEventListener('hashchange', () => {
  if (getState().products.length) handleHashRoute();
});

// ── API error banner ──────────────────────────────────────
function showApiBanner(message) {
  if (document.getElementById('api-error-banner')) return;
  const banner = document.createElement('div');
  banner.id        = 'api-error-banner';
  banner.className = 'api-error-banner';
  banner.textContent = message;
  document.getElementById('shop')?.prepend(banner);
}
