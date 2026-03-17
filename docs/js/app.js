import { initState, getState, setState, on } from './state.js';
import { fetchProducts, fetchCollections, fetchConfig, checkHealth, postOrder } from './api.js';
import { renderSkeletons, renderCollectionSidebar, renderProductGrid, renderCollectionShowcase } from './catalog.js';
import { openModal, closeModal } from './modal.js';
import { addToCart, removeFromCart, updateQuantity, clearCart, updateCartBadge, buildWhatsAppUrl } from './cart.js';

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initState();
  updateCartBadge();
  renderSkeletons(8);

  checkHealth().catch(() =>
    showApiBanner('El servicio está temporalmente no disponible. Intenta más tarde.')
  );

  try {
    const [products, collections] = await Promise.all([fetchProducts(), fetchCollections()]);
    setState({ products, collections });
    renderCollectionShowcase(collections, products);
    handleHashRoute();
  } catch (err) {
    console.error('[PinkPower] Data load error:', err);
    showApiBanner('No se pudo cargar el catálogo. Por favor recarga la página.');
  }
});

// ── State subscription ────────────────────────────────────
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

  // Collection sidebar
  const collBtn = e.target.closest('.collection-btn');
  if (collBtn) {
    const handle = collBtn.dataset.handle || null;
    setState({ activeCollection: handle });
    history.replaceState(null, '', handle ? `#shop/collection/${handle}` : '#shop');
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
      if (variant) addToCart(product, variant);
    }
    return;
  }

  // Cart toggle
  if (e.target.closest('#cart-toggle')) {
    const open = !getState().cartOpen;
    setState({ cartOpen: open });
    document.getElementById('cart-drawer').hidden = !open;
    return;
  }

  // Cart close
  if (e.target.closest('#cart-close') || e.target.id === 'cart-overlay') {
    setState({ cartOpen: false });
    document.getElementById('cart-drawer').hidden = true;
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

  // WhatsApp FAB
  if (e.target.closest('#wa-fab')) {
    handleFabClick(e);
    return;
  }
});

// ── Search ────────────────────────────────────────────────
let _searchDebounce = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'search-input') return;
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => setState({ searchQuery: e.target.value.trim() }), 300);
});

// ── Keyboard ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeCheckoutModal();
  }
});

// ── WhatsApp FAB (contact, no cart) ──────────────────────
async function handleFabClick(e) {
  e.preventDefault();
  const fab = document.getElementById('wa-fab');
  if (fab) fab.style.opacity = '0.6';
  try {
    const config = await fetchConfig();
    window.open(`https://wa.me/${config.whatsapp}`, '_blank', 'noopener,noreferrer');
  } catch (_) {
    window.open('https://wa.me/', '_blank', 'noopener,noreferrer');
  } finally {
    if (fab) fab.style.opacity = '';
  }
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
              ${i.maxQty !== null && i.maxQty <= 5
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

// ── Checkout modal ────────────────────────────────────────
function showCheckoutModal() {
  if (document.getElementById('checkout-modal')) return;

  const { cart } = getState();
  const total = cart
    .reduce((s, i) => s + i.price * i.quantity, 0)
    .toLocaleString('es-HN', { minimumFractionDigits: 2 });

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
        <div class="co-summary__total">
          <span>Total</span>
          <span>L. ${total}</span>
        </div>
      </div>

      <form id="co-form" novalidate>
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

    await submitCheckout(name, phone, email);
  });
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

async function submitCheckout(name, phone, email) {
  const submitBtn = document.getElementById('co-submit');
  if (submitBtn) { submitBtn.textContent = 'Creando pedido...'; submitBtn.disabled = true; }

  const { cart } = getState();

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
    // Create order + fetch WA number in parallel
    const [orderData, config] = await Promise.all([
      postOrder(orderPayload),
      fetchConfig(),
    ]);

    const orderName = orderData?.order?.name || null; // e.g. "#1011"
    const url = buildWhatsAppUrl(config.whatsapp, orderName);

    window.open(url, '_blank', 'noopener,noreferrer');

    clearCart();
    closeCheckoutModal();

    // Close cart drawer
    setState({ cartOpen: false });
    document.getElementById('cart-drawer').hidden = true;

  } catch (err) {
    console.error('[PinkPower] Order error:', err);
    showCoError('No se pudo crear el pedido. Por favor intenta de nuevo.');
    if (submitBtn) { submitBtn.textContent = 'Crear Pedido y Continuar por WhatsApp'; submitBtn.disabled = false; }
  }
}

// ── Hash routing ──────────────────────────────────────────
function handleHashRoute() {
  const hash  = location.hash;
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
