/* Formularios del panel — PinkPower
 *
 * Antes cada pantalla escribía su propio HTML dentro de un Swal: los mismos
 * `<label>`, las mismas validaciones y el mismo "(opcional)" copiados una y
 * otra vez, y cada copia con su propio criterio de cómo se ve en el teléfono.
 * Aquí se describe QUÉ se pide y el componente se encarga del resto.
 *
 * Es un script clásico (no módulo), igual que PPTabla, PPRango y PPFecha.
 * Necesita SweetAlert2 cargado (es el que ya usa el panel para sus ventanas) y
 * PPFecha para los campos de fecha.
 *
 * Uso:
 *   const datos = await PPForm.abrir({
 *     titulo: 'Nueva orden de compra',
 *     confirmar: 'Crear la orden',
 *     campos: [
 *       { id: 'tienda', tipo: 'texto', etiqueta: 'Tienda', obligatorio: '¿En qué tienda se compró?' },
 *       { id: 'fecha',  tipo: 'fecha', etiqueta: 'Fecha', valor: hoy, max: hoy, obligatorio: true },
 *       { id: 'moneda', tipo: 'select', etiqueta: 'Moneda', mitad: true,
 *         opciones: [{ v: 'USD', t: 'Dólares' }, { v: 'HNL', t: 'Lempiras' }] },
 *       { id: 'tasa', tipo: 'numero', etiqueta: 'Tipo de cambio', mitad: true, paso: 0.0001,
 *         obligatorioSi: (v) => v.moneda === 'USD', mensaje: 'Ponga a cómo está el dólar' },
 *     ],
 *   });
 *   // datos === null si cerró sin guardar
 *
 * Tipos: texto · texto-largo · numero · dinero · fecha · select · si-no · nota
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
        return `<p class="ppform__nota">${c.html || esc(c.texto || '')}</p>`;

      case 'texto-largo':
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <textarea id="${id}" maxlength="${c.max || 2000}"
            placeholder="${esc(c.placeholder || '')}">${esc(valor)}</textarea></label>`;

      case 'select':
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <select id="${id}">${(c.opciones || []).map((o) =>
            `<option value="${esc(o.v)}"${String(o.v) === String(valor) ? ' selected' : ''}
              >${esc(o.t)}</option>`).join('')}</select></label>`;

      case 'si-no':
        return `<label class="ppform__check">
          <input type="checkbox" id="${id}"${valor ? ' checked' : ''} />
          <span>${esc(c.etiqueta || '')}</span></label>`;

      case 'fecha':
        // El calendario lo monta PPFecha en didOpen: aquí solo queda el hueco.
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          <span class="ppform__fecha" id="${id}"></span></label>`;

      case 'numero':
      case 'dinero': {
        const prefijo = c.tipo === 'dinero' ? (c.prefijo || 'L.') : '';
        const input = `<input type="number" id="${id}" inputmode="decimal"
          ${c.paso ? `step="${c.paso}"` : 'step="0.01"'}
          ${c.min != null ? `min="${c.min}"` : ''}
          ${c.max != null ? `max="${c.max}"` : ''}
          placeholder="${esc(c.placeholder || '')}" value="${esc(valor)}" />`;
        return `<label class="ppform__campo">${etiquetaHTML(c)}
          ${prefijo ? `<span class="ppform__conpre"><i>${esc(prefijo)}</i>${input}</span>` : input}
          </label>`;
      }

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
        } else {
          pendiente = c;
        }
      } else {
        if (pendiente) { trozos.push(campoHTML(pendiente)); pendiente = null; }
        trozos.push(campoHTML(c));
      }
    }
    if (pendiente) trozos.push(campoHTML(pendiente));
    return `<div class="ppform">${trozos.join('')}</div>`;
  }

  function leer(campos, fechas) {
    const v = {};
    for (const c of campos) {
      if (c.oculto || c.tipo === 'nota') continue;
      const el = document.getElementById(`ppf-${c.id}`);
      if (c.tipo === 'fecha') {
        v[c.id] = fechas[c.id] ? fechas[c.id].valor() : '';
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
      const hacefalta = c.obligatorio || (c.obligatorioSi && c.obligatorioSi(v));
      if (hacefalta && vacio) {
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
      titulo: '', confirmar: 'Guardar', cancelar: 'Cancelar',
      ancho: 520, campos: [], validar: null, enfocar: null,
    }, opciones || {});
    const campos = cfg.campos.filter(Boolean);
    const fechas = {};

    const r = await Swal.fire({
      title: cfg.titulo,
      html: cuerpoHTML(campos),
      width: cfg.ancho,
      showCancelButton: true,
      confirmButtonText: cfg.confirmar,
      cancelButtonText: cfg.cancelar,
      confirmButtonColor: '#e8437a',
      cancelButtonColor: '#c9b0bd',
      focusConfirm: false,
      didOpen: () => {
        for (const c of campos) {
          if (c.tipo === 'fecha' && !c.oculto) {
            fechas[c.id] = PPFecha.crear(document.getElementById(`ppf-${c.id}`), {
              valor: c.valor || '', min: c.min || '', max: c.max || '',
            });
          }
        }
        const primero = cfg.enfocar
          || (campos.find((c) => !c.oculto && c.tipo !== 'nota') || {}).id;
        const el = primero && document.getElementById(`ppf-${primero}`);
        if (el && el.focus) el.focus();
        if (cfg.alAbrir) cfg.alAbrir({ valores: () => leer(campos, fechas) });
      },
      willClose: () => {
        // Los calendarios dejan oyentes en el documento: hay que soltarlos.
        Object.values(fechas).forEach((f) => f.soltar && f.soltar());
      },
      preConfirm: () => {
        const v = leer(campos, fechas);
        const problema = revisar(campos, v) || (cfg.validar && cfg.validar(v));
        if (problema) { Swal.showValidationMessage(problema); return false; }
        return v;
      },
    });
    return r.isConfirmed ? r.value : null;
  }

  return { abrir };
})();
