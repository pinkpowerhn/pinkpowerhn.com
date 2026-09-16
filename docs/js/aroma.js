// ── Sugerencias "del mismo aroma" ─────────────────────────
// Al agregar un producto al carrito (tienda normal Y mayoreo), se ofrece una
// hoja con otros productos del mismo aroma (la crema, loción, gel… de esa misma
// fragancia). En mayoreo los productos en memoria ya traen el precio de
// mayoreo, así que la hoja sale con esos precios sin ningún cambio extra.
// El aroma no es un campo aparte: se deriva del nombre quitándole el formato
// ("A Thousand Wishes Splash" → aroma "a thousand wishes").
import { getState } from './state.js';
import { addToCart, canAddNow } from './cart.js';
import { fetchProductById } from './api.js';
import { showToast } from './toast.js';

// Quita acentos y apóstrofos, y normaliza espacios/mayúsculas.
function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019\u00b4`]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Marca al inicio del nombre ("Victoria's Secret Bombshell…"): no es parte del aroma.
const MARCA_INICIAL = /^\s*(victoria['\u2019\u00b4`]?s?\s+secret|bath\s*(&|and)\s*body\s*works)\s+/i;
function sinMarca(title) {
  return String(title || '').replace(MARCA_INICIAL, '');
}

// Productos que no son una fragancia (accesorios, lencería, peluches…): no tienen
// aroma, así que ni reciben ni dan sugerencias. Sin esto, al quitarles palabras
// quedaban claves como "negro" que podían coincidir entre sí por casualidad.
const SIN_AROMA = /\b(difusor\w*|holder\w*|candelabro\w*|llavero\w*|monedero\w*|bolso\w*|cartera\w*|peluche\w*|tanga\w*|panty|panties|brassiere\w*|bralette\w*|bikini\w*|lenceria|cosmetiquera\w*|neceser\w*|rasuradora\w*|repuesto\w*)\b/;

// Marcas (y colaboraciones como "Dove X Crumbl") que a veces van en medio o al
// final del nombre ("Very Good Girl Carolina Herrera Dama"). Solo las que NO forman
// parte del nombre del perfume: Dior o Coach no están porque "Miss Dior" o
// "Coach Love" sí lo son.
const MARCA_DISENADOR = /\b(dove x crumbl|carolina herrera|jimmy choo|marc jacobs|calvin klein|dolce (& )?gabbana|yves saint laurent|ysl|ariana grande|versace|gucci|calra|paco rabanne|lancome|valentino|prada|moschino)\b/g;

// Nombre de colección que algunos productos de una línea llevan al final y otros
// no ("Coconut Vanilla Gelato Splash" / "Coconut Vanilla Desodorante"). Solo se
// quita al final: al inicio sí es parte del aroma ("Gelato Oasis").
const SUFIJOS_LINEA = new Set(['gelato']);

// Tamaños ("50ml", "100 ml", "8 oz"): la misma fragancia viene en varias medidas.
const TAMANO = /\b\d+([.,]\d+)?\s*(fl\s*oz|ml|oz|gr|gramos|g|piezas|pzs)\b/g;

// Palabras de enlace que quedan sueltas en los bordes al quitar el formato.
const CONECTORES = new Set(['de', 'del', 'para', 'con', 'en', 'y']);

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
  // Perfumería: concentración y presentación.
  // "Set de Perfumes" trae varios aromas: sin clave, no sugiere nada.
  'splash de perfume', 'eau de parfum', 'eau de toilette', 'de perfume', 'perfumes', 'perfume', 'parfum',
  'edp', 'edt', 'decant', 'shimmer', 'set dama', 'set caballero', 'dama', 'caballero',
  // Labios, manos, cuerpo.
  'mantequilla corporal hidratante', 'brillo labial hidratante', 'brillo labial',
  'balsamo labial', 'aceite labial', 'jabon espumoso para manos', 'jabon para manos',
  'jabon de manos', 'crema de manos', 'crema para manos', 'gel para manos', 'para manos',
  'de manos', 'spray antibacterial', 'antibacterial', 'gel de bano en espuma', 'en espuma',
  'espuma', 'bruma corporal', 'fine fragrance mist', 'desodorante', 'hidratante', 'corporal',
  // Hogar y carro.
  'refill de fragancia para carro', 'fragancia para carro', 'refill de fragancia', 'fragancia',
  'vela grande', 'vela mediana', 'vela pequena', 'vela mini', 'vela aromatica', 'vela',
  // Afeitado.
  'aceite para afeitado', 'mantequilla para afeitado', 'crema de afeitar', 'crema para afeitar',
  'gel de afeitar', 'espuma de afeitar', 'after shave serum', 'after shave', 'para afeitado',
  'de afeitar', 'afeitado', 'afeitar', 'serum', 'mantequilla',
  // Otras presentaciones.
  'set de cuidado corporal', 'shampoo y acondicionador', 'shampoo', 'acondicionador',
  'spray ambiental', 'ambiental', 'lip oil saborizado', 'lip oil', 'saborizado',
  'perfume balm', 'balm', 'con brillo', 'cremoso', 'espumoso', 'multiuso', 'blanqueador',
  '3 en 1', 'duo', 'trio', 'unisex', 'tester', 'tamano jumbo', 'jumbo', 'en tubo',
  'y carterita', 'carterita', 'roll-on', 'roll on',
].sort((a, b) => b.length - a.length);

