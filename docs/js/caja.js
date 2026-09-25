// Caja de la tienda física. Pantalla de mostrador: se escanea o se busca, se
// cobra y el pedido queda registrado en Shopify (pagado y preparado).
//
// Decisiones que conviene conocer antes de tocar nada:
// - El catálogo se carga UNA vez al abrir y la búsqueda es local: escribir no
//   puede disparar llamadas al servidor o el lector de código se siente lento.
// - El foco vuelve SIEMPRE al buscador después de cada acción. Un lector USB
//   escribe como si fuera un teclado: si el foco está en otro lado, se pierde.
// - Nunca se reintenta una venta sola: se cobraría dos veces.
// - Los desplegables son propios (.pp-select), no <select> nativos: el nativo se
//   ve distinto en cada teléfono y rompe la línea del resto de la pantalla. Es el
//   mismo patrón del selector de orden de la tienda.

const API = 'https://api.pinkpowerhn.com';
const TOKEN_KEY = 'pinkpower_admin_token';
let token = localStorage.getItem(TOKEN_KEY);

const $ = (id) => document.getElementById(id);
const L = (n) => 'L. ' + (Number(n) || 0).toLocaleString('es-HN',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s) => (s || '').toString()
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Iconos (trazo, a juego con el resto del sitio).
const IC = {
  lupa: '<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"></path><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  mas: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  persona: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  efectivo: '<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle>',
  tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line>',
  transferencia: '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
  credito: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>',
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
};
const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const estado = {
  catalogo: [],
  porBarcode: new Map(),
  cargandoCatalogo: true,
  errorCatalogo: '',
  resultados: [],
  venta: [],            // líneas de la venta
  cliente: null,
  mayoreo: false,       // interruptor manual de precios de mayoreo
  descuento: { tipo: '', valor: 0 },
  descAbierto: false,   // desplegable propio del descuento
  pago: '',
  recibido: '',
  nota: '',
  cobrando: false,
  resultado: null,      // venta terminada
  error: '',
  buscandoCliente: false,
  resClientes: null,    // null = no se buscó; [] = sin resultados
};

// ── API ──────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    // La venta armada NO se pierde: queda en memoria y vuelve tras el login.
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    mostrarLogin();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    let detalle = 'Error';
    try {
      const d = (await res.json()).detail;
      detalle = typeof d === 'string' ? d : (d || detalle);
    } catch (_) {}
    const err = new Error(typeof detalle === 'string' ? detalle : 'Error');
    err.status = res.status;
    err.detalle = detalle;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ── Login ────────────────────────────────────────────────────────────────────
function mostrarLogin() {
  $('login-view').classList.remove('hidden');
  $('caja-view').classList.add('hidden');
  setTimeout(() => $('l-user').focus(), 60);
}

function mostrarCaja() {
  $('login-view').classList.add('hidden');
  $('caja-view').classList.remove('hidden');
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('login-msg');
  msg.classList.add('hidden');
  const btn = $('l-submit');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const res = await fetch(API + '/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: $('l-user').value.trim(), password: $('l-pass').value }),
    });
    if (!res.ok) throw new Error('Usuario o contraseña incorrectos');
    const data = await res.json();
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    $('l-pass').value = '';
    arrancar();
  } catch (err) {
    msg.textContent = err.message || 'No se pudo entrar';
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

// ── Catálogo ─────────────────────────────────────────────────────────────────
async function cargarCatalogo() {
  estado.cargandoCatalogo = true;
  estado.errorCatalogo = '';
  pintar();
  try {
    const data = await api('/admin/caja/catalogo');
    estado.catalogo = (data.variantes || []).map((v) => ({
      ...v,
      // Texto de búsqueda precalculado: buscar no puede recorrer y normalizar
      // 1500 filas en cada tecla.
      busca: norm([v.producto, v.marca, v.variante].filter(Boolean).join(' ')),
    }));
    estado.porBarcode = new Map();
    for (const v of estado.catalogo) {
      if (v.barcode) estado.porBarcode.set(v.barcode.trim(), v);
    }
  } catch (err) {
    estado.errorCatalogo = err.message || 'No se pudo cargar el catálogo';
  } finally {
    estado.cargandoCatalogo = false;
    pintar();
    enfocarBuscador();
  }
}

function buscarProductos(texto) {
  const q = norm(texto).trim();
  if (!q) return [];
  const palabras = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const v of estado.catalogo) {
    if (palabras.every((p) => v.busca.includes(p))) {
      out.push(v);
      if (out.length >= 20) break;
    }
  }
  // Los disponibles primero: lo normal es vender lo que hay.
  return out.sort((a, b) => (a.disponible === b.disponible) ? 0 : (a.disponible ? -1 : 1));
}

