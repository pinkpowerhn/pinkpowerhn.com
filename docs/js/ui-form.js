/* Formularios del panel — PinkPower
 *
 * Se describe QUÉ se pide y el componente arma el resto: el HTML, la
 * validación y cómo se acomoda en el teléfono. Antes cada pantalla repetía sus
 * <label>, sus mensajes de error y su propio criterio de responsive.
 *
 * Monta sobre PPModal (la ventana), PPSelect (los desplegables) y PPFecha (el
 * calendario). Ninguno usa controles del navegador: el <select> y el
 * <input type="date"> se dibujan distinto en cada sistema y, puestos al lado
 * de un campo de texto, se ve el escalón.
 *
 * Uso:
 *   const datos = await PPForm.abrir({
 *     titulo: 'Nueva orden de compra',
 *     confirmar: 'Crear la orden',
 *     campos: [
 *       { id: 'tienda', tipo: 'texto', etiqueta: 'Proveedor', obligatorio: '¿A quién se le compró?' },
 *       { id: 'fecha',  tipo: 'fecha', etiqueta: 'Fecha', valor: hoy, max: hoy },
 *       { id: 'moneda', tipo: 'select', etiqueta: 'Moneda', mitad: true,
 *         opciones: [{ v: 'USD', t: 'Dólares' }, { v: 'HNL', t: 'Lempiras' }] },
 *       { id: 'tasa', tipo: 'numero', etiqueta: 'Tipo de cambio', mitad: true,
 *         obligatorioSi: (v) => v.moneda === 'USD', mensaje: 'Ponga el cambio' },
 *     ],
 *   });
 *   // datos === null si se cerró sin guardar
 *
 * Tipos: texto · texto-largo · numero · dinero · fecha · select · si-no · nota
 *
 * Un `select` puede traer `buscar` (texto del filtro que sale arriba del menú)
 * y `accion` ({ texto, al }) para crear ahí mismo lo que falta en la lista.
 */
