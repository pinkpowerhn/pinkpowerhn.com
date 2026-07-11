import { initState, getState, setState, on } from './state.js';
import { showToast } from './toast.js';
import { fetchProductsPage, fetchCollections, fetchConfig, checkHealth, postOrder, fetchProductById } from './api.js';
import { renderSkeletons, renderCollectionSidebar, renderMegaMenu, renderProductGrid, renderSizeBar, tieneVariantesReales, syncCatalogHash, pauseInfinite, resumeInfinite } from './catalog.js';
import { openProductPage, closeProductPage, isProductPageOpen } from './product-page.js';
import { searchProducts, norm } from './search.js';
import { shareLink, siteUrl } from './share.js';
import { addToCart, removeFromCart, updateQuantity, clearCart, updateCartBadge, buildWhatsAppUrl, canAddNow } from './cart.js';
import { onAdded } from './aroma.js';
import { initMayoreo, restoreMayoreo, hasMayoreoSession } from './mayoreo.js';

// Orden del menú de categorías definido por el cliente. Las colecciones que
// vengan de Shopify y no estén en esta lista se muestran después, en el orden
// que las entrega Shopify (no se oculta ninguna).
const MENU_ORDER = [
  'body-care-fragancias', 'perfumes', 'sets-y-regalos', 'hogar',
  'lenceria', 'hombres', 'accesorios',
];
function orderCollections(cols) {
  const rank = h => {
    const i = MENU_ORDER.indexOf(h);
    return i === -1 ? MENU_ORDER.length : i;   // las no listadas, al final
  };
  return [...(cols || [])].sort((a, b) => rank(a.handle) - rank(b.handle));
}

// iOS Safari solo aplica el estado :active (feedback al tocar) si existe
// algún listener de touch. Este listener vacío lo habilita en todo el sitio.
document.addEventListener('touchstart', () => {}, { passive: true });

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initState();
  initMayoreo();
  initMegaMenu();
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
    const [firstPage, collectionsRaw, config] = await Promise.all([
      fetchProductsPage({ first: 250 }),
      fetchCollections(),
      fetchConfig().catch(() => null),
    ]);
    // Orden del menú a gusto del cliente (antes salían en el orden de Shopify).
    const collections = orderCollections(collectionsRaw);

    const waNumber = config?.whatsapp ?? null;
    // Si hay sesión de mayoreo, no mostramos el catálogo normal (se quedan los
    // skeletons) hasta que carguen los precios de mayoreo — evita el flash de
    // precios normales al recargar.
    const mayoreoSession = hasMayoreoSession();
    setState({
      products: mayoreoSession ? [] : firstPage.products,
      collections,
      waNumber,
      hideSoldOut: !!config?.ocultar_agotados,   // ocultar agotados (toggle admin)
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
    // El carrusel se dibuja YA con todas las colecciones (las fotos que aún no
    // estén se rellenan al cargar los lotes siguientes). Así aparece rápido y
    // los puntos no saltan de 3 a 5.
    renderFeatured(firstPage.products, collections);
    handleHashRoute();

    if (mayoreoSession) {
      // Sesión de mayoreo guardada: entra a modo mayoreo y NO carga el catálogo
      // normal en background (evita la carrera que pisaba la restauración).
      restoreMayoreo();
    } else {
      // Carga el resto en background sin bloquear la UI. Cada batch se
      // mergea en state → statechange dispara re-render del grid/sidebar.
      loadRemainingProducts(firstPage.cursor, firstPage.hasNext);
    }
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
      // Si se activó el modo mayoreo mientras cargaba, no mezclar el catálogo normal.
      if (getState().mayoreo) return;
      const { products } = getState();
      // Merge sin duplicados por si una página se reintenta
      const existing = new Set(products.map(p => p.id));
      const merged = products.concat(page.products.filter(p => !existing.has(p.id)));
      setState({ products: merged });
      cursor = page.cursor;
      hasNext = page.hasNext;
      // Con cada lote nuevo, rellena las fotos de las colecciones que faltaban
      fbFillFeaturedImages(merged);
    } catch (err) {
      console.warn('[PinkPower] Background load failed:', err);
      break; // dejamos lo que ya cargamos
    }
  }
  // Marca que ya no llegarán más productos → el sidebar deja de decir "Cargando…"
  setState({ productsLoaded: true });
  // Último intento de rellenar fotos y, si alguna colección quedó sin foto,
  // se le quita el shimmer para que no parpadee para siempre.
  fbFillFeaturedImages(getState().products);
  document.querySelectorAll('#fb-track .fb-slide__imgskel').forEach(el => el.classList.remove('skeleton'));
}

// ── State subscription ────────────────────────────────────
// Solo redibujamos el grid/sidebar cuando cambia algo que les afecta.
// Así, al agregar al carrito (que solo cambia `cart`) NO se recrea el grid
// — antes eso causaba un parpadeo/"recarga" al hacer click en hover.
let _prevRender = {};
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
    renderMegaMenu(collections);
    renderSizeBar(collections);
  }

  // Al entrar en mayoreo, rehacer el carrusel con SOLO las colecciones que
  // tienen al menos un producto con precio de mayoreo. Se hace una vez (al
  // salir de mayoreo la página se recarga, así que vuelve al modo normal).
  if (state.mayoreo && _fbMode !== 'mayoreo' && products.length && collections.length) {
    renderFeatured(products, collectionsWithProducts(products, collections));
    _fbMode = 'mayoreo';
  }

  _prevRender = { products, collections, activeCollection, activeTag, activeSize,
                  priceMin, priceMax, sortBy, searchQuery, currentPage, productsLoaded };

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