// ── Venta ────────────────────────────────────────────────────────────────────
function hayMayoreo() {
  return estado.mayoreo || !!(estado.cliente && estado.cliente.mayoreo);
}

function precioSegunModo(v) {
  if (hayMayoreo() && v.precio_mayoreo != null) return v.precio_mayoreo;
  return v.precio;
}

function agregar(v) {
  const existente = estado.venta.find((l) => l.variant_id === v.variant_id);
  if (existente) {
    existente.cantidad += 1;
  } else {
    estado.venta.push({
      variant_id: v.variant_id,
      nombre: v.producto,
      variante: v.variante,
      marca: v.marca,
      imagen: v.imagen,
      precioTienda: v.precio,
      precioMayoreo: v.precio_mayoreo,
      precio: precioSegunModo(v),
      cantidad: 1,
      especial: false,
      manual: false,
    });
  }
  estado.error = '';
  pintar();
  enfocarBuscador();
}

function quitar(i) { estado.venta.splice(i, 1); pintar(); enfocarBuscador(); }

function cambiarCantidad(i, delta) {
  const l = estado.venta[i];
  l.cantidad += delta;
  if (l.cantidad < 1) estado.venta.splice(i, 1);
  pintar();
  enfocarBuscador();
}

// Cuando cambia el modo mayoreo, se recalculan los precios que la cajera NO
// tocó a mano (los especiales se respetan: los escribió ella a propósito).
function recalcularPrecios() {
  const mayoreo = hayMayoreo();
  for (const l of estado.venta) {
    if (l.especial || l.manual) continue;
    l.precio = (mayoreo && l.precioMayoreo != null) ? l.precioMayoreo : l.precioTienda;
  }
}

function subtotal() {
  return estado.venta.reduce((s, l) => s + (Number(l.precio) || 0) * l.cantidad, 0);
}

function montoDescuento() {
  const { tipo, valor } = estado.descuento;
  const v = Number(valor) || 0;
  if (!tipo || v <= 0) return 0;
  if (tipo === 'porcentaje') return Math.min(subtotal(), subtotal() * Math.min(v, 100) / 100);
  return Math.min(subtotal(), v);
}

function total() { return Math.max(0, subtotal() - montoDescuento()); }

function cambio() {
  const rec = Number(estado.recibido) || 0;
  return Math.max(0, rec - total());
}

function nuevaVenta() {
  estado.venta = [];
  estado.cliente = null;
  estado.mayoreo = false;
  estado.descuento = { tipo: '', valor: 0 };
  estado.descAbierto = false;
  estado.pago = '';
  estado.recibido = '';
  estado.nota = '';
  estado.resultado = null;
  estado.error = '';
  estado.resultados = [];
  estado.resClientes = null;
  pintar();
  enfocarBuscador();
}

// ── Cobro ────────────────────────────────────────────────────────────────────
async function cobrar() {
  if (estado.cobrando || !estado.venta.length || !estado.pago) return;
  estado.cobrando = true;
  estado.error = '';
  pintar();
  const cuerpo = {
    items: estado.venta.filter((l) => !l.manual).map((l) => ({
      variant_id: l.variant_id, cantidad: l.cantidad, precio: l.precio,
    })),
    personalizados: estado.venta.filter((l) => l.manual).map((l) => ({
      titulo: l.nombre, precio: l.precio, cantidad: l.cantidad,
    })),
    cliente_id: estado.cliente ? estado.cliente.id : '',
    mayoreo: hayMayoreo(),
    pago: estado.pago,
    nota: estado.nota || '',
  };
  if (estado.descuento.tipo && Number(estado.descuento.valor) > 0) {
    cuerpo.descuento = { tipo: estado.descuento.tipo, valor: Number(estado.descuento.valor) };
  }
  try {
    const r = await api('/admin/caja/venta', { method: 'POST', body: JSON.stringify(cuerpo) });
    estado.resultado = { ...r, cambio: estado.pago === 'efectivo' ? cambio() : 0 };
  } catch (err) {
    if (err.status === 409 && err.detalle && err.detalle.agotados) {
      const lista = err.detalle.agotados
        .map((a) => `${a.title} (quedan ${a.disponible})`).join(', ');
      estado.error = 'Se agotaron: ' + lista + '. Corregí la venta e intentá de nuevo.';
    } else if (err.message === 'Failed to fetch') {
      estado.error = 'Sin conexión: no se pudo cobrar. La venta sigue armada, intentá de nuevo.';
    } else if (err.message !== 'Sesión expirada') {
      estado.error = err.message || 'No se pudo cobrar';
    }
  } finally {
    estado.cobrando = false;
    pintar();
  }
}

