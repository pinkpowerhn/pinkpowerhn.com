// Utilidades para compartir enlaces de productos y catálogos.

// URL absoluta del sitio para un hash dado (sirve en local y en producción).
export function siteUrl(hash = '') {
  return `${location.origin}${location.pathname}${hash}`;
}

// Link para COMPARTIR un producto. Pasa por el backend (/p/<id>) para que la
// vista previa en WhatsApp/redes muestre la FOTO del producto (no el logo); al
// abrirlo, redirige a la ficha real del producto en el sitio.
export function productShareUrl(id) {
  return `https://api.pinkpowerhn.com/p/${encodeURIComponent(id)}`;
}

// Mensaje breve de confirmación (cuando no hay menú nativo de compartir).
function flash(msg) {
  let el = document.getElementById('pp-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pp-flash';
    el.className = 'pp-flash';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  void el.offsetWidth;
  el.classList.add('is-show');
  clearTimeout(flash._t);
  flash._t = setTimeout(() => el.classList.remove('is-show'), 2400);
}

// Comparte un enlace. En móvil abre el menú nativo (WhatsApp, redes, etc.).
// En escritorio copia el enlace al portapapeles y avisa.
export async function shareLink(url, title = '') {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'PinkPower HN', text: title || 'PinkPower HN', url });
      return;
    } catch (_) {
      return; // el usuario canceló
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    flash('Enlace copiado ✓');
  } catch (_) {
    // Último recurso: abrir WhatsApp Web con el enlace
    const text = title ? `${title} ${url}` : url;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
}