// ── Navegación a la ficha de producto (página dedicada) ───
// Abrir la ficha desde el catálogo o desde otra ficha (producto relacionado):
// se apila una entrada en el historial para que "Regresar" y el botón atrás del
// navegador vuelvan al catálogo EXACTAMENTE donde estaba (el catálogo queda
// debajo, congelado, así se conserva la posición del scroll).
let _productFromWithin = false;   // ¿se llegó a la ficha navegando dentro del sitio?
function goToProduct(product) {
  _productFromWithin = true;
  openProductPage(product);
  history.pushState(null, '', `#shop/product/${product.id}`);
}

// "Regresar" desde la ficha. Si se llegó navegando dentro del sitio, se usa el
// historial (vuelve a donde estaba, con su scroll). Si se entró por un link
// compartido directo, se va a la categoría del producto (o al catálogo).
function leaveProduct() {
  if (!isProductPageOpen()) return;
  if (_productFromWithin) {
    history.back();
  } else {
    const p = getState().products.find(x => String(x.id) === String(getState().modalProductId));
    const { collections } = getState();
    const known = new Set((collections || []).map(c => c.handle));
    const handle = p && (p.collectionHandles || []).find(h => known.has(h));
    location.hash = handle ? `#shop/collection/${encodeURIComponent(handle)}` : '#shop';
  }
}

// Si se está en la ficha de un producto y el usuario navega a una categoría/etiqueta
// (desde el menú o el buscador), hay que cerrar la ficha; si no, `body.pp-open`
// sigue ocultando el catálogo y "no pasa nada". Devuelve true si estaba abierta.
function closeProductIfOpen() {
  if (!isProductPageOpen()) return false;
  closeProductPage();
  return true;
}

// Baja hasta el inicio de los productos (descontando el nav fijo).
function scrollToProducts(behavior = 'smooth') {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const navOffset = 80;
  const top = grid.getBoundingClientRect().top + window.scrollY - navOffset;
  window.scrollTo({ top, behavior });
}

// Baja hasta la sección de ubicación. Con scroll infinito la sección está debajo
// de la parrilla y, al saltar, el scroll infinito carga más productos y la corre,
// así que uno cae en medio. En vez de aplanar toda la parrilla (insertar cientos
// de tarjetas era lento, ~2 s antes de moverse), se PAUSA el scroll infinito para
// que el salto no dispare cargas, se baja de una vez, y se reactiva cuando el
// usuario vuelve a subir hacia la parrilla. Es instantáneo: no se toca el DOM.
function scrollToLocation() {
  // pauseInfinite suspende el scroll infinito (frena cargas que corran la sección).
  // El salto es INSTANTÁNEO a propósito: mientras el streaming de productos sigue,
  // cada lote rehace grid.innerHTML y eso cancelaba un scroll suave en curso, así
  // que "tardaba" en llegar. Un salto instantáneo no se puede cancelar. Además se
  // reafirma la posición mientras dura el streaming, por si algún re-render la mueve,
  // y se suelta apenas el usuario decide desplazarse (rueda o touch).
  pauseInfinite();
  const sec = document.getElementById('ubicacion');
  if (!sec) return;
  const navOffset = 80;
  // OJO: behavior 'instant' (no 'auto'). 'auto' respeta el scroll-behavior:smooth
  // del CSS y haría un scroll suave — lento y cancelable por los re-render. 'instant'
  // salta de una.
  const pin = () => window.scrollTo({
    top: sec.getBoundingClientRect().top + window.scrollY - navOffset, behavior: 'instant' });

  pin();   // baja de inmediato, sin retardo

  let ticks = 0;
  const stop = () => {
    clearInterval(iv);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
    armInfiniteResume();
  };
  const iv = setInterval(() => {
    pin();
    if (getState().productsLoaded || ++ticks > 60) stop();   // hasta que cargue todo (tope ~5 s)
  }, 80);
  // Si el usuario empieza a desplazarse, dejamos de reafirmar al instante.
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchmove', stop, { passive: true });
}

// Reactiva el scroll infinito cuando el usuario sube y el centinela vuelve a quedar
// por debajo de la vista. Así, al reconectar el observer, no dispara una carga que
// mueva la página estando en la ubicación; la carga vuelve al bajar de nuevo. Se
// arma cuando ya estamos posados en la ubicación (scroll abajo), así que la
// condición empieza en falso y solo se cumple al subir de vuelta hacia la parrilla.
// (Además, si el usuario navega a otra colección, catalog.js levanta la suspensión.)
function armInfiniteResume() {
  const onScroll = () => {
    const sent = document.getElementById('grid-sentinel');
    if (!sent) { cleanup(); return; }   // todo cargado o parrilla rehecha
    const sentTop = sent.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY + window.innerHeight < sentTop) {
      resumeInfinite();
      cleanup();
    }
  };
  const cleanup = () => window.removeEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll, { passive: true });
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
// Carrusel de colecciones: el CARD se queda fijo y solo cambia/desliza su
// contenido (imagen + título) al pasar de una colección a otra. Así el card
// nunca se mueve y nunca pierde el border-radius durante una transición.
let _fbItems = [];   // [{ handle, title, img }]
let _fbIndex = 0;    // colección visible (0..N-1)
let _fbN = 0;        // cantidad de colecciones
let _fbTimer = null;
let _fbMode = 'normal';  // 'normal' | 'mayoreo' — para reconstruir el carrusel al entrar a mayoreo
let _fbSwipeWired = false;   // para no duplicar los listeners de swipe
let _fbSuppressClick = false; // tras un swipe, ignora el clic que pudiera dispararse
let _fbReq = 0;          // secuencia para descartar precargas de imagen obsoletas (clicks rápidos)

