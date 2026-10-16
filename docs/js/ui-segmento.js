/* Conmutador de vistas — PinkPower
 *
 * Dos o tres vistas de lo mismo, una a la vez: "Órdenes · Envíos", "Ya existe ·
 * Es nuevo". No es un filtro (eso lo hace PPTabla) ni una pestaña del panel:
 * es elegir qué se está mirando dentro de una pantalla.
 *
 * Script clásico, igual que el resto de los componentes.
 *
 * Uso:
 *   const vista = PPSegmento.crear(document.getElementById('destino'), {
 *     opciones: [{ v: 'ordenes', t: 'Órdenes' }, { v: 'envios', t: 'Envíos' }],
 *     valor: 'ordenes',
 *     al: (v) => mostrar(v),
 *   });
 *   vista.valor();        // 'ordenes'
 *   vista.poner('envios');
 */
window.PPSegmento = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function crear(destino, opciones) {
    const cfg = Object.assign({ opciones: [], valor: null, al: null }, opciones || {});
    let actual = cfg.valor || (cfg.opciones[0] || {}).v;

    const raiz = document.createElement('div');
    raiz.className = 'ppseg';
    raiz.setAttribute('role', 'tablist');
    destino.innerHTML = '';
    destino.appendChild(raiz);

    function pintar() {
      raiz.innerHTML = cfg.opciones.map((o) => `
        <button type="button" role="tab" class="ppseg__op${
          String(o.v) === String(actual) ? ' is-activo' : ''}"
          data-v="${esc(o.v)}" aria-selected="${String(o.v) === String(actual)}">
          ${esc(o.t)}${o.cuenta != null ? `<span class="ppseg__cuenta">${esc(o.cuenta)}</span>` : ''}
        </button>`).join('');
    }

    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b || b.dataset.v === String(actual)) return;
      actual = b.dataset.v;
      pintar();
      if (cfg.al) cfg.al(actual);
    });

    pintar();

    return {
      valor: () => actual,
      poner: (v) => { actual = v; pintar(); },
      // Para enseñar cuántas cosas hay en cada vista sin tener que repintar todo.
      cuenta: (v, n) => {
        const o = cfg.opciones.find((x) => String(x.v) === String(v));
        if (o) { o.cuenta = n; pintar(); }
      },
    };
  }

  return { crear };
})();