// ── Clientas ─────────────────────────────────────────────────────────────────
let temporizadorCliente = null;
function buscarClientas(texto) {
  clearTimeout(temporizadorCliente);
  const q = (texto || '').trim();
  if (q.length < 2) { estado.resClientes = null; pintar(); return; }
  estado.buscandoCliente = true;
  pintar();
  temporizadorCliente = setTimeout(async () => {
    try {
      const r = await api('/admin/caja/clientes?q=' + encodeURIComponent(q));
      estado.resClientes = r.clientes || [];
    } catch (_) {
      estado.resClientes = [];
    } finally {
      estado.buscandoCliente = false;
      pintar();
    }
  }, 300);
}

function elegirCliente(c) {
  estado.cliente = c;
  estado.resClientes = null;
  recalcularPrecios();
  pintar();
  enfocarBuscador();
}

async function crearClienta(datos, boton) {
  boton.disabled = true; boton.textContent = 'Creando…';
  try {
    const c = await api('/admin/caja/clientes', { method: 'POST', body: JSON.stringify(datos) });
    elegirCliente(c);
  } catch (err) {
    estado.error = err.message || 'No se pudo crear la clienta';
    pintar();
  }
}

// ── Pintado ──────────────────────────────────────────────────────────────────
function enfocarBuscador() {
  const i = $('q');
  if (i && !estado.resultado) setTimeout(() => i.focus({ preventScroll: true }), 30);
}

