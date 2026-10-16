/* Ventana — PinkPower
 *
 * La ventana del panel: título, contenido, dos botones y una X para cerrar.
 * Lo único que cambia de una a otra es lo que va adentro.
 *
 * Se hizo propia en vez de seguir con la de la librería de avisos porque las
 * ventanas del panel son formularios, no alertas: necesitan X, altura estable,
 * scroll interno cuando el formulario es largo y, en el teléfono, pegarse
 * abajo en vez de flotar en medio.
 *
 * Script clásico, igual que el resto de los componentes.
 *
 * Uso:
 *   const r = await PPModal.abrir({
 *     titulo: 'Nueva orden',
 *     cuerpo: '<div>…</div>',          // texto HTML o un nodo
 *     confirmar: 'Guardar',            // null para que no haya botón
 *     cancelar: 'Cancelar',
 *     ancho: 520,
 *     alAbrir: (caja, api) => …,       // caja = el div del cuerpo
 *     alConfirmar: (caja, api) => valor | false,   // false deja abierta
 *   });
 *   // r === null si se cerró sin confirmar
 *
 * El `api` que reciben los callbacks: { avisar(texto), cerrar(valor) }.
 */
window.PPModal = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const IC_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"
      stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/>
      <line x1="18" y1="6" x2="6" y2="18"/></svg>`;

  let abiertas = 0;

  function abrir(opciones) {
    const cfg = Object.assign({
      titulo: '', sub: '', cuerpo: '', ancho: 520,
      confirmar: 'Guardar', cancelar: 'Cancelar', peligro: false,
      alAbrir: null, alConfirmar: null, cerrarAlTocarFuera: true,
    }, opciones || {});

    return new Promise((resolver) => {
      const fondo = document.createElement('div');
      fondo.className = 'ppmodal';
      fondo.innerHTML = `
        <div class="ppmodal__caja" role="dialog" aria-modal="true"
             style="max-width:${Number(cfg.ancho) || 520}px">
          <button type="button" class="ppmodal__x" aria-label="Cerrar">${IC_X}</button>
          <div class="ppmodal__cab">
            <h2 class="ppmodal__tt">${esc(cfg.titulo)}</h2>
            ${cfg.sub ? `<p class="ppmodal__sub">${esc(cfg.sub)}</p>` : ''}
          </div>
          <div class="ppmodal__cuerpo"></div>
          <p class="ppmodal__aviso" hidden></p>
          <div class="ppmodal__pie">
            ${cfg.confirmar ? `<button type="button" class="ppmodal__ok${
              cfg.peligro ? ' ppmodal__ok--peligro' : ''}">${esc(cfg.confirmar)}</button>` : ''}
            ${cfg.cancelar ? `<button type="button" class="ppmodal__no">${esc(cfg.cancelar)}</button>` : ''}
          </div>
        </div>`;

      const caja = fondo.querySelector('.ppmodal__cuerpo');
      if (cfg.cuerpo instanceof Node) caja.appendChild(cfg.cuerpo);
      else caja.innerHTML = cfg.cuerpo;

      const aviso = fondo.querySelector('.ppmodal__aviso');
      let cerrada = false;

      function cerrar(valor) {
        if (cerrada) return;
        cerrada = true;
        fondo.classList.add('is-yendose');
        abiertas = Math.max(0, abiertas - 1);
        if (!abiertas) document.body.classList.remove('ppmodal-abierto');
        document.removeEventListener('keydown', alEscape, true);
        setTimeout(() => { if (fondo.parentNode) fondo.parentNode.removeChild(fondo); }, 130);
        resolver(valor === undefined ? null : valor);
      }

      const api = {
        cerrar,
        avisar: (texto) => {
          aviso.textContent = texto || '';
          aviso.hidden = !texto;
          if (texto) aviso.scrollIntoView({ block: 'nearest' });
        },
      };

      const alEscape = (e) => {
        // Solo la de más arriba, y solo si nadie más lo usó ya (un calendario
        // o un desplegable abierto se cierran ellos primero).
        if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); cerrar(null); }
      };

      fondo.querySelector('.ppmodal__x').addEventListener('click', () => cerrar(null));
      const no = fondo.querySelector('.ppmodal__no');
      if (no) no.addEventListener('click', () => cerrar(null));

      const ok = fondo.querySelector('.ppmodal__ok');
      if (ok) {
        ok.addEventListener('click', async () => {
          if (!cfg.alConfirmar) { cerrar(true); return; }
          api.avisar('');
          ok.disabled = true;
          try {
            const valor = await cfg.alConfirmar(caja, api);
            if (valor === false || valor === undefined) { ok.disabled = false; return; }
            cerrar(valor);
          } catch (err) {
            api.avisar((err && err.message) || 'No se pudo guardar');
            ok.disabled = false;
          }
        });
      }

      if (cfg.cerrarAlTocarFuera) {
        fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(null); });
      }

      document.body.appendChild(fondo);
      abiertas += 1;
      document.body.classList.add('ppmodal-abierto');
      document.addEventListener('keydown', alEscape, true);

      if (cfg.alAbrir) cfg.alAbrir(caja, api);
    });
  }

  // Para avisos y confirmaciones cortas, con el mismo aire que el resto.
  function confirmar(opciones) {
    const cfg = Object.assign({ confirmar: 'Sí', cancelar: 'Cancelar' }, opciones || {});
    return abrir(Object.assign({}, cfg, { ancho: cfg.ancho || 420 }))
      .then((r) => r === true);
  }

  return { abrir, confirmar };
})();
