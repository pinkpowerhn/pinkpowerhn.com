/* Componente de tabla del panel — PinkPower
 *
 * Una tabla con filtros, esqueleto de carga, menú de acciones por fila (los tres
 * puntitos) y paginación. En computadora se ve como tabla; en teléfono cada fila
 * se convierte en una tarjeta, porque una tabla de cinco columnas ahí no se lee.
 *
 * Es un script clásico (no módulo) porque el panel es un solo archivo con su JS
 * adentro: se usa como `PPTabla.crear(...)`.
 *
 * Uso:
 *   const tabla = PPTabla.crear(document.getElementById('destino'), {
 *     columnas: [
 *       { clave: 'usuario', titulo: 'Usuaria', principal: true },
 *       { clave: 'nombre',  titulo: 'Nombre' },
 *       { clave: 'estado',  titulo: 'Estado', html: (f) => `<span>…</span>` },
 *     ],
 *     filtros: [{ clave: 'estado', titulo: 'Estado',
 *                 opciones: [{ v: 'activa', t: 'Activas' }] }],
 *     buscar: (fila, texto) => fila.nombre.toLowerCase().includes(texto),
 *     acciones: (fila) => [{ texto: 'Editar', al: () => … }],
 *     porPagina: 12,
 *     vacio: 'Todavía no hay nada acá',
 *   });
 *   tabla.cargando();          // muestra el esqueleto
 *   tabla.datos(filas);        // pinta las filas
 */
