/* Menú de tres puntos — PinkPower
 *
 * El mismo menú de acciones que usan las filas de PPTabla, suelto, para poder
 * colgarlo de cualquier botón. Se dibuja al final del documento y se coloca
 * sobre el botón: dentro de una tarjeta con `overflow` quedaría recortado.
 *
 * Uso:
 *   PPMenu.colgar(boton, () => [
 *     { texto: 'Bajar en Excel', icono: PPMenu.IC_BAJAR, al: () => … },
 *     { texto: 'Bajar en CSV', al: () => … },
 *   ]);
 */
window.PPMenu = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const IC_BAJAR = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>'
                 + '<polyline points="7 10 12 15 17 10"></polyline>'
                 + '<line x1="12" y1="15" x2="12" y2="3"></line>';
  const IC_PUNTOS = '<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/>';

  let abierto = null;

  function cerrar() {
    if (!abierto) return;
    abierto.menu.remove();
    abierto.boton.setAttribute('aria-expanded', 'false');
    abierto = null;
  }

  function abrir(boton, opciones) {
    cerrar();
    const menu = document.createElement('div');
    menu.className = 'ppmenu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = opciones.map((o, i) => `
      <button type="button" class="ppmenu__op${o.peligro ? ' ppmenu__op--peligro' : ''}" data-i="${i}" role="menuitem">
        ${o.icono ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${o.icono}</svg>` : ''}
        <span>${esc(o.texto)}</span>
        ${o.nota ? `<em>${esc(o.nota)}</em>` : ''}
      </button>`).join('');
    document.body.appendChild(menu);

    // Debajo del botón si cabe; si no, encima. Y nunca fuera de la pantalla.
    const r = boton.getBoundingClientRect();
    const alto = menu.getBoundingClientRect().height;
    const ancho = menu.getBoundingClientRect().width;
    const debajo = r.bottom + alto + 8 < window.innerHeight;
    menu.style.top = (debajo ? r.bottom + 6 : r.top - alto - 6) + window.scrollY + 'px';
    menu.style.left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8)) + window.scrollX + 'px';

    menu.addEventListener('click', (ev) => {
      const b = ev.target.closest('.ppmenu__op');
      if (!b) return;
      const op = opciones[Number(b.dataset.i)];
      cerrar();
      if (op && op.al) op.al();
    });

    boton.setAttribute('aria-expanded', 'true');
    abierto = { menu, boton };
  }

  function colgar(boton, dameOpciones) {
    boton.setAttribute('aria-haspopup', 'menu');
    boton.setAttribute('aria-expanded', 'false');
    boton.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (abierto && abierto.boton === boton) { cerrar(); return; }
      const opciones = typeof dameOpciones === 'function' ? dameOpciones() : dameOpciones;
      if (opciones && opciones.length) abrir(boton, opciones);
    });
  }

  document.addEventListener('click', (ev) => {
    if (abierto && !abierto.menu.contains(ev.target)) cerrar();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrar(); });
  window.addEventListener('scroll', cerrar, { passive: true });
  window.addEventListener('resize', cerrar);

  return { colgar, cerrar, IC_BAJAR, IC_PUNTOS };
})();