// Colecciones que tienen al menos un producto en la lista dada. En mayoreo,
// `products` son exclusivamente los que tienen precio de mayoreo, así que esto
// deja fuera del carrusel las colecciones sin ningún producto de mayoreo.
function collectionsWithProducts(products, collections) {
  const conProducto = new Set();
  products.forEach(p => p.collectionHandles.forEach(h => conProducto.add(h)));
  return collections.filter(c => conProducto.has(c.handle));
}

function renderFeatured(products, collections) {
  const section = document.getElementById('featured');
  const track   = document.getElementById('fb-track');
  if (!section || !track) return;

  // Una entrada por colección. La foto es un producto AL AZAR de esa colección
  // (cambia en cada visita); puede ser null al inicio y se rellena después.
  _fbItems = collections.map(c => ({
    handle: c.handle,
    title:  c.title,
    img:    pickCollectionImage(products, c.handle),
  }));
  if (_fbItems.length < 2) { section.hidden = true; return; }

  _fbN = _fbItems.length;
  _fbIndex = 0;
  // Un solo card fijo (no se hace scroll). Arranca como skeleton y
  // showFbCollection precarga la foto y la mete (con el título) cuando ya está
  // lista, para que no haya el salto de tamaño al aparecer la imagen.
  track.innerHTML = fbSlideHTML(_fbItems[0].handle, _fbItems[0].title, null, true);
  fbRenderDots(_fbN);
  showFbCollection(0, 1);

  section.hidden = false;
  startFbAuto();
  // Pausa el auto-avance al pasar el mouse (desktop)
  section.onmouseenter = stopFbAuto;
  section.onmouseleave = startFbAuto;
  // Deslizar con el dedo (móvil) para cambiar de colección.
  wireFbSwipe(track);
}

// Swipe táctil en el carrusel: arrastrar a la izquierda avanza, a la derecha
// retrocede. El #fb-track persiste entre renders (solo cambia su contenido), así
// que los listeners se enganchan una sola vez.
function wireFbSwipe(track) {
  if (_fbSwipeWired || !track) return;
  _fbSwipeWired = true;
  let x0 = null, y0 = null;
  track.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    x0 = t.clientX; y0 = t.clientY;
    stopFbAuto();
  }, { passive: true });
  track.addEventListener('touchend', e => {
    if (x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = y0 = null;
    // Solo si es un arrastre horizontal claro (no un toque ni un scroll vertical)
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      _fbSuppressClick = true;                 // que el swipe no abra la colección
      setTimeout(() => { _fbSuppressClick = false; }, 350);
      if (dx < 0) showFbCollection(_fbIndex + 1, 1);
      else        showFbCollection(_fbIndex - 1, -1);
    }
    startFbAuto();
  }, { passive: true });
}

// Cambia el contenido del card a la colección i. La imagen se PRECARGA y el
// contenido (imagen + título) solo se intercambia cuando ya está lista, así no
// hay el salto de tamaño al aparecer la foto. Mientras tanto se queda visible
// el contenido anterior (o el skeleton). Una secuencia (_fbReq) descarta
// precargas que quedaron obsoletas si se avanza rápido.
function showFbCollection(i, dir = 1) {
  if (!_fbN) return;
  i = ((i % _fbN) + _fbN) % _fbN;
  _fbIndex = i;
  const it = _fbItems[i];
  const reqId = ++_fbReq;

  const apply = (withImg) => {
    if (reqId !== _fbReq) return;  // llegó otra navegación mientras precargaba
    const card = document.querySelector('#fb-track .fb-slide');
    if (!card) return;
    const media = card.querySelector('.fb-slide__media');
    const title = card.querySelector('.fb-slide__title');
    card.dataset.fbCollection = it.handle;
    if (media) {
      media.innerHTML = withImg
        ? `<img src="${it.img}" alt="${it.title}" loading="lazy" />`
        : `<div class="fb-slide__imgskel skeleton" aria-hidden="true"></div>`;
    }
    if (title) title.textContent = it.title;
    withImg ? card.removeAttribute('data-fb-noimg') : card.setAttribute('data-fb-noimg', '');
    // Re-dispara la animación de entrada del contenido (slide + fade).
    card.style.setProperty('--fb-dir', dir >= 0 ? '26px' : '-26px');
    card.classList.remove('fb-in');
    void card.offsetWidth;
    card.classList.add('fb-in');
    markFbDot(i);
  };

  if (it.img) {
    const pre = new Image();
    pre.onload  = () => apply(true);
    pre.onerror = () => apply(false);  // si la foto falla, al menos el título
    pre.src = it.img;
    if (pre.complete) apply(true);     // ya estaba en caché → instantáneo
  } else {
    apply(false);  // sin foto todavía: skeleton + título
  }
}