function pintar() {
  const main = $('caja-main');
  if (!main) return;

  if (estado.resultado) { main.innerHTML = vistaExito(); main.classList.add('caja--exito'); return; }
  main.classList.remove('caja--exito');

  const valorQ = $('q') ? $('q').value : '';
  const valorCli = $('q-cliente') ? $('q-cliente').value : '';
  const activo = document.activeElement ? document.activeElement.id : '';

  main.innerHTML = `
    <section class="col-izq">
      ${bloqueBuscador(valorQ)}
      <div id="resultados">${bloqueResultados()}</div>
      ${bloqueLineas()}
    </section>
    <aside class="col-der">
      ${bloqueCliente(valorCli)}
      ${bloqueResumen()}
    </aside>
    ${barraMovil()}
  `;

  // El foco se devuelve donde estaba: repintar no puede sacar a la cajera del
  // campo en el que estaba escribiendo.
  if (activo === 'q-cliente' && $('q-cliente')) {
    const i = $('q-cliente'); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
  } else if (activo === 'q' || !activo || activo === 'body') {
    const i = $('q');
    if (i && !estado.cargandoCatalogo) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
}

// Esqueletos mientras llega el catálogo: la pantalla se arma igual que cuando
// hay datos, así no da el salto de "cargando" a la parrilla llena.
function esqueletos(n = 6) {
  return `
    <div class="buscador">
      <div class="sk sk-buscador"></div>
      <div class="sk sk-boton"></div>
    </div>
    <div class="tarjeta">
      ${Array.from({ length: n }, () => `
        <div class="sk-fila">
          <div class="sk sk-img"></div>
          <div class="sk-txt"><div class="sk sk-l1"></div><div class="sk sk-l2"></div></div>
          <div class="sk sk-pre"></div>
        </div>`).join('')}
    </div>`;
}

function bloqueBuscador(valor) {
  if (estado.cargandoCatalogo) return esqueletos();
  if (estado.errorCatalogo) {
    return `<div class="tarjeta"><div class="tarjeta__cuerpo">
      <div class="aviso-caja aviso-caja--roja">${esc(estado.errorCatalogo)}</div>
      <button class="btn btn--pink btn--ancho" data-accion="recargar" style="margin-top:0.8rem">
        Reintentar</button></div></div>`;
  }
  return `
    <div class="buscador">
      <div class="campo-ic">
        ${svg(IC.lupa, 1.9)}
        <input id="q" value="${esc(valor)}" placeholder="Escaneá o buscá el producto…"
               autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" />
        <button class="limpiar" data-accion="limpiar-q" type="button" aria-label="Limpiar"
                ${valor ? '' : 'hidden'}>&times;</button>
      </div>
      <button class="btn" data-accion="manual" type="button" title="Producto manual"
              aria-label="Agregar producto manual">${svg(IC.mas)}</button>
    </div>
    <div class="listo-escaner" id="listo-escaner"><i></i> Listo para escanear</div>`;
}

function bloqueResultados() {
  if (!estado.resultados.length) return '';
  return `<div class="resultados">${estado.resultados.map((v, i) => `
    <button class="res ${v.disponible ? '' : 'res--agotado'}" data-res="${i}" type="button">
      ${v.imagen ? `<img src="${esc(v.imagen)}" alt="" loading="lazy" />` : '<img alt="" />'}
      <span class="res__txt">
        <span class="res__nom">${esc(v.producto)}${v.variante ? ' · ' + esc(v.variante) : ''}</span>
        <span class="res__meta">${esc(v.marca || 'Sin marca')}
          ${v.existencia != null ? ' · ' + v.existencia + ' en existencia' : ''}
          ${v.disponible ? '' : '<span class="res__tag">agotado</span>'}</span>
      </span>
      <span class="res__pre">${L(precioSegunModo(v))}</span>
    </button>`).join('')}</div>`;
}

function bloqueLineas() {
  if (estado.cargandoCatalogo) return '';   // los esqueletos ya ocupan ese lugar
  if (!estado.venta.length) {
    return `<div class="tarjeta"><div class="vacio">
      Todavía no hay productos en esta venta.<br />
      Escaneá el código de barras o escribí el nombre.</div></div>`;
  }
  return `<div class="tarjeta">
    <div class="tarjeta__cab">
      <span>${estado.venta.length} producto${estado.venta.length !== 1 ? 's' : ''}</span>
      ${hayMayoreo() ? '<span class="chip chip--may">Precios de mayoreo</span>' : ''}
    </div>
    ${estado.venta.map((l, i) => `
      <div class="li ${l.especial ? 'li--especial' : ''}">
        <div class="li__top">
          <div class="li__nom">${esc(l.nombre)}${l.variante ? ` <span class="li__meta">· ${esc(l.variante)}</span>` : ''}
            ${l.manual ? ' <span class="chip">manual</span>' : ''}
            ${l.especial ? ' <span class="chip">precio especial</span>' : ''}
          </div>
          <button class="li__x" data-quitar="${i}" type="button" aria-label="Quitar">&times;</button>
        </div>
        <div class="li__bot">
          <div class="cant">
            <button data-menos="${i}" type="button" aria-label="Menos">−</button>
            <span>${l.cantidad}</span>
            <button data-mas="${i}" type="button" aria-label="Más">+</button>
          </div>
          <div class="li__precio">
            <input type="number" inputmode="decimal" step="0.01" min="0"
                   value="${Number(l.precio).toFixed(2)}" data-precio="${i}"
                   aria-label="Precio unitario" />
          </div>
          <div class="li__sub">${L(l.precio * l.cantidad)}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

function bloqueCliente(valorCli) {
  if (estado.cliente) {
    return `<div class="tarjeta">
      <div class="tarjeta__cab">Clienta</div>
      <div class="tarjeta__cuerpo">
        <div class="cliente-sel">
          <span class="cliente-sel__n">${esc(estado.cliente.nombre)}
            ${estado.cliente.mayoreo ? '<span class="chip chip--may">Mayorista</span>' : ''}</span>
          <button class="li__x" data-accion="quitar-cliente" type="button" aria-label="Quitar">&times;</button>
        </div>
        ${estado.cliente.telefono ? `<div class="res__meta">${esc(estado.cliente.telefono)}</div>` : ''}
        ${interruptorMayoreo()}
      </div>
    </div>`;
  }
  let lista = '';
  if (estado.buscandoCliente) {
    lista = '<div class="vacio"><span class="puntos">Buscando</span></div>';
  } else if (estado.resClientes && estado.resClientes.length) {
    lista = `<div class="resultados" style="margin:0.8rem 0 0">${estado.resClientes.map((c, i) => `
      <button class="res" data-cli="${i}" type="button">
        <span class="res__txt">
          <span class="res__nom">${esc(c.nombre)}</span>
          <span class="res__meta">${esc(c.telefono || 'sin teléfono')}</span>
        </span>
        ${c.mayoreo ? '<span class="chip chip--may">Mayorista</span>' : ''}
      </button>`).join('')}</div>`;
  } else if (estado.resClientes) {
    lista = `<div class="vacio" style="padding:1rem 0 0.8rem">No encontramos esta clienta.</div>
      <button class="btn btn--ancho" data-accion="crear-cliente" type="button">Crear clienta</button>`;
  }
  return `<div class="tarjeta">
    <div class="tarjeta__cab">Clienta <span style="text-transform:none; letter-spacing:0; font-weight:500">(opcional)</span></div>
    <div class="tarjeta__cuerpo">
      <div class="campo-ic">
        ${svg(IC.persona, 1.9)}
        <input id="q-cliente" value="${esc(valorCli)}" placeholder="Nombre o teléfono"
               autocomplete="off" />
      </div>
      ${lista}
      ${interruptorMayoreo()}
    </div>
  </div>`;
}

function interruptorMayoreo() {
  const forzado = !!(estado.cliente && estado.cliente.mayoreo);
  return `<label class="switch">
    <input type="checkbox" data-accion="switch-mayoreo" ${hayMayoreo() ? 'checked' : ''}
           ${forzado ? 'disabled' : ''} />
    Esta venta es de mayoreo
  </label>`;
}

const OPCIONES_DESC = [
  { v: '', t: 'Sin descuento' },
  { v: 'porcentaje', t: 'Descuento por %' },
  { v: 'monto', t: 'Descuento en L.' },
];

function bloqueResumen() {
  const desc = montoDescuento();
  const pagos = [['efectivo', 'Efectivo', IC.efectivo], ['tarjeta', 'Tarjeta', IC.tarjeta],
                 ['transferencia', 'Transferencia', IC.transferencia], ['credito', 'Crédito', IC.credito]];
  const opcActual = OPCIONES_DESC.find((o) => o.v === estado.descuento.tipo) || OPCIONES_DESC[0];
  return `<div class="tarjeta">
    <div class="tarjeta__cab">Cobro</div>
    <div class="tarjeta__cuerpo">
      <div class="total-fila"><span>Subtotal</span><span>${L(subtotal())}</span></div>
      ${desc > 0 ? `<div class="total-fila"><span>Descuento</span><span>− ${L(desc)}</span></div>` : ''}
      <div class="total-grande"><span>Total</span><b>${L(total())}</b></div>

      <div style="display:flex; gap:0.6rem; margin-top:1rem; align-items:flex-start;">
        <div class="pp-select" style="flex:1.3">
          <button class="pp-select__btn" type="button" data-select="desc"
                  aria-haspopup="listbox" aria-expanded="${estado.descAbierto}">
            <span class="pp-select__lb">${opcActual.t}</span>
            <svg class="pp-select__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="pp-select__menu" role="listbox" ${estado.descAbierto ? '' : 'hidden'}>
            ${OPCIONES_DESC.map((o) => `<button class="pp-select__opt ${o.v === estado.descuento.tipo ? 'is-active' : ''}"
              type="button" role="option" data-desc-tipo="${o.v}">${o.t}</button>`).join('')}
          </div>
        </div>
        <input type="number" inputmode="decimal" min="0" step="0.01" style="flex:1; min-height:50px"
               value="${estado.descuento.valor || ''}" data-desc-valor placeholder="0"
               aria-label="Valor del descuento" ${estado.descuento.tipo ? '' : 'disabled'} />
      </div>

      <div class="pagos">
        ${pagos.map(([v, t, ic]) => `<button class="pago-btn" data-pago="${v}" type="button"
          aria-pressed="${estado.pago === v}">${svg(ic, 1.8)}<span>${t}</span></button>`).join('')}
      </div>

      ${estado.pago === 'efectivo' ? `
        <div class="campo" style="margin-top:0.9rem; margin-bottom:0">
          <label for="recibido">Recibí</label>
          <input id="recibido" type="number" inputmode="decimal" min="0" step="0.01"
                 value="${estado.recibido}" data-recibido placeholder="0.00" />
        </div>
        ${Number(estado.recibido) > 0 ? `<div class="cambio"><span>Cambio</span><b>${L(cambio())}</b></div>` : ''}
      ` : ''}
      ${estado.pago === 'credito' ? '<div class="aviso-caja aviso-caja--amarilla">Queda pendiente de pago.</div>' : ''}
      ${estado.error ? `<div class="aviso-caja aviso-caja--roja">${esc(estado.error)}</div>` : ''}

      <button class="btn btn--pink btn--ancho btn--cobrar solo-escritorio" data-accion="cobrar"
        style="margin-top:1rem" ${(!estado.venta.length || !estado.pago || estado.cobrando) ? 'disabled' : ''}>
        ${estado.cobrando ? 'Cobrando…' : 'Cobrar ' + L(total())}
      </button>
    </div>
  </div>`;
}

function barraMovil() {
  return `<div class="barra">
    <div class="barra__tot"><span>Total</span><b>${L(total())}</b></div>
    <button class="btn btn--pink btn--ancho btn--cobrar" data-accion="cobrar"
      ${(!estado.venta.length || !estado.pago || estado.cobrando) ? 'disabled' : ''}>
      ${estado.cobrando ? 'Cobrando…' : (estado.pago ? 'Cobrar' : 'Elegí la forma de pago')}
    </button>
  </div>`;
}

function vistaExito() {
  const r = estado.resultado;
  return `<div class="tarjeta exito">
    <div class="exito__check">${svg(IC.check, 2.6)}</div>
    <h2>${r.pagado ? 'Venta cobrada' : 'Venta registrada'}</h2>
    <p class="pedido">Pedido ${esc(r.name || '')}</p>
    <p class="monto">${L(r.total)}</p>
    ${r.cambio > 0 ? `<div class="cambio"><span>Cambio</span><b>${L(r.cambio)}</b></div>` : ''}
    ${!r.pagado ? '<div class="aviso-caja aviso-caja--amarilla">Queda pendiente de pago (crédito).</div>' : ''}
    ${r.aviso ? `<div class="aviso-caja aviso-caja--amarilla">${esc(r.aviso)}</div>` : ''}
    <button class="btn btn--pink btn--ancho btn--cobrar" data-accion="nueva" style="margin-top:1.3rem">
      Nueva venta</button>
  </div>`;
}

// ── Eventos ──────────────────────────────────────────────────────────────────
$('caja-main').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') {
    // El escaneo NO se maneja acá: lo atiende el detector de teclado de abajo,
    // que funciona igual con o sin foco. Acá solo se busca por texto.
    //
    // Se repinta SOLO la lista de resultados. Repintar toda la pantalla en cada
    // tecla destruía y recreaba el propio campo, que es justo donde el lector
    // está escribiendo: se perdían caracteres de la lectura.
    estado.resultados = buscarProductos(t.value.trim());
    const cont = $('resultados');
    if (cont) cont.innerHTML = bloqueResultados();
    const limpiar = document.querySelector('[data-accion="limpiar-q"]');
    if (limpiar) limpiar.hidden = !t.value;
    return;
  }
  if (t.id === 'q-cliente') { buscarClientas(t.value); return; }
  if (t.dataset.precio !== undefined) {
    const l = estado.venta[Number(t.dataset.precio)];
    const v = Number(t.value);
    if (l && v >= 0) {
      l.precio = v;
      l.especial = !l.manual && Math.abs(v - l.precioTienda) > 0.001
        && !(l.precioMayoreo != null && Math.abs(v - l.precioMayoreo) < 0.001);
      // Repintar en cada tecla sacaría el foco del campo: solo se actualiza el total.
      const barra = document.querySelector('.barra__tot b');
      if (barra) barra.textContent = L(total());
      const sub = t.closest('.li').querySelector('.li__sub');
      if (sub) sub.textContent = L(l.precio * l.cantidad);
    }
    return;
  }
  if (t.dataset.recibido !== undefined) {
    estado.recibido = t.value;
    const c = document.querySelector('.cambio b');
    if (c) c.textContent = L(cambio());
    else pintar();
    return;
  }
  if (t.dataset.descValor !== undefined) {
    estado.descuento.valor = t.value;
    const tot = document.querySelector('.total-grande b');
    const barra = document.querySelector('.barra__tot b');
    if (tot) tot.textContent = L(total());
    if (barra) barra.textContent = L(total());
  }
});

