/* Componente de rango de fechas — PinkPower
 *
 * Un solo control: dice el período elegido y, al tocarlo, abre los atajos de
 * siempre (hoy, este mes, mes pasado…) junto a un calendario para elegir a
 * mano. Se hizo propio y no con los <input type="date"> del navegador porque
 * cada navegador los dibuja distinto, en el teléfono abren la ruedita del
 * sistema y no hay forma de enseñar el rango completo pintado.
 *
 * Es un script clásico (no módulo), igual que PPTabla: el panel es un solo
 * archivo con su JS adentro y se usa como `PPRango.crear(...)`.
 *
 * Uso:
 *   const rango = PPRango.crear(document.getElementById('destino'), {
 *     inicial: 'este-mes',
 *     al: (desde, hasta) => cargar(desde, hasta),   // 'aaaa-mm-dd'
 *   });
 *   rango.valores();        // { desde, hasta }
 *   rango.texto();          // '1 al 30 de septiembre'
 *   rango.ocupado(true);    // lo apaga mientras se carga
 */
window.PPRango = (function () {
  const ATAJOS = [
    { v: 'hoy', t: 'Hoy' },
    { v: 'ayer', t: 'Ayer' },
    { v: 'semana', t: 'Esta semana' },
    { v: 'este-mes', t: 'Este mes' },
    { v: 'mes-pasado', t: 'Mes pasado' },
    { v: '30', t: 'Últimos 30 días' },
    { v: 'este-ano', t: 'Este año' },
  ];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deIso = (t) => { const [a, m, d] = t.split('-').map(Number); return new Date(a, m - 1, d); };
  const mismoDia = (a, b) => a && b && iso(a) === iso(b);

  function fechasDe(cual) {
    const hoy = new Date();
    const y = hoy.getFullYear(), m = hoy.getMonth();
    if (cual === 'hoy') return [hoy, hoy];
    if (cual === 'ayer') {
      const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
      return [ayer, ayer];
    }
    if (cual === 'semana') {
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
      return [lunes, hoy];
    }
    if (cual === 'este-mes') return [new Date(y, m, 1), hoy];
    if (cual === 'mes-pasado') return [new Date(y, m - 1, 1), new Date(y, m, 0)];
    if (cual === 'este-ano') return [new Date(y, 0, 1), hoy];
    const atras = new Date(hoy);
    atras.setDate(hoy.getDate() - 29);
    return [atras, hoy];
  }

  // "1 al 30 de septiembre" si es el mismo mes; "28 sep al 5 oct" si no.
  function comoSeLee(a, b) {
    if (mismoDia(a, b)) return `${a.getDate()} de ${MESES[a.getMonth()]}`;
    const mismoAno = a.getFullYear() === b.getFullYear();
    if (mismoAno && a.getMonth() === b.getMonth()) {
      return `${a.getDate()} al ${b.getDate()} de ${MESES[a.getMonth()]}`;
    }
    const corto = (d) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
    return `${corto(a)} al ${corto(b)}${mismoAno ? '' : ' ' + b.getFullYear()}`;
  }

  function crear(destino, opciones = {}) {
    const al = opciones.al || (() => {});
    const hoy = new Date();
    let [desde, hasta] = fechasDe(opciones.inicial || 'este-mes');
    let elegido = opciones.inicial || 'este-mes';
    let abierto = false;
    let mesVisible = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
    let provisional = null;      // el primer día tocado, esperando el segundo
    let asomado = null;          // por encima de cuál está el dedo o el puntero

    destino.innerHTML = `
      <div class="pprango">
        <button type="button" class="pprango__boton" aria-haspopup="dialog" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2.5"></rect>
            <line x1="3" y1="10" x2="21" y2="10"></line>
            <line x1="8" y1="3" x2="8" y2="6"></line><line x1="16" y1="3" x2="16" y2="6"></line>
          </svg>
          <span class="pprango__txt"></span>
          <svg class="pprango__flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="pprango__panel" role="dialog" aria-label="Elegir período" hidden>
          <div class="pprango__atajos">
            ${ATAJOS.map((a) => `<button type="button" class="pprango__atajo" data-v="${a.v}">${a.t}</button>`).join('')}
          </div>
          <div class="pprango__cal">
            <div class="pprango__cab">
              <button type="button" class="pprango__nav" data-ir="-1" aria-label="Mes anterior">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <strong class="pprango__mes"></strong>
              <button type="button" class="pprango__nav" data-ir="1" aria-label="Mes siguiente">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
            <div class="pprango__dias">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
            <div class="pprango__rejilla"></div>
            <p class="pprango__pie"></p>
          </div>
        </div>
      </div>`;

    const raiz = destino.firstElementChild;
    const boton = raiz.querySelector('.pprango__boton');
    const panel = raiz.querySelector('.pprango__panel');
    const texto = raiz.querySelector('.pprango__txt');
    const rejilla = raiz.querySelector('.pprango__rejilla');
    const tituloMes = raiz.querySelector('.pprango__mes');
    const pie = raiz.querySelector('.pprango__pie');

    function pintarBoton() {
      texto.textContent = comoSeLee(desde, hasta);
      raiz.querySelectorAll('.pprango__atajo').forEach((a) =>
        a.classList.toggle('is-active', a.dataset.v === elegido));
    }

    function pintarCalendario() {
      tituloMes.textContent = `${MESES[mesVisible.getMonth()]} ${mesVisible.getFullYear()}`;
      const primero = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
      const hueco = (primero.getDay() + 6) % 7;              // la semana arranca el lunes
      const cuantos = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
      // Con un día ya marcado, el rango se pinta hasta donde está el dedo o el
      // puntero: así se ve lo que se va a elegir antes de soltar el segundo.
      let ini = desde, fin = hasta;
      if (provisional) {
        const otro = asomado || provisional;
        ini = provisional < otro ? provisional : otro;
        fin = provisional < otro ? otro : provisional;
      }

      let html = '';
      for (let i = 0; i < hueco; i++) html += '<span class="pprango__hueco"></span>';
      for (let d = 1; d <= cuantos; d++) {
        const dia = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), d);
        const futuro = dia > hoy;
        const dentro = !futuro && dia >= ini && dia <= fin;
        const punta = mismoDia(dia, ini) || mismoDia(dia, fin);
        html += `<button type="button" class="pprango__dia${dentro ? ' is-dentro' : ''}${
          punta ? ' is-punta' : ''}${mismoDia(dia, hoy) ? ' is-hoy' : ''}"
          data-d="${iso(dia)}"${futuro ? ' disabled' : ''}>${d}</button>`;
      }
      rejilla.innerHTML = html;
      pie.textContent = provisional
        ? 'Ahora toque el último día'
        : comoSeLee(desde, hasta);
    }

    function abrir(si) {
      abierto = si === undefined ? !abierto : si;
      panel.hidden = !abierto;
      boton.setAttribute('aria-expanded', String(abierto));
      raiz.classList.toggle('is-abierto', abierto);
      if (abierto) {
        provisional = null;
        asomado = null;
        mesVisible = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
        pintarCalendario();
      }
    }

    function aplicar(a, b, cual) {
      desde = a; hasta = b; elegido = cual || '';
      pintarBoton();
      al(iso(desde), iso(hasta));
    }

    boton.addEventListener('click', () => abrir());

    raiz.querySelectorAll('.pprango__atajo').forEach((a) =>
      a.addEventListener('click', () => {
        const [x, y] = fechasDe(a.dataset.v);
        aplicar(x, y, a.dataset.v);
        abrir(false);
      }));

    raiz.querySelectorAll('.pprango__nav').forEach((b) =>
      b.addEventListener('click', () => {
        mesVisible = new Date(mesVisible.getFullYear(),
                              mesVisible.getMonth() + Number(b.dataset.ir), 1);
        pintarCalendario();
      }));

    // Primer toque: el día de inicio. Segundo: el final (y si cae antes, se
    // dan vuelta solos en vez de dar error).
    rejilla.addEventListener('click', (ev) => {
      const b = ev.target.closest('.pprango__dia');
      if (!b || b.disabled) return;
      ev.stopPropagation();
      const dia = deIso(b.dataset.d);
      if (!provisional) {
        provisional = dia;
        pintarCalendario();
        return;
      }
      const a = provisional < dia ? provisional : dia;
      const z = provisional < dia ? dia : provisional;
      provisional = null;
      asomado = null;
      aplicar(a, z, '');
      abrir(false);
    });

    // Se mira el CAMINO del toque y no `contains`: al elegir el primer día se
    // repinta el calendario, el botón tocado deja de existir, y `contains` daba
    // "fue afuera" y cerraba el panel antes de poder marcar el segundo día.
    document.addEventListener('click', (ev) => {
      if (!abierto) return;
      const camino = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
      if (!camino.includes(raiz) && !raiz.contains(ev.target)) abrir(false);
    });
    rejilla.addEventListener('pointerover', (ev) => {
      if (!provisional) return;
      const b = ev.target.closest('.pprango__dia');
      if (!b || b.disabled) return;
      const dia = deIso(b.dataset.d);
      if (mismoDia(dia, asomado)) return;
      asomado = dia;
      pintarCalendario();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && abierto) abrir(false);
    });

    pintarBoton();

    return {
      valores: () => ({ desde: iso(desde), hasta: iso(hasta) }),
      texto: () => comoSeLee(desde, hasta),
      elegido: () => elegido,
      poner: (cual) => { const [a, b] = fechasDe(cual); aplicar(a, b, cual); },
      ocupado: (si) => {
        boton.disabled = !!si;
        raiz.classList.toggle('is-ocupado', !!si);
      },
    };
  }

  return { crear, fechasDe, iso, comoSeLee };
})();
