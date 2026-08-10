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
// En escritorio copia el mensaje al portapapeles y avisa.
// El mensaje va TODO junto (nombre / precio / enlace) con el enlace en su PROPIA
// línea. Se manda entero en `text` (sin pasar `url` aparte) para controlar el
// formato exacto; WhatsApp igual detecta el enlace y arma la vista previa.
export async function shareLink(url, text = '') {
  const mensaje = text ? `${text}\n${url}` : url;
  if (navigator.share) {
    try {
      await navigator.share({ text: mensaje });
      return;
    } catch (_) {
      return; // el usuario canceló
    }
  }
  try {
    await navigator.clipboard.writeText(mensaje);
    flash('Copiado ✓');
  } catch (_) {
    // Último recurso: abrir WhatsApp Web con el mensaje completo
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
  }
}
