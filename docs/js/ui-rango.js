/* Componente de rango de fechas — PinkPower
 *
 * Un período: los atajos de siempre (este mes, mes pasado…) y, si hace falta,
 * las dos fechas a mano. Guarda lo elegido y avisa cuando cambia.
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
 *   rango.ocupado(true);    // apaga los controles mientras se carga
 */
window.PPRango = (function () {
  const ATAJOS = [
    { v: 'hoy', t: 'Hoy' },
    { v: 'semana', t: 'Esta semana' },
    { v: 'este-mes', t: 'Este mes' },
    { v: 'mes-pasado', t: 'Mes pasado' },
    { v: '30', t: '30 días' },
    { v: 'este-ano', t: 'Este año' },
  ];

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function fechasDe(cual) {
    const hoy = new Date();
    const y = hoy.getFullYear(), m = hoy.getMonth();
    if (cual === 'hoy') return [hoy, hoy];
    if (cual === 'semana') {
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
      return [lunes, hoy];
    }
    if (cual === 'este-mes') return [new Date(y, m, 1), hoy];
    if (cual === 'mes-pasado') return [new Date(y, m - 1, 1), new Date(y, m, 0)];
    if (cual === 'este-ano') return [new Date(y, 0, 1), hoy];
    const atras = new Date(hoy);
    atras.setDate(atras.getDate() - 29);
    return [atras, hoy];
  }

  function crear(destino, opciones = {}) {
    const al = opciones.al || (() => {});
    let elegido = opciones.inicial || 'este-mes';

    destino.innerHTML = `
      <div class="pprango">
        <div class="pprango__atajos">
          ${ATAJOS.map((a) => `<button type="button" class="pprango__chip" data-v="${a.v}">${a.t}</button>`).join('')}
        </div>
        <div class="pprango__fechas">
          <label class="pprango__campo">
            <span>Desde</span><input type="date" data-cual="desde" />
          </label>
          <span class="pprango__guion">—</span>
          <label class="pprango__campo">
            <span>Hasta</span><input type="date" data-cual="hasta" />
          </label>
        </div>
      </div>`;

    const chips = [...destino.querySelectorAll('.pprango__chip')];
    const campoDesde = destino.querySelector('[data-cual="desde"]');
    const campoHasta = destino.querySelector('[data-cual="hasta"]');

    // Nadie vendió nada antes de que existiera la tienda, y el futuro no tiene
    // ventas: así el calendario no deja elegir fechas que no sirven.
    campoDesde.max = campoHasta.max = iso(new Date());

    function marcar(cual) {
      elegido = cual;
      chips.forEach((c) => c.classList.toggle('is-active', c.dataset.v === cual));
    }

    function poner(cual, avisar) {
      const [a, b] = fechasDe(cual);
      campoDesde.value = iso(a);
      campoHasta.value = iso(b);
      marcar(cual);
      if (avisar) al(campoDesde.value, campoHasta.value);
    }

    chips.forEach((c) => c.addEventListener('click', () => poner(c.dataset.v, true)));

    [campoDesde, campoHasta].forEach((campo) => campo.addEventListener('change', () => {
      // Si las escribe al revés, se enderezan solas en vez de dar error.
      if (campoDesde.value && campoHasta.value && campoDesde.value > campoHasta.value) {
        const x = campoDesde.value;
        campoDesde.value = campoHasta.value;
        campoHasta.value = x;
      }
      marcar('');
      if (campoDesde.value && campoHasta.value) al(campoDesde.value, campoHasta.value);
    }));

    poner(elegido, false);

    return {
      valores: () => ({ desde: campoDesde.value, hasta: campoHasta.value }),
      poner: (cual) => poner(cual, true),
      elegido: () => elegido,
      ocupado: (si) => {
        chips.forEach((c) => { c.disabled = !!si; });
        campoDesde.disabled = campoHasta.disabled = !!si;
        destino.firstElementChild.classList.toggle('is-ocupado', !!si);
      },
      // Para los títulos: "del 1 al 30 de septiembre" se lee mejor que las ISO.
      texto: () => {
        const f = (v) => v.split('-').reverse().join('/');
        return `${f(campoDesde.value)} al ${f(campoHasta.value)}`;
      },
    };
  }

  return { crear, fechasDe, iso };
})();
