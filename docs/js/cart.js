import { getState, setState } from './state.js';

// ── Key ───────────────────────────────────────────────────
function cartKey(productId, variantId) {
  return `${productId}__${variantId}`;
}

// ── Mutations ─────────────────────────────────────────────
export function addToCart(product, variant) {
  const cart = getState().cart.map(i => ({ ...i })); // shallow clone items
  const key  = cartKey(product.id, variant.id);
  const existing = cart.find(i => i._key === key);

  if (existing) {
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
    });
  }

  setState({ cart });
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
    return { ...i, quantity: Math.max(1, i.quantity + delta) };
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
export function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count;
  badge.hidden = count === 0;
}

// ── WhatsApp checkout ─────────────────────────────────────
// whatsappNumber must be fetched from GET /config by the caller — never stored here
export function buildWhatsAppMessage(orderName = null) {
  const cart = getState().cart;
  if (!cart.length) return '';

  const lines = cart.map(i => {
    const variantLabel = i.variantTitle !== 'Default Title' ? ` (${i.variantTitle})` : '';
    const price = (i.price * i.quantity).toLocaleString('es-HN', { minimumFractionDigits: 2 });
    return `• ${i.productTitle}${variantLabel} x${i.quantity} — L. ${price}`;
  });

  const total = getCartTotal().toLocaleString('es-HN', { minimumFractionDigits: 2 });

  const header = orderName
    ? `Hola! Acabo de realizar el pedido *${orderName}* en PinkPower HN.\n\n`
    : `Hola! Me gustaría hacer el siguiente pedido:\n\n`;

  return `${header}${lines.join('\n')}\n\nTotal: L. ${total}`;
}

export function buildWhatsAppUrl(number, orderName = null) {
  const msg = buildWhatsAppMessage(orderName);
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
