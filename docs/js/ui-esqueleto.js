/* Esqueletos de carga — PinkPower
 *
 * Mientras los datos llegan, en vez de una pantalla en blanco se dibuja la
 * forma de lo que va a aparecer. Importa en este panel: leer un mes de ventas
 * de Shopify tarda varios segundos y hasta ahora solo había una línea de texto
 * diciendo "cargando", con el resto vacío.
 *
 * Los esqueletos son del mismo tipo que lo que reemplazan: si vienen seis
 * tarjetas de números, se dibujan seis; si viene una dona, un círculo. Un
 * rectángulo genérico no le dice nada a nadie.
 *
 * Script clásico, igual que el resto de los componentes. El brillo es el mismo
 * `.pp-sk` que ya usa PPTabla.
 *
 * Uso:
 *   PPEsqueleto.pintar(destino, 'kpis', { cuantos: 6 });
 *   PPEsqueleto.pintar(destino, 'dona');
 *   PPEsqueleto.pintar(destino, 'barras');
 *   PPEsqueleto.pintar(destino, 'lista', { filas: 6 });
 *   PPEsqueleto.pintar(destino, 'ficha');
 *   PPEsqueleto.quitar(destino);   // lo deja vacío para pintar lo de verdad
 */
window.PPEsqueleto = (function () {
  const sk = (ancho, alto) =>
    `<span class="pp-sk" style="width:${ancho}${alto ? `;height:${alto}` : ''}"></span>`;

  const FORMAS = {
    // Las tarjetas de números de arriba.
    kpis: (o) => `<div class="ppesq-kpis">${
      Array.from({ length: o.cuantos || 4 }, () => `
        <div class="ppesq-kpi">
          ${sk('52%', '9px')}
          ${sk('74%', '20px')}
          ${sk('62%', '8px')}
        </div>`).join('')}</div>`,

    // Una dona con su leyenda debajo.
    dona: () => `<div class="ppesq-dona">
        <span class="ppesq-circulo"></span>
        <div class="ppesq-leyenda">${
          Array.from({ length: 5 }, (_, i) => sk(`${64 - i * 6}px`, '8px')).join('')}</div>
      </div>`,

    // Barras de distinto alto, como salen las de verdad.
    barras: () => `<div class="ppesq-barras">${
      [58, 86, 44, 72, 95, 38, 64].map((h) =>
        `<span class="pp-sk" style="height:${h}%;width:100%"></span>`).join('')}</div>`,

    // Un listado de renglones con su monto a la derecha.
    lista: (o) => `<div class="ppesq-lista">${
      Array.from({ length: o.filas || 5 }, (_, i) => `
        <div class="ppesq-fila">
          ${sk(`${58 - (i % 3) * 9}%`)}
          ${sk('64px')}
        </div>`).join('')}</div>`,

    // La ficha de algo: un título, sus datos y una tabla.
    ficha: () => `<div class="ppesq-ficha">
        ${sk('42%', '18px')}
        ${sk('28%', '10px')}
        <div class="ppesq-datos">${
          Array.from({ length: 4 }, () => `<div>${sk('60%', '8px')}${sk('80%', '15px')}</div>`).join('')}</div>
      </div>`,
  };

  function pintar(destino, forma, opciones) {
    const el = typeof destino === 'string' ? document.getElementById(destino) : destino;
    if (!el) return;
    const hacer = FORMAS[forma] || FORMAS.lista;
    el.innerHTML = `<div class="ppesq" aria-hidden="true">${hacer(opciones || {})}</div>`;
    // Para quien usa lector de pantalla: el esqueleto no se lee, pero el
    // estado sí se anuncia.
    el.setAttribute('aria-busy', 'true');
  }

  function quitar(destino) {
    const el = typeof destino === 'string' ? document.getElementById(destino) : destino;
    if (!el) return;
    if (el.querySelector('.ppesq')) el.innerHTML = '';
    el.removeAttribute('aria-busy');
  }

  return { pintar, quitar };
})();