$('caja-main').addEventListener('change', (e) => {
  if (e.target.dataset.accion === 'switch-mayoreo') {
    estado.mayoreo = e.target.checked;
    recalcularPrecios();
    pintar();
    enfocarBuscador();
  }
});

$('caja-main').addEventListener('keydown', (e) => {
  // Enter escrito a mano (el del lector ya lo consumió el detector de abajo).
  if (e.target.id === 'q' && e.key === 'Enter') {
    e.preventDefault();
    const texto = e.target.value.trim();
    const porCodigo = estado.porBarcode.get(texto);
    if (porCodigo) { e.target.value = ''; estado.resultados = []; agregar(porCodigo); return; }
    if (estado.resultados.length >= 1) {
      const v = estado.resultados[0];
      e.target.value = '';
      estado.resultados = [];
      agregar(v);
    }
  }
  if (e.key === 'Escape') {
    estado.resultados = [];
    estado.resClientes = null;
    estado.descAbierto = false;
    pintar();
    enfocarBuscador();
  }
});

$('caja-main').addEventListener('click', (e) => {
  const btn = e.target.closest('button');

  // Desplegable propio: clic afuera lo cierra.
  if (estado.descAbierto && !e.target.closest('.pp-select')) {
    estado.descAbierto = false;
    pintar();
  }
  if (!btn) return;
  const d = btn.dataset;

  if (d.select === 'desc') { estado.descAbierto = !estado.descAbierto; pintar(); return; }
  if (d.descTipo !== undefined) {
    estado.descuento.tipo = d.descTipo;
    if (!d.descTipo) estado.descuento.valor = 0;
    estado.descAbierto = false;
    pintar();
    return;
  }
  if (d.res !== undefined) {
    const v = estado.resultados[Number(d.res)];
    const q = $('q'); if (q) q.value = '';
    estado.resultados = [];
    agregar(v);
    return;
  }
  if (d.cli !== undefined) { elegirCliente(estado.resClientes[Number(d.cli)]); return; }
  if (d.quitar !== undefined) { quitar(Number(d.quitar)); return; }
  if (d.mas !== undefined) { cambiarCantidad(Number(d.mas), 1); return; }
  if (d.menos !== undefined) { cambiarCantidad(Number(d.menos), -1); return; }
  if (d.pago !== undefined) {
    estado.pago = estado.pago === d.pago ? '' : d.pago;
    pintar();
    return;
  }

  switch (d.accion) {
    case 'limpiar-q': {
      const q = $('q'); if (q) q.value = '';
      estado.resultados = []; pintar(); enfocarBuscador(); break;
    }
    case 'recargar': cargarCatalogo(); break;
    case 'quitar-cliente':
      estado.cliente = null; recalcularPrecios(); pintar(); enfocarBuscador(); break;
    case 'cobrar': cobrar(); break;
    case 'nueva': nuevaVenta(); break;
    case 'manual': pedirManual(); break;
    case 'crear-cliente': pedirClienta(); break;
  }
});

