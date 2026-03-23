let _timer = null;

export function showToast(status) {
  if (!status) return;

  const isLimit = status === 'limit';
  const msg     = isLimit
    ? '⚠️ Llegaste al límite disponible'
    : '✓ Agregado al carrito';

  let toast = document.getElementById('pp-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pp-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.className   = `pp-toast pp-toast--${isLimit ? 'limit' : 'added'} pp-toast--show`;

  clearTimeout(_timer);
  _timer = setTimeout(() => toast.classList.remove('pp-toast--show'), 2400);
}
