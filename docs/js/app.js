import { initState, getState, setState, on } from './state.js';
import { fetchProducts, fetchCollections, fetchConfig, checkHealth } from './api.js';
import { renderSkeletons, renderCollectionSidebar, renderProductGrid } from './catalog.js';
import { openModal, closeModal } from './modal.js';
import { addToCart, removeFromCart, updateCartBadge, buildWhatsAppUrl } from './cart.js';

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initState();
  updateCartBadge();
  renderSkeletons(8);

  // Health check — non-blocking, shows banner on failure
  checkHealth().catch(() =>
    showApiBanner('El servicio está temporalmente no disponible. Intenta más tarde.')
  );

  try {
    const [products, collections] = await Promise.all([fetchProducts(), fetchCollections()]);
    setState({ products, collections });
    handleHashRoute(); // Apply any hash pre-selection after data is ready
  } catch (err) {
    console.error('[PinkPower] Data load error:', err);
    showApiBanner('No se pudo cargar el catálogo. Por favor recarga la página.');
  }
});

// ── State subscription — re-render on every change ────────
on('statechange', state => {
  const { products, collections, activeCollection, searchQuery } = state;

  if (products.length) {
    renderProductGrid(products, collections, activeCollection, searchQuery);
    renderCollectionSidebar(collections);
  }

  renderCartDrawer();
  updateCartBadge();
});

// ── Global click delegation ───────────────────────────────
document.addEventListener('click', e => {
  // ── Collection sidebar button
  const collBtn = e.target.closest('.collection-btn');
  if (collBtn) {
    const handle = collBtn.dataset.handle || null;
    setState({ activeCollection: handle });
    history.replaceState(null, '', handle ? `#shop/collection/${handle}` : '#shop');
    return;
  }

  // ── Product card overlay actions
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
      if (variant) addToCart(product, variant);
    }
    return;
  }

  // ── Cart toggle (nav icon)
  if (e.target.closest('#cart-toggle')) {
    const open = !getState().cartOpen;
    setState({ cartOpen: open });
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.hidden = !open;
    return;
  }

  // ── Cart drawer close (button or backdrop)
  if (e.target.closest('#cart-close') || e.target.id === 'cart-overlay') {
    setState({ cartOpen: false });
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.hidden = true;
    return;
  }

  // ── Remove cart item
  const removeBtn = e.target.closest('[data-cart-remove]');
  if (removeBtn) {
    removeFromCart(removeBtn.dataset.cartRemove);
    return;
  }

  // ── Checkout
  if (e.target.closest('#checkout-btn')) {
    handleCheckout();
    return;
  }

  // ── WhatsApp FAB
  if (e.target.closest('#wa-fab')) {
    handleFabClick(e);
    return;
  }
});

// ── Search — 300ms debounce ───────────────────────────────
let _searchDebounce = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'search-input') return;
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => {
    setState({ searchQuery: e.target.value.trim() });
  }, 300);
});

// ── Keyboard ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ── WhatsApp checkout (fetch config on click only) ────────
async function handleCheckout() {
  const btn = document.getElementById('checkout-btn');
  if (btn) { btn.textContent = 'Cargando...'; btn.disabled = true; }

  try {
    const config = await fetchConfig();
    const url = buildWhatsAppUrl(config.whatsapp);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    console.error('[PinkPower] Checkout error:', err);
    alert('No se pudo iniciar el pedido. Por favor intenta de nuevo.');
  } finally {
    if (btn) { btn.textContent = 'Confirmar por WhatsApp'; btn.disabled = false; }
  }
}

async function handleFabClick(e) {
  e.preventDefault();
  const fab = document.getElementById('wa-fab');
  if (fab) fab.style.opacity = '0.6';

  try {
    const config = await fetchConfig();
    window.open(`https://wa.me/${config.whatsapp}`, '_blank', 'noopener,noreferrer');
  } catch (_) {
    // Fallback: open WhatsApp without a number
    window.open('https://wa.me/', '_blank', 'noopener,noreferrer');
  } finally {
    if (fab) fab.style.opacity = '';
  }
}

// ── Cart drawer HTML render ───────────────────────────────
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
        const linePrice  = (i.price * i.quantity).toLocaleString('es-HN', { minimumFractionDigits: 2 });
        const varLabel   = i.variantTitle !== 'Default Title'
          ? `<span class="ci-variant">${i.variantTitle}</span>`
          : '';
        return `
          <div class="cart-item">
            <img class="cart-item__img" src="${i.imageUrl}" alt="${i.productTitle}"
                 onerror="this.style.display='none'" loading="lazy" />
            <div class="cart-item__info">
              <p class="cart-item__name">${i.productTitle}</p>
              ${varLabel}
              <p class="cart-item__price">L. ${linePrice}</p>
              <p class="cart-item__qty">Cant: ${i.quantity}</p>
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
      <button class="btn btn-primary cart-checkout" id="checkout-btn">Confirmar por WhatsApp</button>
    </div>
  ` : '';

  drawer.innerHTML = `
    <div id="cart-overlay"></div>
    <div class="cart-panel">
      <div class="cart-header">
        <p class="cart-title">Mi Carrito</p>
        <button id="cart-close" aria-label="Cerrar carrito">&times;</button>
      </div>
      <div class="cart-items">${itemsHTML}</div>
      ${footerHTML}
    </div>
  `;
}

// ── Hash routing ──────────────────────────────────────────
function handleHashRoute() {
  const hash = location.hash;
  if (!hash.startsWith('#shop')) return;

  const path  = hash.replace('#shop', '').replace(/^\//, '');
  const parts = path.split('/');

  if (parts[0] === 'collection' && parts[1]) {
    setState({ activeCollection: parts[1] });
  }

  if (parts[0] === 'product' && parts[1]) {
    const { products } = getState();
    const product = products.find(p => p.id === parts[1]);
    if (product) openModal(product);
  }
}

window.addEventListener('hashchange', () => {
  const { products } = getState();
  if (products.length) handleHashRoute();
});

// ── API error banner ──────────────────────────────────────
function showApiBanner(message) {
  if (document.getElementById('api-error-banner')) return;
  const banner = document.createElement('div');
  banner.id        = 'api-error-banner';
  banner.className = 'api-error-banner';
  banner.textContent = message;
  const shop = document.getElementById('shop');
  if (shop) shop.prepend(banner);
}
