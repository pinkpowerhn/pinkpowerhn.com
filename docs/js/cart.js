import { getState, setState } from './state.js';

// ── Key ───────────────────────────────────────────────────
function cartKey(productId, variantId) {
  return `${productId}__${variantId}`;
}

// ── Anti doble/triple clic ────────────────────────────────
// Evita que clics muy seguidos sobre el mismo producto agreguen 2 o 3 piezas
// sin que la clienta se dé cuenta. Devuelve false si el clic llega demasiado
// rápido tras el anterior del mismo producto.
let _lastAdd = { id: null, t: 0 };
export function canAddNow(variantId, windowMs = 600) {
  const now = Date.now();
  if (_lastAdd.id === variantId && now - _lastAdd.t < windowMs) return false;
  _lastAdd = { id: variantId, t: now };
  return true;
}

// ── Mutations ─────────────────────────────────────────────
export function addToCart(product, variant) {
  const cart = getState().cart.map(i => ({ ...i })); // shallow clone items
  const key  = cartKey(product.id, variant.id);
  const existing = cart.find(i => i._key === key);

  const maxQty = variant.inventoryQuantity; // null = unlimited

  if (existing) {
    if (maxQty !== null && existing.quantity >= maxQty) return 'limit'; // at stock limit
    existing.quantity += 1;
  } else {
    cart.push({
      _key:         key,
      productId:    product.id,
      variantId:    variant.id,
      variantTitle: variant.title,
      productTitle: product.title,
      price:        variant.price,
      imageUrl:     product.images[0]?.url || '',
      quantity:     1,
      maxQty,
    });
  }

  setState({ cart });
  return 'added';
  updateCartBadge();
}

export function removeFromCart(key) {
  const cart = getState().cart.filter(i => i._key !== key);
  setState({ cart });
  updateCartBadge();
}

export function updateQuantity(key, delta) {
  const cart = getState().cart.map(i => {
    if (i._key !== key) return i;
    const newQty = Math.max(1, i.quantity + delta);
    const capped = i.maxQty !== null ? Math.min(newQty, i.maxQty) : newQty;
    return { ...i, quantity: capped };
  });
  setState({ cart });
  updateCartBadge();
}

export function clearCart() {
  setState({ cart: [] });
  updateCartBadge();
}

// ── Derived ───────────────────────────────────────────────
export function getCartTotal() {
  return getState().cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function getCartCount() {
  return getState().cart.reduce((sum, i) => sum + i.quantity, 0);
}

// ── Badge ─────────────────────────────────────────────────
let _lastCount = 0;
export function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count;
  badge.hidden = count === 0;

  // Animar el ícono del carrito cuando sube el contador (feedback de "se agregó")
  if (count > _lastCount) {
    const toggle = document.getElementById('cart-toggle');
    if (toggle) {
      toggle.classList.remove('cart-bump');
      void toggle.offsetWidth; // reinicia la animación
      toggle.classList.add('cart-bump');
    }
  }
  _lastCount = count;
}

// ── WhatsApp checkout ─────────────────────────────────────
// whatsappNumber must be fetched from GET /config by the caller — never stored here
export function buildWhatsAppMessage(orderName = null, checkout = null) {
  const cart = getState().cart;
  if (!cart.length) return '';

  const fmt = n => Number(n).toLocaleString('es-HN', { minimumFractionDigits: 2 });

  const lines = cart.map(i => {
    const variantLabel = i.variantTitle !== 'Default Title' ? ` (${i.variantTitle})` : '';
    const price = fmt(i.price * i.quantity);
    return `* ${i.productTitle}${variantLabel} x${i.quantity} — L. ${price}`;
  });

  // Encabezado con el número de pedido (o intención de pedido si aún no existe).
  const header = orderName
    ? `¡Hola! 👋\n\nAcabo de realizar mi pedido ${orderName} en Pink Power 💗`
    : `¡Hola! 👋\n\nMe gustaría hacer el siguiente pedido en Pink Power 💗`;

  // Totales: subtotal, envío (si aplica), comisión (si aplica) y total a pagar.
  let totalsBlock;
  if (checkout) {
    const rows = [`Subtotal: L. ${fmt(checkout.productsTotal)}`];
    if (checkout.shipping > 0) rows.push(`Envío: L. ${fmt(checkout.shipping)}`);
    if (checkout.commission > 0) rows.push(`Comisión por pago contra entrega (5%): L. ${fmt(checkout.commission)}`);
    rows.push(`Total a pagar: L. ${fmt(checkout.finalTotal)}`);
    totalsBlock = rows.join('\n');
  } else {
    totalsBlock = `Total: L. ${fmt(getCartTotal())}`;
  }

  // Datos de entrega: nombre y teléfono de la clienta, método de entrega y forma
  // de pago. Así Aylin sabe quién escribe aunque el WhatsApp del remitente sea
  // distinto al número que dejó en el formulario.
  let dataBlock = '';
  if (checkout && checkout.customerName) {
    const rows = ['📦 Datos de Entrega:', `Nombre: ${checkout.customerName}`];
    if (checkout.customerPhone) rows.push(`Teléfono: ${checkout.customerPhone}`);
    if (checkout.deliveryLabel) rows.push(checkout.deliveryLabel);
    if (checkout.paymentLabel) {
      const pago = checkout.cashOnDelivery ? 'Efectivo contra entrega' : checkout.paymentLabel;
      rows.push(`Pago: ${pago}`);
    }
    dataBlock = `\n\n${rows.join('\n')}`;
  }

  const footer = '\n\n¡Quedo pendiente de la confirmación de mi pedido! ✨';

  return `${header}\n\n${lines.join('\n')}\n\n${totalsBlock}${dataBlock}${footer}`;
}

export function buildWhatsAppUrl(number, orderName = null, checkout = null) {
  const msg = buildWhatsAppMessage(orderName, checkout);
  if (!msg) return `https://wa.me/${number}`;

  const encoded = encodeURIComponent(msg);
  const url = `https://wa.me/${number}?text=${encoded}`;

  // Guard: WhatsApp URL ~4000 char limit
  if (url.length > 4000) {
    const fallback = encodeURIComponent('Hola! Me gustaría hacer un pedido. ¿Me pueden ayudar?');
    return `https://wa.me/${number}?text=${fallback}`;
  }

  return url;
}
