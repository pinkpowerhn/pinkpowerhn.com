// ── Sugerencias "del mismo aroma" ─────────────────────────
// Al agregar un producto al carrito (en la tienda normal, NO en mayoreo), se
// ofrece una hoja con otros productos del mismo aroma (la crema, loción, gel…
// de esa misma fragancia). El aroma no es un campo aparte: se deriva del nombre
// quitándole el formato ("A Thousand Wishes Splash" → aroma "a thousand wishes").
import { getState } from './state.js';
import { addToCart, canAddNow } from './cart.js';
import { showToast } from './toast.js';

// Quita acentos y normaliza espacios/mayúsculas.
function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Formatos/presentaciones que se le quitan al nombre para quedarnos con el aroma.
const FORMATOS = [
  'refill de fragancia para el hogar', 'aceite iluminador corporal',
  'aceite para bano & afeitado', 'jelly hidratante con brillo', 'mini locion hidratante',
  'mini crema hidratante', 'mini set de regalo', 'gel de bano mini', 'mini gel de bano',
  'de cabello y cuerpo', 'mantequilla corporal', 'exfoliante corporal', 'fragancia ambiental',
  'crema hidratante', 'locion hidratante', 'gel antibacterial', 'aceite para bano',
  'aceite corporal', 'set de regalo', 'loty corporal', 'body splash', 'body mist',
  'fragrance mist', 'body spray', 'lip gloss', 'gel de bano', 'mini splash', 'splash mini',
  'mini crema', 'bruma', 'mist', 'splash', 'locion', 'crema', 'jelly', 'exfoliante',
  'aceite', 'jabones', 'jabon', 'gel', 'mini', 'spray', 'gloss', 'set', 'vaporizador', 'loty',
].sort((a, b) => b.length - a.length);

// Clave de aroma de un producto (string normalizado). '' si no se pudo derivar.
export function aromaKey(title) {
  let s = ' ' + norm(title) + ' ';
  for (const f of FORMATOS) {
    const needle = ' ' + f + ' ';
    while (s.indexOf(needle) !== -1) s = s.replace(needle, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

// Etiqueta del formato (lo que NO es aroma), conservando acentos/mayúsculas.
function formatoLabel(title) {
  const keyWords = new Set(aromaKey(title).split(' ').filter(Boolean));
  const out = String(title).split(/\s+/).filter(w => w && !keyWords.has(norm(w)));
  return out.join(' ').trim() || title;
}

function defaultVariant(p) {
  return (p.variants || []).find(v => v.availableForSale) || (p.variants || [])[0] || null;
}

// Otros productos del mismo aroma, disponibles y que no estén ya en el carrito.
export function sugerencias(producto) {
  const { products, cart } = getState();
  const key = aromaKey(producto.title);
  if (!key || key.length < 3) return [];
  const enCarrito = new Set(cart.map(i => i.productId));
  return (products || []).filter(p =>
    p.id !== producto.id &&
    p.availableForSale && p.price > 0 &&
    !enCarrito.has(p.id) &&
    aromaKey(p.title) === key
  ).slice(0, 8);
}

// Punto de entrada: se llama justo después de addToCart.
export function onAdded(producto, status) {
  if (status !== 'added') { showToast(status, producto.title); return; }
  // En mayoreo no aplica (es solo para la tienda normal).
  if (getState().mayoreo) { showToast('added', producto.title); return; }
  const sug = sugerencias(producto);
  if (!sug.length) { showToast('added', producto.title); return; }
  abrirHoja(producto);
}

// ── Hoja ──────────────────────────────────────────────────
const fmtPrecio = n => 'L. ' + Number(n).toLocaleString('es-HN');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function cardHTML(p) {
  const img = p.images && p.images[0] && p.images[0].url;
  return `<div class="pp-aroma__card" data-id="${esc(p.id)}">
    <div class="pp-aroma__img">${img ? `<img src="${esc(img)}" alt="" loading="lazy"/>` : '🛍️'}</div>
    <div class="pp-aroma__name">${esc(formatoLabel(p.title))}</div>
    <div class="pp-aroma__price">${fmtPrecio(p.price)}</div>
    <button class="pp-aroma__add" data-add="${esc(p.id)}" aria-label="Agregar">+ Agregar</button>
  </div>`;
}

function abrirHoja(producto) {
  let ov = document.getElementById('pp-aroma');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'pp-aroma';
    ov.className = 'pp-aroma';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('[data-aroma-close]')) cerrarHoja();
      const addId = e.target.closest('[data-add]');
      if (addId) {
        const p = (getState().products || []).find(x => x.id === addId.dataset.add);
        const v = p && defaultVariant(p);
        if (p && v && canAddNow(v.id)) {
          addToCart(p, v);                 // statechange refresca badge y carrito
          pintar(ov._anchor);              // re-pinta sin el que ya se agregó
        }
      }
    });
  }
  ov._anchor = producto;
  pintar(producto);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));
}

function pintar(producto) {
  const ov = document.getElementById('pp-aroma');
  if (!ov) return;
  const sug = sugerencias(producto);
  if (!sug.length) { cerrarHoja(); showToast('added', producto.title); return; }
  ov.innerHTML = `
    <div class="pp-aroma__panel" role="dialog" aria-label="Productos del mismo aroma">
      <button class="pp-aroma__x" data-aroma-close aria-label="Cerrar">&times;</button>
      <div class="pp-aroma__ok"><span class="pp-aroma__check">✓</span> Agregado al carrito</div>
      <div class="pp-aroma__promo">
        <div class="pp-aroma__title">✨ ¡Completa tu set!</div>
        <div class="pp-aroma__sub">Haz que tu aroma dure más combinándolo con estos productos de la misma colección.</div>
      </div>
      <div class="pp-aroma__row">${sug.map(cardHTML).join('')}</div>
      <div class="pp-aroma__foot">
        <button class="pp-aroma__btn pp-aroma__btn--ghost" data-aroma-close>Seguir comprando</button>
      </div>
    </div>`;
}

function cerrarHoja() {
  const ov = document.getElementById('pp-aroma');
  if (!ov) return;
  ov.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => { ov.innerHTML = ''; }, 220);
}