window.PPForm = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function etiquetaHTML(c) {
    const ayuda = c.ayuda ? ` <span class="ppform__op">(${esc(c.ayuda)})</span>` : '';
    return `<span class="ppform__nm">${esc(c.etiqueta || '')}${ayuda}</span>`;
  }

  function campoHTML(c) {
    const id = `ppf-${c.id}`;
    const valor = c.valor == null ? '' : c.valor;
    switch (c.tipo) {
      case 'nota':
        return `<p class="ppform__nota" id="${id}">${c.html || esc(c.texto || '')}</p>`;

      case 'texto-largo':
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <textarea id="${id}" maxlength="${c.max || 2000}"
            placeholder="${esc(c.placeholder || '')}">${esc(valor)}</textarea></label>`;

      // Los dos se montan en didOpen: aquí queda el hueco con su etiqueta.
      case 'select':
      case 'fecha':
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <span class="ppform__monta" id="${id}"></span></label>`;

      case 'si-no':
        return `<label class="ppform__check">
          <input type="checkbox" id="${id}"${valor ? ' checked' : ''} />
          <span>${esc(c.etiqueta || '')}</span></label>`;

      case 'dinero':
        // El símbolo va en su propia caja pegada al campo, no flotando encima
        // del número: superpuesto se montaba con las cifras largas.
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <span class="ppform__grupo">
            <span class="ppform__simbolo">${esc(c.prefijo || 'L.')}</span>
            <input type="number" id="${id}" inputmode="decimal"
              step="${c.paso || '0.01'}"${c.min != null ? ` min="${c.min}"` : ''}
              placeholder="${esc(c.placeholder || '0.00')}" value="${esc(valor)}" />
          </span></label>`;

      case 'numero':
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <input type="number" id="${id}" inputmode="decimal"
            step="${c.paso || '0.01'}"${c.min != null ? ` min="${c.min}"` : ''}${
            c.max != null ? ` max="${c.max}"` : ''}
            placeholder="${esc(c.placeholder || '')}" value="${esc(valor)}" /></label>`;

      default:
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <input type="text" id="${id}" maxlength="${c.max || 200}"
            placeholder="${esc(c.placeholder || '')}" value="${esc(valor)}"
            autocomplete="off" /></label>`;
    }
  }

  // Los campos marcados `mitad` se emparejan de dos en dos; en el teléfono el
  // CSS los vuelve a poner uno debajo del otro.
  function cuerpoHTML(campos) {
    const trozos = [];
    let pendiente = null;
    for (const c of campos) {
      if (c.oculto) continue;
      if (c.mitad) {
        if (pendiente) {
          trozos.push(`<div class="ppform__dos">${campoHTML(pendiente)}${campoHTML(c)}</div>`);
          pendiente = null;
        } else { pendiente = c; }
      } else {
        if (pendiente) { trozos.push(campoHTML(pendiente)); pendiente = null; }
        trozos.push(campoHTML(c));
      }
    }
    if (pendiente) trozos.push(campoHTML(pendiente));
    return `<div class="ppform">${trozos.join('')}</div>`;
  }

  function leer(campos, montados) {
    const v = {};
    for (const c of campos) {
      if (c.oculto || c.tipo === 'nota') continue;
      const el = document.getElementById(`ppf-${c.id}`);
      if (c.tipo === 'fecha' || c.tipo === 'select') {
        v[c.id] = montados[c.id] ? montados[c.id].valor() : '';
      } else if (c.tipo === 'si-no') {
        v[c.id] = !!(el && el.checked);
      } else if (c.tipo === 'numero' || c.tipo === 'dinero') {
        const t = el ? el.value.trim() : '';
        v[c.id] = t === '' ? null : Number(t);
      } else {
        v[c.id] = el ? el.value.trim() : '';
      }
    }
    return v;
  }

  function revisar(campos, v) {
    for (const c of campos) {
      if (c.oculto || c.tipo === 'nota' || c.tipo === 'si-no') continue;
      const vacio = v[c.id] === '' || v[c.id] == null;
      const obligatorio = c.obligatorio || (c.obligatorioSi && c.obligatorioSi(v));
      if (obligatorio && vacio) {
        return (typeof c.obligatorio === 'string' && c.obligatorio)
          || c.mensaje || `Falta ${String(c.etiqueta || '').toLowerCase()}`;
      }
      if (!vacio && (c.tipo === 'numero' || c.tipo === 'dinero')) {
        if (Number.isNaN(v[c.id])) return `${c.etiqueta} tiene que ser un número`;
        if (c.entero && v[c.id] !== Math.floor(v[c.id])) {
          return `${c.etiqueta} tiene que ser un número entero`;
        }
        if (c.min != null && v[c.id] < c.min) {
          return c.mensaje || `${c.etiqueta} no puede ser menor que ${c.min}`;
        }
      }
    }
    return null;
  }

  async function abrir(opciones) {
    const cfg = Object.assign({
      titulo: '', sub: '', confirmar: 'Guardar', cancelar: 'Cancelar',
      ancho: 520, campos: [], validar: null, enfocar: null,
      // alCambiar(valores, api) corre con cada tecla. `api.nota(id, html)`
      // reescribe un campo de tipo nota: sirve para ir enseñando una cuenta
      // mientras se llena (el flete de la caja, por ejemplo).
      alCambiar: null,
    }, opciones || {});
    const campos = cfg.campos.filter(Boolean);
    const montados = {};

    const datos = await PPModal.abrir({
      titulo: cfg.titulo,
      sub: cfg.sub,
      ancho: cfg.ancho,
      confirmar: cfg.confirmar,
      cancelar: cfg.cancelar,
      cuerpo: cuerpoHTML(campos),
      alAbrir: (caja) => {
        for (const c of campos) {
          if (c.oculto) continue;
          const hueco = document.getElementById(`ppf-${c.id}`);
          if (c.tipo === 'fecha') {
            montados[c.id] = PPFecha.crear(hueco, {
              valor: c.valor || '', min: c.min || '', max: c.max || '' });
          } else if (c.tipo === 'select') {
            montados[c.id] = PPSelect.crear(hueco, {
              opciones: c.opciones || [], valor: c.valor,
              vacio: c.placeholder || 'Elegir…',
              buscar: c.buscar || null,
              accion: c.accion || null });
          }
        }
        if (cfg.alCambiar) {
          const ayuda = {
            nota: (id, html) => {
              const p = document.getElementById(`ppf-${id}`);
              if (p) p.innerHTML = html;
            },
          };
          const correr = () => cfg.alCambiar(leer(campos, montados), ayuda);
          caja.addEventListener('input', correr);
          caja.addEventListener('change', correr);
          Object.values(montados).forEach((m) => { if (m.alCambiar) m.alCambiar(correr); });
          correr();
        }
        const primero = cfg.enfocar
          || (campos.find((c) => !c.oculto && c.tipo !== 'nota') || {}).id;
        const el = primero && document.getElementById(`ppf-${primero}`);
        if (el && el.focus) el.focus();
      },
      alConfirmar: (_caja, api) => {
        const v = leer(campos, montados);
        const problema = revisar(campos, v) || (cfg.validar && cfg.validar(v));
        if (problema) { api.avisar(problema); return false; }
        return v;
      },
    });

    // Los calendarios y desplegables dejan oyentes en el documento.
    Object.values(montados).forEach((m) => m.soltar && m.soltar());
    return datos;
  }

  return { abrir };
})();