$('btn-nueva').addEventListener('click', () => {
  if (!estado.venta.length || estado.resultado || confirm('¿Borrar esta venta y empezar otra?')) {
    nuevaVenta();
  }
});

// ── Modales ──────────────────────────────────────────────────────────────────
function modal({ titulo, sub = '', cuerpo, ok = 'Guardar' }) {
  const el = document.createElement('div');
  el.className = 'modal-fondo';
  el.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal__agarre"></div>
      <div class="modal__cab">
        <div style="flex:1">
          <h2>${esc(titulo)}</h2>
          ${sub ? `<p>${esc(sub)}</p>` : ''}
        </div>
        <button class="modal__x" data-x type="button" aria-label="Cerrar">&times;</button>
      </div>
      ${cuerpo}
      <div class="modal__pie">
        <button class="btn" data-x type="button">Cancelar</button>
        <button class="btn btn--pink" data-ok type="button">${esc(ok)}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const cerrar = () => { el.remove(); document.removeEventListener('keydown', porTecla); enfocarBuscador(); };
  const porTecla = (ev) => { if (ev.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', porTecla);
  el.addEventListener('click', (ev) => {
    if (ev.target === el || ev.target.closest('[data-x]')) cerrar();
  });
  return { el, cerrar };
}

function pedirManual() {
  const { el, cerrar } = modal({
    titulo: 'Producto manual',
    sub: 'Para algo que no está en el catálogo.',
    ok: 'Agregar',
    cuerpo: `
      <div class="campo"><label for="m-desc">Descripción</label>
        <input id="m-desc" placeholder="Bolsa de regalo" /></div>
      <div style="display:flex; gap:0.7rem">
        <div class="campo" style="flex:1.4"><label for="m-precio">Precio</label>
          <input id="m-precio" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" /></div>
        <div class="campo" style="flex:1"><label for="m-cant">Cantidad</label>
          <input id="m-cant" type="number" inputmode="numeric" min="1" value="1" /></div>
      </div>`,
  });
  el.querySelector('[data-ok]').addEventListener('click', () => {
    const desc = el.querySelector('#m-desc').value.trim();
    const precio = Number(el.querySelector('#m-precio').value);
    const cant = Math.max(1, Number(el.querySelector('#m-cant').value) || 1);
    if (!desc || !(precio >= 0)) { el.querySelector('#m-desc').focus(); return; }
    estado.venta.push({
      variant_id: null, nombre: desc, variante: '', marca: '', imagen: '',
      precioTienda: precio, precioMayoreo: null, precio, cantidad: cant,
      especial: false, manual: true,
    });
    cerrar(); pintar(); enfocarBuscador();
  });
  setTimeout(() => el.querySelector('#m-desc').focus(), 80);
}

function pedirClienta() {
  const inicial = $('q-cliente') ? $('q-cliente').value.trim() : '';
  const soloDigitos = /^[\d\s+-]+$/.test(inicial);
  const { el, cerrar } = modal({
    titulo: 'Clienta nueva',
    sub: 'Queda guardada en Shopify para la próxima compra.',
    ok: 'Crear',
    cuerpo: `
      <div style="display:flex; gap:0.7rem">
        <div class="campo" style="flex:1"><label for="c-nom">Nombre</label>
          <input id="c-nom" value="${soloDigitos ? '' : esc(inicial)}" /></div>
        <div class="campo" style="flex:1"><label for="c-ape">Apellido</label>
          <input id="c-ape" /></div>
      </div>
      <div class="campo"><label for="c-tel">Teléfono</label>
        <input id="c-tel" type="tel" inputmode="tel" placeholder="9999-9999"
               value="${soloDigitos ? esc(inicial) : ''}" /></div>
      <label class="switch"><input type="checkbox" id="c-may" /> Es mayorista</label>`,
  });
  el.querySelector('[data-ok]').addEventListener('click', async (ev) => {
    const nombre = el.querySelector('#c-nom').value.trim();
    if (!nombre) { el.querySelector('#c-nom').focus(); return; }
    await crearClienta({
      nombre,
      apellido: el.querySelector('#c-ape').value.trim(),
      telefono: el.querySelector('#c-tel').value.trim(),
      mayoreo: el.querySelector('#c-may').checked,
    }, ev.target);
    cerrar();
  });
  setTimeout(() => el.querySelector(soloDigitos ? '#c-tel' : '#c-nom').focus(), 80);
}

// ── Escáner ──────────────────────────────────────────────────────────────────
// Un lector de código de barras (USB o Bluetooth) escribe como si fuera un
// teclado: manda los dígitos y casi siempre un Enter al final. El problema de
// mostrador es que el foco se pierde en cuanto se toca cualquier otra cosa, y
// entonces el escaneo se va a la nada.
//
// Por eso NO dependemos del foco: se escucha el teclado en toda la página y se
// distingue al lector por el RITMO — un lector manda las teclas cada pocos
// milisegundos, una persona no baja de ~80 ms. Si el ritmo es de lector, el
// código se procesa aunque el buscador no tenga el foco.
//
// En teléfono esto es además lo cómodo: sin foco no sale el teclado virtual
// tapando media pantalla, y el lector Bluetooth funciona igual.
const RITMO_LECTOR = 45;    // ms máximos entre teclas para considerarlo lector
const LARGO_MINIMO = 5;     // menos de esto no es un código de barras
let bufer = '';
let ultimaTecla = 0;
let cierreBufer = null;

function hayModalAbierto() { return !!document.querySelector('.modal-fondo'); }

function esCampoDeTexto(el) {
  if (!el) return false;
  const t = (el.tagName || '').toLowerCase();
  return t === 'input' || t === 'textarea' || el.isContentEditable;
}

function flash(texto, tipo = '') {
  let el = document.getElementById('flash-caja');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash-caja';
    document.body.appendChild(el);
  }
  el.className = 'flash' + (tipo ? ' flash--' + tipo : '');
  el.textContent = texto;
  requestAnimationFrame(() => el.classList.add('is-show'));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-show'), 2200);
}

function procesarEscaneo(codigo) {
  const limpio = (codigo || '').trim();
  if (!limpio) return;
  // El código pudo escribirse dentro del buscador (si tenía el foco): se limpia
  // para que la próxima lectura empiece en blanco.
  const q = $('q');
  if (q) q.value = '';
  estado.resultados = [];

  const v = estado.porBarcode.get(limpio);
  if (v) {
    agregar(v);
    flash(v.producto, 'ok');
    return;
  }
  // No todas las presentaciones tienen el código cargado todavía: en vez de no
  // hacer nada, se deja el código en el buscador y se avisa.
  if (q) { q.value = limpio; estado.resultados = buscarProductos(limpio); }
  pintar();
  flash('Ese código no está en el catálogo', 'mal');
}

// Se escucha en fase de CAPTURA para llegar antes que el manejador del buscador:
// así una lectura no se procesa dos veces (una por el lector y otra por el Enter
// del campo).
document.addEventListener('keydown', (e) => {
  if (estado.cargandoCatalogo || estado.resultado || hayModalAbierto()) return;

  const activo = document.activeElement;
  // Si la cajera está escribiendo a mano en OTRO campo (precio, recibí, clienta),
  // no le robamos las teclas.
  if (esCampoDeTexto(activo) && activo.id !== 'q') return;

  const ahora = Date.now();

  if (e.key === 'Enter') {
    // Solo se toma como lectura si las teclas vinieron al ritmo del lector.
    if (bufer.length >= LARGO_MINIMO) {
      e.preventDefault();
      e.stopPropagation();
      const codigo = bufer;
      bufer = '';
      procesarEscaneo(codigo);
      return;
    }
    bufer = '';
    return;
  }
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

  // Pausa larga = tecleo humano: el búfer arranca de nuevo.
  if (ahora - ultimaTecla > RITMO_LECTOR) bufer = '';
  bufer += e.key;
  ultimaTecla = ahora;

  // Lectores que no mandan Enter: se cierra el código al quedarse quieto.
  clearTimeout(cierreBufer);
  cierreBufer = setTimeout(() => {
    if (bufer.length >= LARGO_MINIMO) {
      const codigo = bufer;
      bufer = '';
      procesarEscaneo(codigo);
    }
    bufer = '';
  }, 140);
}, true);

// En computadora, el foco vuelve solo al buscador cuando se toca una zona vacía:
// así el lector nunca queda "desconectado". En pantallas táctiles no se fuerza,
// porque abriría el teclado virtual encima de la venta.
const esTactil = window.matchMedia('(hover: none)').matches;
document.addEventListener('click', (e) => {
  if (esTactil || estado.resultado || hayModalAbierto()) return;
  if (esCampoDeTexto(e.target) || e.target.closest('button, a, label')) return;
  enfocarBuscador();
});

// ── Arranque ─────────────────────────────────────────────────────────────────
function arrancar() {
  mostrarCaja();
  pintar();
  cargarCatalogo();
}

if (token) arrancar(); else mostrarLogin();
