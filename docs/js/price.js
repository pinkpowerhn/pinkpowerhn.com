// Utilidades de precio compartidas por la tarjeta del catálogo y la ficha de
// producto. En mayoreo se muestra el precio de mayoreo junto al de detalle
// (original) y el porcentaje de descuento.

// Formatea un número como precio en lempiras (sin el prefijo "L.").
export function fmtL(n) {
  return Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 });
}

// % de descuento del precio de mayoreo respecto al de detalle. 0 si no aplica
// (sin precio de detalle, o si no es menor que el de mayoreo).
export function discountPct(price, retail) {
  if (!retail || retail <= price) return 0;
  return Math.round((1 - price / retail) * 100);
}