// Clave de aroma de un producto (string normalizado). '' si no se pudo derivar.
export function aromaKey(title) {
  const base = norm(sinMarca(title));
  if (SIN_AROMA.test(base)) return '';
  let s = ' ' + base.replace(TAMANO, ' ').replace(MARCA_DISENADOR, ' ').replace(/\s+/g, ' ') + ' ';
  for (const f of FORMATOS) {
    const needle = ' ' + f + ' ';
    while (s.indexOf(needle) !== -1) s = s.replace(needle, ' ');
  }
  const palabras = s.trim().split(/\s+/).filter(Boolean);
  while (palabras.length && CONECTORES.has(palabras[0])) palabras.shift();
  while (palabras.length && CONECTORES.has(palabras[palabras.length - 1])) palabras.pop();
  if (palabras.length > 1 && SUFIJOS_LINEA.has(palabras[palabras.length - 1])) palabras.pop();
  return palabras.join(' ');
}

// Etiqueta del formato (lo que NO es aroma), conservando acentos/mayúsculas.
function formatoLabel(title) {
  const keyWords = new Set(aromaKey(title).split(' ').filter(Boolean));
  const out = sinMarca(title).split(/\s+/).filter(w => w && !keyWords.has(norm(w)));
  return out.join(' ').trim() || title;
}

function defaultVariant(p) {
  return (p.variants || []).find(v => v.availableForSale) || (p.variants || [])[0] || null;
}

// Dónde buscar productos del mismo aroma. En la tienda normal el catálogo
// completo llega por partes y tarda varios segundos: quien agregaba rápido (p. ej.
// entrando por el enlace directo de un producto) no veía sugerencias porque los
// del mismo aroma aún no habían cargado. Por eso se completa con el índice ligero,
// que llega entero de una vez. En mayoreo NO: el índice trae precios de tienda.
function productosParaSugerir() {
  const { products, searchIndex, mayoreo } = getState();
  const base = products || [];
  if (mayoreo || !searchIndex || !searchIndex.length) return base;
  const cargados = new Set(base.map(p => p.id));
  return base.concat(searchIndex.filter(p => !cargados.has(p.id)));
}

// Otros productos del mismo aroma, disponibles y que no estén ya en el carrito.
export function sugerencias(producto) {
  const { cart } = getState();
  const key = aromaKey(producto.title);
  if (!key || key.length < 3) return [];
  const enCarrito = new Set(cart.map(i => i.productId));
  return productosParaSugerir().filter(p =>
    p.id !== producto.id &&
    p.availableForSale && p.price > 0 &&
    !enCarrito.has(p.id) &&
    aromaKey(p.title) === key
  ).slice(0, 8);
}

// Punto de entrada: se llama justo después de addToCart.
export function onAdded(producto, status) {
  if (status !== 'added') { showToast(status, producto.title); return; }
  if (sugerencias(producto).length) { abrirHoja(producto); return; }
  showToast('added', producto.title);
  // Si agregan apenas abren la página, el catálogo todavía no llegó completo: se
  // espera un momento al índice y, si con él aparecen productos del mismo aroma,
  // se abre la hoja.
  if (catalogoIncompleto()) esperarCatalogo(producto);
}

function catalogoIncompleto() {
  const { mayoreo, searchIndex, productsLoaded } = getState();
  return !mayoreo && !(searchIndex && searchIndex.length) && !productsLoaded;
}

let _esperaId = 0;
async function esperarCatalogo(producto) {
  const mia = ++_esperaId;
  const limite = Date.now() + 8000;
  while (catalogoIncompleto() && Date.now() < limite) {
    await new Promise(r => setTimeout(r, 200));
    if (mia !== _esperaId) return;   // agregaron otro producto: manda el último
  }
  const { cart, cartOpen } = getState();
  if (cartOpen || document.body.classList.contains('co-open')) return;
  if (!cart.some(i => i.productId === producto.id)) return;
  if (sugerencias(producto).length) abrirHoja(producto);
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
      const addBtn = e.target.closest('[data-add]');
      if (addBtn) agregarSugerencia(ov, addBtn);
    });
  }
  ov._anchor = producto;
  pintar(producto);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));
}

// "+ Agregar" de una sugerencia. Si el producto vino del índice ligero (todavía
// no cargó completo), se trae con sus variantes antes de agregarlo.
async function agregarSugerencia(ov, btn) {
  if (btn.disabled) return;
  const id = btn.dataset.add;
  let p = (getState().products || []).find(x => x.id === id);
  if (!p) {
    btn.disabled = true;
    btn.textContent = 'Agregando…';
    p = await fetchProductById(id).catch(() => null);
  }
  const v = p && defaultVariant(p);
  if (p && v && v.availableForSale && canAddNow(v.id)) {
    const estado = addToCart(p, v);      // statechange refresca badge y carrito
    if (estado !== 'added') showToast(estado, p.title);
    pintar(ov._anchor);                  // re-pinta sin el que ya se agregó
    return;
  }
  if (btn.isConnected) { btn.disabled = false; btn.textContent = '+ Agregar'; }
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