function markFbDot(idx) {
  document.querySelectorAll('#fb-dots .fb-dot').forEach((d, i) =>
    d.classList.toggle('is-active', i === idx));
}

function startFbAuto() {
  stopFbAuto();
  _fbTimer = setInterval(() => showFbCollection(_fbIndex + 1, 1), 5000);
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
  // Si la colección aún no tiene foto (sus productos cargan en un lote
  // posterior), se muestra un skeleton en el área de la imagen y se marca con
  // data-fb-noimg para rellenarla después (ver fbFillFeaturedImages).
  const media = img
    ? `<img src="${img}" alt="${title}" loading="${eager ? 'eager' : 'lazy'}" />`
    : `<div class="fb-slide__imgskel skeleton" aria-hidden="true"></div>`;
  return `
      <article class="fb-slide" data-fb-collection="${handle}"${img ? '' : ' data-fb-noimg'}>
        <div class="fb-slide__media">${media}</div>
        <div class="fb-slide__body">
          <h3 class="fb-slide__title">${title}</h3>
        </div>
      </article>`;
}

// Rellena la foto de las colecciones que aún no la tenían, a medida que van
// cargando más productos. Solo actualiza la lista interna y, si la colección
// visible ahora ya tiene foto, refresca el card (sin re-armar el carrusel).
function fbFillFeaturedImages(products) {
  if (!_fbItems.length) return;
  let refreshCurrent = false;
  _fbItems.forEach((it, i) => {
    if (it.img) return;
    const img = pickCollectionImage(products, it.handle);
    if (img) { it.img = img; if (i === _fbIndex) refreshCurrent = true; }
  });
  // Si la foto de la colección visible acaba de llegar, refrescamos con
  // showFbCollection para que también la precargue y entre sin salto.
  if (refreshCurrent) showFbCollection(_fbIndex, 1);
}

function fbRenderDots(n) {
  const dotsBox = document.getElementById('fb-dots');
  if (!dotsBox) return;
  dotsBox.innerHTML = Array.from({ length: n }, (_, i) =>
    `<button class="fb-dot${i === 0 ? ' is-active' : ''}" data-fb-dot="${i}" aria-label="Ir a la colección ${i + 1}"></button>`
  ).join('');
}

