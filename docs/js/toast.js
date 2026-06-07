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
  const isNew = !toast;
  if (isNew) {
    toast = document.createElement('div');
    toast.id = 'pp-toast';
    document.body.appendChild(toast);
  }

  if (isLimit) {
    toast.innerHTML = `
      <span class="pp-toast__icon">!</span>
      <span class="pp-toast__text">Llegaste al límite disponible</span>
      <button class="pp-toast__close" aria-label="Cerrar">&times;</button>`;
  } else {
    toast.innerHTML = `
      <span class="pp-toast__icon">✓</span>
      <span class="pp-toast__text">Agregado al carrito</span>
      <button class="pp-toast__close" aria-label="Cerrar">&times;</button>`;
  }

  // Cerrar manualmente con la X
  toast.querySelector('.pp-toast__close')?.addEventListener('click', () => {
    toast.classList.remove('pp-toast--show', 'pp-toast--pulse');
    clearTimeout(_timer);
  });

  const variant = isLimit ? 'limit' : 'added';
  const alreadyShown = !isNew && toast.classList.contains('pp-toast--show');

  // Mantener visible si ya estaba mostrándose (para no parpadear)
  toast.className = `pp-toast pp-toast--${variant}${alreadyShown ? ' pp-toast--show' : ''}`;

  if (alreadyShown) {
    // Ya visible → un pulso suave, sin desaparecer
    toast.classList.remove('pp-toast--pulse');
    void toast.offsetWidth;
    toast.classList.add('pp-toast--pulse');
  } else {
    // Aparición con transición (fade + slide)
    void toast.offsetWidth;
    toast.classList.add('pp-toast--show');
  }

  clearTimeout(_timer);
  _timer = setTimeout(() => toast.classList.remove('pp-toast--show'), 2600);
}
