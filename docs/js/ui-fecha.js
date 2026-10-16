/* Campo de UNA fecha — PinkPower
 *
 * El hermano chico de PPRango: ahí se elige un período, aquí un solo día. Se
 * hizo propio por lo mismo que aquel: `<input type="date">` lo dibuja distinto
 * cada navegador y en el teléfono abre la ruedita del sistema, que tapa media
 * pantalla y no deja ver qué se está eligiendo.
 *
 * Es un script clásico (no módulo), igual que PPTabla y PPRango.
 *
 * Uso:
 *   const f = PPFecha.crear(document.getElementById('destino'), {
 *     valor: '2026-10-16',      // 'aaaa-mm-dd' (o nada: arranca vacío)
 *     max: '2026-10-16',        // no deja elegir después de ese día
 *     min: '2026-01-01',
 *     al: (iso) => …,           // cada vez que se elige uno
 *   });
 *   f.valor();                  // '2026-10-16' o ''
 *   f.poner('2026-11-01');
 *   f.enfocar();
 */
window.PPFecha = (function () {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deIso = (t) => {
    if (!t) return null;
    const [a, m, d] = String(t).slice(0, 10).split('-').map(Number);
    if (!a || !m || !d) return null;
    return new Date(a, m - 1, d);
  };
  const mismoDia = (a, b) => a && b && iso(a) === iso(b);

  // "16 de octubre de 2026", y "hoy"/"ayer" cuando toca, que es como se dice.
  function comoSeLee(d) {
    if (!d) return 'Elegir la fecha';
    const hoy = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    if (mismoDia(d, hoy)) return 'Hoy';
    if (mismoDia(d, ayer)) return 'Ayer';
    const año = d.getFullYear() === hoy.getFullYear() ? '' : ` de ${d.getFullYear()}`;
    return `${d.getDate()} de ${MESES[d.getMonth()]}${año}`;
  }

  const IC_CAL = '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/>';
  const IC_FLECHA = '<polyline points="6 9 12 15 18 9"/>';

  function svg(d, clase) {
    return `<svg class="${clase || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  function crear(destino, opciones) {
    const cfg = Object.assign({ valor: '', min: '', max: '', al: null }, opciones || {});
    let elegida = deIso(cfg.valor);
    const tope = deIso(cfg.max);
    const piso = deIso(cfg.min);
    let mesVisible = new Date((elegida || new Date()).getFullYear(),
                              (elegida || new Date()).getMonth(), 1);
    let abierto = false;

    const raiz = document.createElement('div');
    raiz.className = 'ppfecha';
    raiz.innerHTML = `
      <button type="button" class="ppfecha__boton" aria-expanded="false">
        ${svg(IC_CAL)}
        <span class="ppfecha__txt"></span>
        ${svg(IC_FLECHA, 'ppfecha__flecha')}
      </button>
      <div class="ppfecha__panel" hidden>
        <div class="ppfecha__cab">
          <button type="button" class="ppfecha__nav" data-ir="-1" aria-label="Mes anterior">‹</button>
          <span class="ppfecha__mes"></span>
          <button type="button" class="ppfecha__nav" data-ir="1" aria-label="Mes siguiente">›</button>
        </div>
        <div class="ppfecha__dias">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="ppfecha__rejilla"></div>
        <button type="button" class="ppfecha__hoy">Hoy</button>
      </div>`;
    destino.innerHTML = '';
    destino.appendChild(raiz);

    const boton = raiz.querySelector('.ppfecha__boton');
    const texto = raiz.querySelector('.ppfecha__txt');
    const panel = raiz.querySelector('.ppfecha__panel');
    const tituloMes = raiz.querySelector('.ppfecha__mes');
    const rejilla = raiz.querySelector('.ppfecha__rejilla');

    function pintarBoton() {
      texto.textContent = comoSeLee(elegida);
      raiz.classList.toggle('is-vacio', !elegida);
    }

    function fueraDeRango(d) {
      return (tope && d > tope) || (piso && d < piso);
    }

    function pintarCalendario() {
      tituloMes.textContent = `${MESES[mesVisible.getMonth()]} ${mesVisible.getFullYear()}`;
      const primero = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
      const hueco = (primero.getDay() + 6) % 7;        // la semana arranca el lunes
      const cuantos = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
      const hoy = new Date();
      let html = '';
      for (let i = 0; i < hueco; i++) html += '<span class="ppfecha__hueco"></span>';
      for (let d = 1; d <= cuantos; d++) {
        const dia = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), d);
        html += `<button type="button" class="ppfecha__dia${
          mismoDia(dia, elegida) ? ' is-elegido' : ''}${
          mismoDia(dia, hoy) ? ' is-hoy' : ''}" data-d="${iso(dia)}"${
          fueraDeRango(dia) ? ' disabled' : ''}>${d}</button>`;
      }
      rejilla.innerHTML = html;
    }

    // El calendario se cuelga del body mientras está abierto. Dentro de una
    // ventana con scroll (un formulario largo, por ejemplo) un panel pegado al
    // campo lo recorta el contenedor: se veía media rejilla y aparecía una
    // barra de scroll horizontal.
    function colocar() {
      const r = boton.getBoundingClientRect();
      const ancho = panel.offsetWidth || 268;
      const alto = panel.offsetHeight || 300;
      const margen = 8;
      let izq = Math.min(r.left, window.innerWidth - ancho - margen);
      let arriba = r.bottom + 6;
      if (arriba + alto > window.innerHeight - margen) {
        arriba = Math.max(margen, r.top - alto - 6);   // no cabe abajo: va arriba
      }
      panel.style.left = Math.max(margen, izq) + 'px';
      panel.style.top = arriba + 'px';
    }

    function abrir(si) {
      abierto = si === undefined ? !abierto : si;
      boton.setAttribute('aria-expanded', String(abierto));
      raiz.classList.toggle('is-abierto', abierto);
      if (abierto) {
        mesVisible = new Date((elegida || new Date()).getFullYear(),
                              (elegida || new Date()).getMonth(), 1);
        pintarCalendario();
        document.body.appendChild(panel);
        panel.classList.add('ppfecha__panel--suelto');
        panel.hidden = false;
        colocar();
        window.addEventListener('resize', colocar);
        window.addEventListener('scroll', colocar, true);
      } else {
        panel.hidden = true;
        panel.classList.remove('ppfecha__panel--suelto');
        if (panel.parentNode !== raiz) raiz.appendChild(panel);
        window.removeEventListener('resize', colocar);
        window.removeEventListener('scroll', colocar, true);
      }
    }

    function elegir(d) {
      elegida = d;
      pintarBoton();
      abrir(false);
      if (cfg.al) cfg.al(elegida ? iso(elegida) : '');
    }

    boton.addEventListener('click', (e) => { e.preventDefault(); abrir(); });

    panel.addEventListener('click', (e) => {
      e.preventDefault();
      const nav = e.target.closest('[data-ir]');
      if (nav) {
        mesVisible = new Date(mesVisible.getFullYear(),
                              mesVisible.getMonth() + Number(nav.dataset.ir), 1);
        pintarCalendario();
        return;
      }
      if (e.target.closest('.ppfecha__hoy')) {
        const hoy = new Date();
        if (!fueraDeRango(hoy)) elegir(hoy);
        return;
      }
      const dia = e.target.closest('.ppfecha__dia');
      if (dia && !dia.disabled) elegir(deIso(dia.dataset.d));
    });

    // Cerrar al tocar afuera. Se mira el contenedor y no el botón: al repintar
    // el calendario el botón tocado deja de existir (mismo detalle que en PPRango).
    const alDocumento = (e) => {
      if (abierto && !raiz.contains(e.target)) abrir(false);
    };
    const alEscape = (e) => { if (e.key === 'Escape' && abierto) abrir(false); };
    document.addEventListener('click', alDocumento);
    document.addEventListener('keydown', alEscape);

    pintarBoton();

    return {
      valor: () => (elegida ? iso(elegida) : ''),
      poner: (t) => { elegida = deIso(t); pintarBoton(); },
      enfocar: () => boton.focus(),
      abrir: () => abrir(true),
      // Para cuando el formulario que lo contiene se cierra: si no, estos dos
      // oyentes quedan vivos para siempre.
      soltar: () => {
        abrir(false);
        document.removeEventListener('click', alDocumento);
        document.removeEventListener('keydown', alEscape);
        if (panel.parentNode) panel.parentNode.removeChild(panel);
      },
    };
  }

  return { crear, iso, deIso, comoSeLee };
})();