// Abre una colección desde el carrusel (con guard anti doble-disparo).
let _lastColNav = { handle: null, t: 0 };
function goToCollection(handle) {
  const now = Date.now();
  if (_lastColNav.handle === handle && now - _lastColNav.t < 600) return;
  _lastColNav = { handle, t: now };
  clearSearchInput();
  setState({ activeCollection: handle, activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
  history.replaceState(null, '', `#shop/collection/${handle}`);
  document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
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

  // Lupa de búsqueda (móvil y desktop) — abre el buscador de pantalla completa
  if (e.target.closest('.search-toggle')) {
    openSearchOverlay();
    return;
  }

  // Cerrar la cinta lateral al tocar un enlace de navegación (deja que navegue)
  if (e.target.closest('.menu-links a')) {
    closeMenuDrawer();
    // sin return: el ancla navega normalmente (salvo "Ubicación", abajo)
  }

  // "Ubicación" (header o cinta lateral): con scroll infinito el ancla nativa no
  // llega — al saltar hacia abajo se cargan más productos y la sección se corre,
  // así que uno cae en medio de la parrilla. Se cargan todos los productos y se
  // baja con un scroll confiable hasta el recuadro del mapa.
  if (e.target.closest('a[href="#ubicacion"]')) {
    e.preventDefault();
    scrollToLocation();
    return;
  }

  // ── Megamenú de escritorio ──
  // Clic en "Productos": va al catálogo (todos) y cierra el panel.
  if (e.target.closest('#nav-productos')) {
    closeMegaMenu();
    // sin return: el ancla #shop navega/hace scroll normalmente
  }

  // Colección del megamenú (cinta izquierda o "Ver todo X") → toda la categoría.
  const megaCol = e.target.closest('.mega-col, .mega-panel__all');
  if (megaCol) {
    const handle = megaCol.dataset.handle;
    if (!handle) return;
    clearSearchInput();
    const fromProduct = closeProductIfOpen();
    setState({ activeCollection: handle, activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
    history.replaceState(null, '', `#shop/collection/${handle}`);
    closeMegaMenu();
    scrollToProducts(fromProduct ? 'auto' : 'smooth');
    return;
  }

  // Subcategoría del megamenú → filtra por esa etiqueta dentro de la colección.
  const megaTag = e.target.closest('.mega-tag');
  if (megaTag) {
    const handle = megaTag.dataset.handle;
    const tag = megaTag.dataset.tag || null;
    clearSearchInput();
    const fromProduct = closeProductIfOpen();
    setState({ activeCollection: handle, activeTag: tag, activeSize: null, searchQuery: '', currentPage: 1 });
    history.replaceState(null, '', tag
      ? `#shop/tag/${encodeURIComponent(tag)}`
      : `#shop/collection/${handle}`);
    closeMegaMenu();
    scrollToProducts(fromProduct ? 'auto' : 'smooth');
    return;
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

    // Clic en el NOMBRE (o el ícono) → entrar a TODA la categoría (todos sus
    // productos, sin filtro). El desplegar/colapsar subcategorías queda solo en
    // el "+". Así: + abre las subcategorías, el texto entra a la categoría.
    clearSearchInput();
    const fromProduct = closeProductIfOpen();  // si venía del detalle, cierra la ficha
    setState({ activeCollection: clicked, activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
    history.replaceState(null, '', `#shop/collection/${clicked}`);
    closeMenuDrawer();
    if (fromProduct) scrollToProducts('auto'); else scrollToProductsMobile();
    return;
  }

  // Etiqueta dentro de la colección expandida
  const tagBtn = e.target.closest('.tag-btn');
  if (tagBtn) {
    const tag = tagBtn.dataset.tag || null;
    // Limpiar tallas y búsqueda al cambiar de etiqueta del submenú
    clearSearchInput();
    const fromProduct = closeProductIfOpen();  // si venía del detalle, cierra la ficha
    setState({ activeTag: tag, activeSize: null, searchQuery: '', currentPage: 1 });
    // URL compartible: etiqueta sola, o la colección si eligió "Todas"
    const { activeCollection } = getState();
    history.replaceState(null, '', tag
      ? `#shop/tag/${encodeURIComponent(tag)}`
      : (activeCollection ? `#shop/collection/${activeCollection}` : '#shop'));
    closeMenuDrawer();
    if (fromProduct) scrollToProducts('auto'); else scrollToProductsMobile();
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
  if (e.target.closest('#fb-prev')) { showFbCollection(_fbIndex - 1, -1); startFbAuto(); return; }
  if (e.target.closest('#fb-next')) { showFbCollection(_fbIndex + 1, 1); startFbAuto(); return; }
  const fbDot = e.target.closest('[data-fb-dot]');
  if (fbDot) {
    const di = parseInt(fbDot.dataset.fbDot, 10);
    showFbCollection(di, di >= _fbIndex ? 1 : -1);
    startFbAuto();
    return;
  }
  const fbCol = e.target.closest('[data-fb-collection]');
  if (fbCol) {
    if (_fbSuppressClick) return;   // venía de un swipe, no abrir la colección
    goToCollection(fbCol.dataset.fbCollection);
    return;
  }

  // Product card click → open detail (unless hitting the add-to-cart button)
  const card = e.target.closest('.product-card');
  if (card && !e.target.closest('[data-action]')) {
    const id = card.dataset.id;
    const { products } = getState();
    const product = products.find(p => p.id === id);
    if (product) goToProduct(product);
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
      goToProduct(product);
    }
    if (actionBtn.dataset.action === 'add-to-cart') {
      // Con tallas/variantes reales no se agrega directo: se abre la ficha para
      // que la clienta elija la talla primero.
      if (tieneVariantesReales(product)) {
        goToProduct(product);
        return;
      }
      const variant = product.variants.find(v => v.availableForSale) || product.variants[0];
      if (variant && canAddNow(variant.id)) onAdded(product, addToCart(product, variant));
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
  _searchDebounce = setTimeout(() => {
    setState({ searchQuery: e.target.value.trim(), currentPage: 1 });
    syncCatalogHash();   // refleja la búsqueda en la URL (para compartir)
  }, 300);
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
  if (e.key !== 'Escape') return;
  // El visor de foto a pantalla completa cierra con su propio Escape; no salir de
  // la ficha en ese caso.
  const lb = document.getElementById('img-lightbox');
  if (lb && !lb.hidden) return;
  closeSearchOverlay();
  closeCheckoutModal();
  leaveProduct();
});

// El breadcrumb de la ficha son anclas nativas (#shop/...) que cambian el hash y
// disparan la navegación por handleHashRoute; no necesita JS aquí. Cerrar con la
// tecla Escape o el botón atrás del navegador sí usa leaveProduct().

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
    // "Ver todos los resultados" → filtrar la tienda por esa búsqueda (todos,
    // paginados) y cerrar el buscador.
    const seeall = e.target.closest('.search-seeall');
    if (seeall) {
      const q = seeall.dataset.q || '';
      closeSearchOverlay();
      closeProductIfOpen();
      const si = document.getElementById('search-input');
      if (si) si.value = q;
      setState({ searchQuery: q, activeCollection: null, activeTag: null, activeSize: null, currentPage: 1 });
      syncCatalogHash();
      scrollToProducts('smooth');
      return;
    }

    // Sugerencia de colección o etiqueta → ir a esa categoría
    const cat = e.target.closest('.search-cat');
    if (cat) {
      closeSearchOverlay();
      clearSearchInput();
      closeProductIfOpen();
      if (cat.dataset.collection) {
        setState({ activeCollection: cat.dataset.collection, activeTag: null, activeSize: null, searchQuery: '', currentPage: 1 });
        history.replaceState(null, '', `#shop/collection/${cat.dataset.collection}`);
      } else if (cat.dataset.tag) {
        setState({ activeCollection: null, activeTag: cat.dataset.tag, activeSize: null, searchQuery: '', currentPage: 1 });
        history.replaceState(null, '', `#shop/tag/${encodeURIComponent(cat.dataset.tag)}`);
      }
      scrollToProducts('smooth');
      return;
    }

    const btn = e.target.closest('.search-result');
    if (!btn) return;
    const product = getState().products.find(p => p.id === btn.dataset.id);
    if (product) {
      closeSearchOverlay();
      goToProduct(product);
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

  const nq = norm(q);

  // Colecciones y etiquetas que coinciden con la búsqueda
  const collMatches = collections.filter(c => norm(c.title).includes(nq));
  const allTags = [...new Set(products.flatMap(p => p.tags || []))];
  const tagMatches = allTags.filter(t => norm(t).includes(nq)).slice(0, 8);
  // Productos que coinciden (mostramos los primeros; si hay más, abajo se ofrece
  // "Ver todos" para verlos completos en la tienda).
  const SHOWN = 40;
  let allProd = searchProducts(products, q, collections);
  // Si la admin activó "ocultar agotados", no los mostramos en el buscador.
  if (getState().hideSoldOut) allProd = allProd.filter(p => p.availableForSale);
  const prodMatches = allProd.slice(0, SHOWN);

  if (!collMatches.length && !tagMatches.length && !prodMatches.length) {
    box.innerHTML = `<p class="search-ov__hint">No se encontraron resultados.</p>`;
    return;
  }

  const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  let html = '';

  if (collMatches.length || tagMatches.length) {
    html += `<p class="search-ov__section">Colecciones</p>`;
    html += collMatches.map(c => `
      <button class="search-cat" data-collection="${attr(c.handle)}">
        <span class="search-cat__name">${escHtml(c.title)}</span>
      </button>`).join('');
    html += tagMatches.map(t => `
      <button class="search-cat" data-tag="${attr(t)}">
        <span class="search-cat__name">${escHtml(t)}</span>
      </button>`).join('');
  }

  if (prodMatches.length) {
    html += `<p class="search-ov__section">Productos</p>`;
    html += prodMatches.map(p => {
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
    // Siempre ofrecer abrir estos resultados en la tienda (para verlos completos
    // y para poder compartir el grupo con el botón "Compartir esta búsqueda").
    const seeallLabel = allProd.length > prodMatches.length
      ? `Ver todos los resultados (${allProd.length})`
      : `Ver estos resultados en la tienda`;
    html += `<button class="search-seeall" data-q="${attr(q)}">${seeallLabel}</button>`;
  }

  box.innerHTML = html;
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

// ── Megamenú de escritorio (hover en "Productos") ───────────
// Abre al pasar el mouse por "Productos" o el propio panel; cierra al salir con
// un pequeño retardo (para poder mover el mouse del enlace al panel sin que se
// cierre). Al pasar sobre una colección de la cinta, cambia el panel de la
// derecha. Los clics (colección/subcategoría) los maneja la delegación global.
function closeMegaMenu() {
  const mega = document.getElementById('mega-menu');
  if (!mega) return;
  mega.classList.remove('is-open');
  mega.setAttribute('aria-hidden', 'true');
  document.getElementById('nav-productos')?.setAttribute('aria-expanded', 'false');
}

function setMegaActive(idx) {
  document.querySelectorAll('.mega-col').forEach(c => {
    const on = c.dataset.idx === idx;
    c.classList.toggle('is-active', on);
    c.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.mega-panel').forEach(p =>
    p.classList.toggle('is-active', p.dataset.idx === idx));
}

function initMegaMenu() {
  const item = document.querySelector('.nav-mega-item');
  const mega = document.getElementById('mega-menu');
  if (!item || !mega) return;

  let closeT = null;
  const openMega = () => {
    // Solo en escritorio (en móvil el panel está oculto y manda la cinta lateral).
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    clearTimeout(closeT);
    mega.classList.add('is-open');
    mega.setAttribute('aria-hidden', 'false');
    document.getElementById('nav-productos')?.setAttribute('aria-expanded', 'true');
  };
  const scheduleClose = () => { clearTimeout(closeT); closeT = setTimeout(closeMegaMenu, 140); };

  item.addEventListener('mouseenter', openMega);
  item.addEventListener('mouseleave', scheduleClose);
  // Accesibilidad con teclado: al enfocar/tabular dentro, se abre.
  item.addEventListener('focusin', openMega);
  item.addEventListener('focusout', e => {
    if (!item.contains(e.relatedTarget)) scheduleClose();
  });

  // Pasar el mouse por una colección de la cinta cambia el panel derecho.
  document.getElementById('mega-rail')?.addEventListener('mouseover', e => {
    const col = e.target.closest('.mega-col');
    if (col) setMegaActive(col.dataset.idx);
  });
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

  // Extrafinanciamiento BAC: solo se habilita si el SUBTOTAL de productos
  // (sin flete ni comisiones) es igual o mayor a L. 3,000.
  const productsSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const esMayoreo = getState().mayoreo;
  // En mayoreo no se ofrece pago con tarjeta (solo transferencia o efectivo).
  const showExtrafin = productsSubtotal >= 3000 && !esMayoreo;

  const summaryLines = cart.map(i => {
    const varLabel = i.variantTitle !== 'Default Title' ? ` <span class="co-variant">(${i.variantTitle})</span>` : '';
    const price = (i.price * i.quantity).toLocaleString('es-HN', { minimumFractionDigits: 2 });
    return `
      <div class="co-item">
        <span class="co-item__info">
          <span class="co-item__name">${i.productTitle}${varLabel}</span>
          <span class="co-item__qty">Cant. ${i.quantity}</span>
        </span>
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
            <label class="co-radio">
              <input type="radio" name="co-delivery" value="pickup" checked />
              <span class="co-radio__text">
                <span class="co-radio__title"><span class="co-radio__emoji">🏪</span> Recoger en tienda</span>
                <span class="co-radio__sub">(Lun. a Sáb. 10 am - 7 pm)</span>
              </span>
              <em class="co-radio__price">GRATIS</em>
            </label>
            <label class="co-radio">
              <input type="radio" name="co-delivery" value="sps" />
              <span class="co-radio__text">
                <span class="co-radio__title"><span class="co-radio__emoji">🛵</span> Envío SPS</span>
                <span class="co-radio__sub">Recíbelo hoy en 2-6 horas</span>
              </span>
              <em class="co-radio__price">L. 95.00</em>
            </label>
            <label class="co-radio">
              <input type="radio" name="co-delivery" value="outside" />
              <span class="co-radio__text">
                <span class="co-radio__title"><span class="co-radio__emoji">📦</span> Envío nacional</span>
                <span class="co-radio__sub">1-2 días hábiles</span>
              </span>
              <em class="co-radio__price">L. 110.00</em>
            </label>
          </div>
        </div>
        <div class="co-field">
          <p class="co-field__label">Tipo de pago *</p>
          <div class="co-options">
            <label class="co-radio">
              <input type="radio" name="co-payment" value="transfer" checked />
              <span class="co-radio__text">
                <span class="co-radio__title"><span class="co-radio__emoji">🏦</span> Transferencia</span>
                <span class="co-radio__sub">(BAC / Atlántida / Banpaís / Ficohsa / Occidente)</span>
              </span>
            </label>
            ${!esMayoreo ? `
            <label class="co-radio">
              <input type="radio" name="co-payment" value="card" />
              <span class="co-radio__text"><span class="co-radio__title"><span class="co-radio__emoji">💳</span> Tarjeta / Link de Pago</span></span>
            </label>` : ''}
            <label class="co-radio">
              <input type="radio" name="co-payment" value="cash" />
              <span class="co-radio__text">
                <span class="co-radio__title"><span class="co-radio__emoji">💵</span> Efectivo</span>
                <span class="co-radio__sub">Pago contra entrega fuera de SPS aplica una comisión del 5%</span>
              </span>
            </label>
            ${showExtrafin ? `
            <label class="co-radio">
              <input type="radio" name="co-payment" value="extrafin" />
              <span class="co-radio__text">
                <span class="co-radio__title"><span class="co-radio__emoji">🗓️</span> Extrafinanciamiento</span>
                <span class="co-radio__sub">0% interés a 6 meses con tarjetas BAC</span>
              </span>
            </label>` : ''}
          </div>
        </div>

        <div class="co-totals" id="co-totals"></div>

        <div class="co-field">
          <label for="co-name">Nombre completo *</label>
          <input type="text" id="co-name" required placeholder="Nombre y Apellido" autocomplete="name" />
        </div>
        <div class="co-field">
          <label for="co-phone">Teléfono *</label>
          <input type="tel" id="co-phone" required value="+504 " placeholder="+504 0000-0000" autocomplete="tel" />
        </div>
        <div class="co-field">
          <label for="co-email">Email <span class="co-optional">(opcional)</span></label>
          <input type="email" id="co-email" placeholder="tu@correo.com" autocomplete="email" />
        </div>
        <p class="co-error" id="co-error" hidden></p>
        <button type="submit" class="btn btn-primary co-submit" id="co-submit">
          Finalizar por WhatsApp
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // En mayoreo, prellenar nombre y teléfono con los datos del perfil de la
  // mayorista (los deja editar por si quiere otro contacto para este pedido).
  const stCo = getState();
  if (stCo.mayoreo) {
    if (stCo.mayoreoUser) modal.querySelector('#co-name').value = stCo.mayoreoUser;
    if (stCo.mayoreoTelefono) modal.querySelector('#co-phone').value = stCo.mayoreoTelefono;
  }

  // Totales iniciales + recálculo al cambiar entrega/pago
  updateCoTotals(modal);
  modal.querySelector('#co-form').addEventListener('change', e => {
    if (e.target.name === 'co-delivery' || e.target.name === 'co-payment') updateCoTotals(modal);
  });

  // Abrir mostrando el inicio (resumen del pedido + opciones), no el campo de
  // datos. Antes el focus automático al nombre scrolleaba hasta el fondo en móvil.
  const panel = modal.querySelector('.co-panel');
  if (panel) panel.scrollTop = 0;

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
  pickup:  { label: 'Recoger en tienda', cost: 0 },
  sps:     { label: 'Envío SPS',         cost: 95 },
  outside: { label: 'Envío nacional',    cost: 110 },
};
const PAYMENT = {
  transfer: { label: 'Transferencia' },
  card:     { label: 'Tarjeta / Link de Pago' },
  cash:     { label: 'Efectivo' },
  extrafin: { label: 'Extrafinanciamiento 0% interés a 6 meses con tarjetas BAC' },
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
      <div class="co-total-row"><span>Subtotal</span><span>${fmt(t.productsTotal)}</span></div>
      <div class="co-total-row"><span>Envío</span><span>${t.shipping ? fmt(t.shipping) : 'Gratis'}</span></div>
      ${t.commission > 0 ? `<div class="co-total-row co-total-row--fee"><span>Comisión (5%)</span><span>${fmt(t.commission)}</span></div>` : ''}
      <div class="co-total-row co-total-row--grand"><span>Total a pagar</span><span>${fmt(t.finalTotal)}</span></div>
    `;
  }
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

  // El carrito puede haber quedado vacío (p. ej. tras quitar los agotados): no
  // tiene sentido mandar un pedido sin productos.
  if (!cart.length) {
    showCoError('Tu carrito quedó vacío. Agrega productos para finalizar.');
    if (submitBtn) { submitBtn.textContent = 'Finalizar por WhatsApp'; submitBtn.disabled = false; }
    return;
  }

  // Si el cliente no deja correo, se arma uno técnico con su teléfono para que
  // Shopify lo identifique (con su nombre y teléfono) y no lo cree "desconocido".
  const phoneDigits = String(phone).replace(/\D/g, '');
  const customerEmail = email || (phoneDigits ? `${phoneDigits}@pinkpowerhn.com` : undefined);

  const orderPayload = {
    customer_name: name,
    phone,
    email: customerEmail,
    // Tipo de envío y de pago van a las notas del pedido en Shopify, para que
    // Aylin los tenga aunque la clienta no llegue a mandar el mensaje de WhatsApp.
    envio: checkout?.deliveryLabel || null,
    pago:  checkout?.paymentLabel  || null,
    line_items: cart.map(i => ({
      variant_id: i.variantId,
      quantity:   i.quantity,
      price:      i.price.toFixed(2),
    })),
  };

  try {
    // En mayoreo, se manda el token para que el pedido use precios de mayoreo y
    // la etiqueta "mayoreo" en Shopify.
    const mayoreoToken = getState().mayoreo ? localStorage.getItem('pinkpower_mayoreo_token') : null;
    const orderData = await postOrder(orderPayload, mayoreoToken);

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
    const detail = err?.body?.detail;
    // 409: algo se agotó entre que cargó la página y el momento de pagar. Se
    // quitan esos productos del carrito y se le explica a la clienta.
    if (err?.status === 409 && detail?.error === 'stock' && Array.isArray(detail.agotados)) {
      quitarAgotados(detail.agotados);
    } else {
      showCoError('No se pudo crear el pedido. Por favor intenta de nuevo.');
    }
    if (submitBtn) { submitBtn.textContent = 'Finalizar por WhatsApp'; submitBtn.disabled = false; }
  }
}

// Quita del carrito los productos que se agotaron y avisa a la clienta para que
// pueda terminar con el resto.
function quitarAgotados(agotados) {
  const ids = new Set(agotados.map(a => String(a.variant_id)));
  const { cart } = getState();
  const restante = cart.filter(i => !ids.has(String(i.variantId)));
  setState({ cart: restante });

  const nombres = [...new Set(agotados.map(a => a.title))].join(', ');
  const seAgoto = agotados.length === 1 ? 'Se agotó' : 'Se agotaron';
  showCoError(restante.length
    ? `${seAgoto}: ${nombres}. Lo quitamos del carrito para que puedas finalizar con el resto.`
    : `${seAgoto}: ${nombres}. Ya no queda nada disponible en tu carrito.`);
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
//   #shop/product/<id>          → ficha de un producto (página dedicada)
function handleHashRoute() {
  const hash  = location.hash;
  const isShop = hash.startsWith('#shop');
  const path  = isShop ? hash.replace('#shop', '').replace(/^\//, '') : '';
  const parts = path.split('/').filter(Boolean);

  // Producto → abrir su ficha (la URL ya la refleja, no se apila historial aquí)
  if (isShop && parts[0] === 'product' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    const product = getState().products.find(p => String(p.id) === id);
    if (product) {
      openProductPage(product);
    } else {
      // Aún no cargó en el catálogo (está en un lote posterior). Se trae
      // directo por id para que un link compartido abra la ficha al instante.
      fetchProductById(id).then(p => { if (p) openProductPage(p); }).catch(() => {});
    }
    return;
  }

  // Cualquier otra ruta (catálogo, home u otra sección): si la ficha estaba
  // abierta, se cierra. El catálogo quedó debajo intacto, así que al volver a la
  // MISMA vista se conserva la posición y no se hace scroll; solo se baja a los
  // productos en una navegación real a otra vista (p. ej. otra categoría).
  const wasPageOpen = isProductPageOpen();
  if (wasPageOpen) closeProductPage();

  // Fuera de #shop no se tocan los filtros del catálogo (queda como estaba debajo).
  if (!isShop) return;

  const st = getState();
  const setSearchInput = v => document.querySelectorAll('#search-input').forEach(i => { i.value = v; });

  let target, isFilterView;
  if (parts[0] === 'search' && parts[1]) {
    const q = decodeURIComponent(parts.slice(1).join('/'));
    target = { activeCollection: null, activeTag: null, searchQuery: q };
    isFilterView = true;
  } else if (parts[0] === 'collection' && parts[1]) {
    target = { activeCollection: decodeURIComponent(parts[1]), activeTag: null, searchQuery: '' };
    isFilterView = true;
  } else if (parts[0] === 'tag' && parts[1]) {
    target = { activeCollection: null, activeTag: decodeURIComponent(parts[1]), searchQuery: '' };
    isFilterView = true;
  } else {
    target = { activeCollection: null, activeTag: null, searchQuery: '' };
    isFilterView = false;
  }

  const sameView = st.activeCollection === target.activeCollection
                && st.activeTag === target.activeTag
                && st.searchQuery === target.searchQuery;

  setSearchInput(target.searchQuery);
  setState({ ...target, currentPage: 1 });

  // Bajar a los productos solo en navegación real (no al regresar a la misma vista).
  if (isFilterView && !(wasPageOpen && sameView)) scrollToProductsWhenReady();
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