window.PPTabla = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (v) => String(v == null ? '' : v).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const IC_PUNTOS = '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>';
  const IC_LUPA = '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';
  const IC_FILTRO = '<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.3" fill="currentColor" stroke="none"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2.3" fill="currentColor" stroke="none"/>';

  function svg(d, relleno) {
    return `<svg viewBox="0 0 24 24" fill="${relleno ? 'currentColor' : 'none'}" stroke="currentColor"
      stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  function crear(destino, opciones) {
    const cfg = Object.assign({
      columnas: [], filtros: [], acciones: null, buscar: null,
      porPagina: 12, vacio: 'No hay nada para mostrar', buscarTexto: 'Buscar…',
      accionPrincipal: null,
    }, opciones || {});

    const estado = { filas: [], cargando: true, texto: '', pagina: 1, filtros: {}, menu: null };

    // ── Filtrado ───────────────────────────────────────────────────────────
    function filtradas() {
      let r = estado.filas;
      const t = norm(estado.texto).trim();
      if (t && cfg.buscar) r = r.filter((f) => cfg.buscar(f, t));
      for (const [clave, valor] of Object.entries(estado.filtros)) {
        if (!valor) continue;
        const filtro = cfg.filtros.find((x) => x.clave === clave);
        r = filtro && filtro.aplica
          ? r.filter((f) => filtro.aplica(f, valor))
          : r.filter((f) => String(f[clave]) === valor);
      }
      return r;
    }

    function paginadas(r) {
      const desde = (estado.pagina - 1) * cfg.porPagina;
      return r.slice(desde, desde + cfg.porPagina);
    }

    // ── Piezas ─────────────────────────────────────────────────────────────
    function barraHTML() {
      const filtros = cfg.filtros.map((f) => {
        const actual = estado.filtros[f.clave] || '';
        const sel = f.opciones.find((o) => o.v === actual);
        return `<div class="pp-select pp-tabla__filtro" data-filtro="${esc(f.clave)}">
          <button class="pp-select__btn" type="button" aria-expanded="false">
            ${svg(IC_FILTRO, false)}
            <span class="pp-select__lb">${esc(sel ? sel.t : f.titulo)}</span>
            <svg class="pp-select__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="pp-select__menu" role="listbox" hidden>
            <button class="pp-select__opt ${!actual ? 'is-active' : ''}" type="button" data-valor="">${esc(f.titulo)}: todas</button>
            ${f.opciones.map((o) => `<button class="pp-select__opt ${o.v === actual ? 'is-active' : ''}"
              type="button" data-valor="${esc(o.v)}">${esc(o.t)}</button>`).join('')}
          </div>
        </div>`;
      }).join('');

      return `<div class="pp-tabla__barra">
        <div class="pp-tabla__buscar">
          ${svg(IC_LUPA, false)}
          <input type="search" placeholder="${esc(cfg.buscarTexto)}" value="${esc(estado.texto)}"
                 data-buscar autocomplete="off" />
        </div>
        ${filtros}
        ${cfg.accionPrincipal ? `<button class="btn pp-tabla__principal" type="button" data-principal>
            ${esc(cfg.accionPrincipal.texto)}</button>` : ''}
      </div>`;
    }

    function esqueletoHTML() {
      const cols = cfg.columnas.length;
      const fila = `<tr>${cfg.columnas.map((_, i) => `<td><span class="pp-sk"
        style="width:${i === 0 ? '70%' : (40 + (i * 13) % 45) + '%'}"></span></td>`).join('')}
        ${cfg.acciones ? '<td><span class="pp-sk pp-sk--puntos"></span></td>' : ''}</tr>`;
      return `<table class="pp-tabla__tabla">
        <thead><tr>${cfg.columnas.map((c) => `<th>${esc(c.titulo)}</th>`).join('')}
          ${cfg.acciones ? '<th></th>' : ''}</tr></thead>
        <tbody>${Array.from({ length: 6 }, () => fila).join('')}</tbody>
      </table>`.replace('COLS', cols);
    }

    function celdaHTML(col, fila) {
      if (col.html) return col.html(fila);
      return esc(fila[col.clave]);
    }

    function cuerpoHTML() {
      const todas = filtradas();
      const hoja = paginadas(todas);
      if (!todas.length) {
        return `<div class="pp-tabla__vacio">
          <div class="pp-tabla__vacio-ic">${svg(IC_LUPA, false)}</div>
          <p>${esc(estado.texto || Object.values(estado.filtros).some(Boolean)
            ? 'No hay resultados con eso' : cfg.vacio)}</p>
        </div>`;
      }
      return `<table class="pp-tabla__tabla">
        <thead><tr>${cfg.columnas.map((c) => `<th>${esc(c.titulo)}</th>`).join('')}
          ${cfg.acciones ? '<th class="pp-tabla__th-acc"></th>' : ''}</tr></thead>
        <tbody>
          ${hoja.map((fila, i) => `<tr data-fila="${i}">
            ${cfg.columnas.map((c) => `<td data-titulo="${esc(c.titulo)}"
              class="${c.principal ? 'pp-tabla__td-ppal' : ''}">${celdaHTML(c, fila)}</td>`).join('')}
            ${cfg.acciones ? `<td class="pp-tabla__td-acc">
              <button class="pp-tabla__puntos" type="button" data-menu="${i}"
                      aria-label="Acciones" aria-haspopup="menu">${svg(IC_PUNTOS, true)}</button>
            </td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>`;
    }

    function paginacionHTML() {
      const total = filtradas().length;
      const paginas = Math.max(1, Math.ceil(total / cfg.porPagina));
      if (total === 0) return '';
      const desde = (estado.pagina - 1) * cfg.porPagina + 1;
      const hasta = Math.min(total, estado.pagina * cfg.porPagina);
      return `<div class="pp-tabla__pies">
        <span class="pp-tabla__cuenta">${desde}–${hasta} de ${total}</span>
        <div class="pp-tabla__pags">
          <button class="pp-tabla__pag" type="button" data-pag="ant"
                  ${estado.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
          <span class="pp-tabla__pag-num">${estado.pagina} / ${paginas}</span>
          <button class="pp-tabla__pag" type="button" data-pag="sig"
                  ${estado.pagina >= paginas ? 'disabled' : ''}>Siguiente</button>
        </div>
      </div>`;
    }

    function pintar() {
      const foco = destino.querySelector('[data-buscar]') === document.activeElement;
      const pos = foco ? destino.querySelector('[data-buscar]').selectionStart : 0;
      destino.className = 'pp-tabla';
      destino.innerHTML = barraHTML() +
        (estado.cargando ? esqueletoHTML() : cuerpoHTML() + paginacionHTML());
      if (foco) {
        const i = destino.querySelector('[data-buscar]');
        if (i) { i.focus(); i.setSelectionRange(pos, pos); }
      }
    }

    // ── Menú de acciones ───────────────────────────────────────────────────
    function cerrarMenu() {
      const m = document.getElementById('pp-tabla-menu');
      if (m) m.remove();
      estado.menu = null;
    }

    function abrirMenu(boton, fila) {
      cerrarMenu();
      const acciones = cfg.acciones(fila) || [];
      if (!acciones.length) return;
      const m = document.createElement('div');
      m.id = 'pp-tabla-menu';
      m.className = 'pp-tabla__menu';
      m.setAttribute('role', 'menu');
      m.innerHTML = acciones.map((a, i) => `<button class="pp-tabla__op ${a.peligro ? 'is-peligro' : ''}"
        type="button" role="menuitem" data-op="${i}" ${a.desactivada ? 'disabled' : ''}>
        ${esc(a.texto)}</button>`).join('');
      document.body.appendChild(m);

      const r = boton.getBoundingClientRect();
      const alto = m.getBoundingClientRect().height;
      // Si no cabe abajo, se abre hacia arriba: en las últimas filas de la lista
      // el menú quedaba cortado contra el borde de la ventana.
      const abajo = r.bottom + alto + 8 < window.innerHeight;
      m.style.top = (abajo ? r.bottom + 6 : r.top - alto - 6) + window.scrollY + 'px';
      m.style.left = Math.max(8, r.right - m.getBoundingClientRect().width) + window.scrollX + 'px';

      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-op]');
        if (!b) return;
        const a = acciones[Number(b.dataset.op)];
        cerrarMenu();
        if (a && a.al) a.al();
      });
      estado.menu = m;
    }

    // ── Eventos ────────────────────────────────────────────────────────────
    destino.addEventListener('input', (e) => {
      if (e.target.dataset.buscar === undefined) return;
      estado.texto = e.target.value;
      estado.pagina = 1;
      pintar();
    });

    destino.addEventListener('click', (e) => {
      const btnFiltro = e.target.closest('.pp-tabla__filtro .pp-select__btn');
      if (btnFiltro) {
        const menu = btnFiltro.nextElementSibling;
        const abrir = menu.hidden;
        destino.querySelectorAll('.pp-select__menu').forEach((m) => { m.hidden = true; });
        destino.querySelectorAll('.pp-select__btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
        menu.hidden = !abrir;
        btnFiltro.setAttribute('aria-expanded', String(abrir));
        return;
      }
      const opt = e.target.closest('.pp-tabla__filtro .pp-select__opt');
      if (opt) {
        const clave = opt.closest('.pp-tabla__filtro').dataset.filtro;
        estado.filtros[clave] = opt.dataset.valor;
        estado.pagina = 1;
        pintar();
        return;
      }
      const puntos = e.target.closest('[data-menu]');
      if (puntos) {
        const fila = paginadas(filtradas())[Number(puntos.dataset.menu)];
        if (estado.menu) cerrarMenu(); else abrirMenu(puntos, fila);
        return;
      }
      const pag = e.target.closest('[data-pag]');
      if (pag) {
        const paginas = Math.max(1, Math.ceil(filtradas().length / cfg.porPagina));
        estado.pagina = pag.dataset.pag === 'ant'
          ? Math.max(1, estado.pagina - 1) : Math.min(paginas, estado.pagina + 1);
        pintar();
        destino.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      if (e.target.closest('[data-principal]') && cfg.accionPrincipal.al) cfg.accionPrincipal.al();
    });

    document.addEventListener('click', (e) => {
      if (estado.menu && !e.target.closest('#pp-tabla-menu') && !e.target.closest('[data-menu]')) cerrarMenu();
      if (!e.target.closest('.pp-tabla__filtro')) {
        destino.querySelectorAll('.pp-select__menu').forEach((m) => { m.hidden = true; });
        destino.querySelectorAll('.pp-tabla__filtro .pp-select__btn')
          .forEach((b) => b.setAttribute('aria-expanded', 'false'));
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
    window.addEventListener('scroll', () => { if (estado.menu) cerrarMenu(); }, { passive: true });

    pintar();

    return {
      cargando() { estado.cargando = true; pintar(); },
      datos(filas) {
        estado.filas = filas || [];
        estado.cargando = false;
        const paginas = Math.max(1, Math.ceil(filtradas().length / cfg.porPagina));
        if (estado.pagina > paginas) estado.pagina = paginas;
        pintar();
      },
      refrescar: pintar,
      get texto() { return estado.texto; },
    };
  }

  return { crear };
})();
