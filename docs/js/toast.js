let _timer = null;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// status: 'added' | 'limit' | falsy (no-op)
// productName: nombre a mostrar cuando se agrega
export function showToast(status, productName = '') {
  if (!status) return;

  const isLimit = status === 'limit';

  let toast = document.getElementById('pp-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pp-toast';
    document.body.appendChild(toast);
  }

  if (isLimit) {
    toast.innerHTML = `
      <span class="pp-toast__icon">!</span>
      <span class="pp-toast__text">Llegaste al límite disponible</span>`;
  } else {
    const name = productName ? `<strong>${esc(productName)}</strong>` : '<strong>Producto</strong>';
    toast.innerHTML = `
      <span class="pp-toast__icon">✓</span>
      <span class="pp-toast__text">${name}<small>Agregado al carrito</small></span>`;
  }

  toast.className = `pp-toast pp-toast--${isLimit ? 'limit' : 'added'}`;
  // Reinicia la animación para que "salte" aunque ya esté visible (clics seguidos)
  void toast.offsetWidth;
  toast.classList.add('pp-toast--show');

  clearTimeout(_timer);
  _timer = setTimeout(() => toast.classList.remove('pp-toast--show'), 2600);
}
