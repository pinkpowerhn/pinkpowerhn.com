// Existencias, a nivel de producto y de talla. Compartido por la tarjeta del
// catálogo (catalog.js) y la ficha de producto (product-page.js) para no repetir
// el mismo criterio en dos lados.

// Total de unidades disponibles sumando TODAS las tallas (no el mínimo de una).
// Devuelve null si alguna talla disponible no lleva control de inventario
// (ilimitada) → el producto no se considera "de pocas unidades".
export function productStockTotal(p) {
  const avail = (p.variants || []).filter(v => v.availableForSale);
  if (!avail.length) return 0;
  if (avail.some(v => v.inventoryQuantity === null)) return null;
  return avail.reduce((s, v) => s + v.inventoryQuantity, 0);
}

// Etiqueta de "pocas unidades" del producto (p. ej. "Solo queda 1" / "Últimas 3"),
// o null si no aplica (agotado, ilimitado o con stock suficiente).
export function lowStockLabel(p) {
  if (!p.availableForSale) return null;
  const total = productStockTotal(p);
  if (total === null || total <= 0 || total > 3) return null;
  return total === 1 ? 'Solo queda 1' : `Últimas ${total}`;
}

// Nota de existencias de una talla/variante concreta cuando quedan pocas (≤ 5),
// para que se vea cuánto hay de ESA talla. '' si no aplica.
export function variantStockNote(v) {
  if (!v || !v.availableForSale || v.inventoryQuantity === null) return '';
  const q = v.inventoryQuantity;
  if (q <= 0 || q > 5) return '';
  const talla = v.title && v.title !== 'Default Title' ? ` en talla ${v.title}` : '';
  return q === 1 ? `Solo queda 1${talla}` : `Quedan ${q}${talla}`;
}
