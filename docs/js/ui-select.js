/* Desplegable — PinkPower
 *
 * El `<select>` del navegador se dibuja distinto en cada sistema: otra altura,
 * otra tipografía y, en el teléfono, la ruedita que tapa media pantalla. Al
 * lado de un campo normal se nota el escalón.
 *
 * Este es el mismo desplegable que ya usaban los filtros de PPTabla, sacado a
 * componente para poder usarlo en los formularios. Dentro de PPForm mide
 * exactamente lo mismo que un campo de texto.
 *
 * Script clásico, igual que el resto de los componentes.
 *
 * Uso:
 *   const s = PPSelect.crear(destino, {
 *     opciones: [{ v: 'USD', t: 'Dólares (USD)' }, { v: 'HNL', t: 'Lempiras' }],
 *     valor: 'USD',
 *     vacio: 'Elegir…',            // cuando no hay nada elegido
 *     buscar: 'Escriba el nombre', // campo de filtro arriba del menú
 *     al: (v) => …,
 *   });
 *   s.valor();  s.poner('HNL');  s.opciones([...]);  s.soltar();
 */
window.PPSelect = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const CHEV = `<svg class="ppsel__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/></svg>`;

  function crear(destino, opciones) {
    const cfg = Object.assign(
      // `accion`: { texto, al } pone un renglón al pie del menú para crear algo
      // que no está en la lista. `al` devuelve la opción nueva ({v, t}) o null.
      // Sirve para el momento en que uno descubre que le falta la categoría
      // justo mientras está llenando el formulario. Recibe lo que se escribió
      // en el buscador, así el renglón puede decir «Agregar "Bath"» y crearlo
      // de una, sin otra ventana.
      // `buscar`: texto del campo de filtro que va arriba del menú. Con quince
      // proveedores, bajar la lista con el dedo cansa más que escribir tres
      // letras.
      { opciones: [], valor: null, vacio: 'Elegir…', al: null, accion: null,
        buscar: null },
      opciones || {});
    let lista = cfg.opciones.slice();
    const avisos = [];
    let actual = cfg.valor;
    let abierto = false;

    const raiz = document.createElement('div');
    raiz.className = 'ppsel';
    raiz.innerHTML = `
      <button type="button" class="ppsel__btn" aria-expanded="false" aria-haspopup="listbox">
        <span class="ppsel__txt"></span>${CHEV}
      </button>
      <div class="ppsel__menu" role="listbox" hidden>
        ${cfg.buscar ? `<div class="ppsel__buscador">
          <input type="text" class="ppsel__buscar" autocomplete="off"
            placeholder="${esc(typeof cfg.buscar === 'string' ? cfg.buscar : 'Buscar…')}" />
        </div>` : ''}
        <div class="ppsel__opts"></div>
      </div>`;
    destino.innerHTML = '';
    destino.appendChild(raiz);

    const boton = raiz.querySelector('.ppsel__btn');
    const texto = raiz.querySelector('.ppsel__txt');
    const menu = raiz.querySelector('.ppsel__menu');
    const opts = raiz.querySelector('.ppsel__opts');
    const campo = raiz.querySelector('.ppsel__buscar');

    const elegida = () => lista.find((o) => String(o.v) === String(actual));
    const filtro = () => (campo ? campo.value.trim() : '');

    function pintar() {
      const o = elegida();
      texto.textContent = o ? o.t : cfg.vacio;
      raiz.classList.toggle('is-vacio', !o);
      pintarOpciones();
    }

    // Solo el interior del menú: el campo de búsqueda no se vuelve a dibujar,
    // porque repintarlo con cada tecla le quitaría el foco.
    function pintarOpciones() {
      const q = filtro().toLowerCase();
      const vistas = q
        ? lista.filter((x) => String(x.t).toLowerCase().includes(q))
        : lista;
      const accion = cfg.accion
        ? `<button type="button" class="ppsel__accion" data-accion="1">${esc(
            typeof cfg.accion.texto === 'function'
              ? cfg.accion.texto(filtro()) : cfg.accion.texto)}</button>`
        : '';
      opts.innerHTML = vistas.map((x) => `
        <button type="button" role="option" class="ppsel__opt${
          String(x.v) === String(actual) ? ' is-activo' : ''}"
          data-v="${esc(x.v)}" aria-selected="${String(x.v) === String(actual)}"
        >${esc(x.t)}</button>`).join('')
        + (vistas.length ? '' : `<div class="ppsel__nada">${
            q ? 'Nada con eso' : 'La lista está vacía'}</div>`)
        + accion;
    }

    // Igual que el calendario: mientras está abierto cuelga del body, porque
    // dentro de una ventana con scroll el contenedor lo recorta.
    function colocar() {
      const r = boton.getBoundingClientRect();
      const alto = menu.offsetHeight || 200;
      const margen = 8;
      const cabeAbajo = r.bottom + alto + margen <= window.innerHeight;
      menu.style.width = Math.max(r.width, 180) + 'px';
      menu.style.left = Math.min(r.left, window.innerWidth - r.width - margen) + 'px';
      menu.style.top = (cabeAbajo ? r.bottom + 6 : Math.max(margen, r.top - alto - 6)) + 'px';
    }

    function abrir(si) {
      abierto = si === undefined ? !abierto : si;
      boton.setAttribute('aria-expanded', String(abierto));
      raiz.classList.toggle('is-abierto', abierto);
      if (abierto) {
        document.body.appendChild(menu);
        menu.classList.add('ppsel__menu--suelto');
        menu.hidden = false;
        // Cada vez se abre limpio: el filtro de la vez pasada escondería
        // opciones sin que se note por qué.
        if (campo) { campo.value = ''; pintarOpciones(); }
        colocar();
        if (campo) setTimeout(() => { campo.focus(); colocar(); }, 0);
        window.addEventListener('resize', colocar);
        window.addEventListener('scroll', colocar, true);
      } else {
        menu.hidden = true;
        menu.classList.remove('ppsel__menu--suelto');
        if (menu.parentNode !== raiz) raiz.appendChild(menu);
        window.removeEventListener('resize', colocar);
        window.removeEventListener('scroll', colocar, true);
      }
    }

    function elegir(v) {
      actual = v;
      pintar();
      abrir(false);
      if (cfg.al) cfg.al(actual);
      avisos.forEach((f) => f(actual));
    }

    async function crearLoEscrito() {
      const q = filtro();
      abrir(false);
      const nueva = await cfg.accion.al(q);
      if (!nueva) return;
      if (!lista.some((o) => String(o.v) === String(nueva.v))) lista = lista.concat([nueva]);
      elegir(nueva.v);
    }

    boton.addEventListener('click', (e) => { e.preventDefault(); abrir(); });

    if (campo) {
      campo.addEventListener('input', pintarOpciones);
      // Enter: si lo escrito coincide con algo, esa; si no coincide con nada,
      // lo crea. Es el gesto que ya conoce de la caja con las clientas.
      campo.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const primera = opts.querySelector('[data-v]');
        if (primera) { elegir(primera.dataset.v); return; }
        if (cfg.accion && filtro()) crearLoEscrito();
      });
    }

    menu.addEventListener('click', async (e) => {
      if (e.target.closest('[data-accion]')) {
        e.preventDefault();
        await crearLoEscrito();
        return;
      }
      const b = e.target.closest('[data-v]');
      if (!b) return;
      e.preventDefault();
      elegir(b.dataset.v);
    });

    const alDocumento = (e) => {
      if (abierto && !raiz.contains(e.target) && !menu.contains(e.target)) abrir(false);
    };
    const alEscape = (e) => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); abrir(false); } };
    document.addEventListener('click', alDocumento);
    document.addEventListener('keydown', alEscape, true);

    pintar();

    return {
      valor: () => (actual == null ? '' : String(actual)),
      poner: (v) => { actual = v; pintar(); },
      opciones: (nuevas) => { lista = nuevas.slice(); pintar(); },
      enfocar: () => boton.focus(),
      // Quien nos monta adentro (PPForm) necesita enterarse de los cambios: el
      // select no es un <input>, así que no suelta eventos que burbujeen.
      alCambiar: (fn) => { if (fn) avisos.push(fn); },
      soltar: () => {
        abrir(false);
        document.removeEventListener('click', alDocumento);
        document.removeEventListener('keydown', alEscape, true);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
      },
    };
  }

  return { crear };
})();
