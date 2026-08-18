// ── Generador de catálogo en PDF (jsPDF) ──────────────────────────────────
// Compartido por el catálogo público (/c/) y el armador (/mi-catalogo/). Genera
// el PDF con jsPDF y lo descarga como archivo, SIN abrir otra pestaña ni el
// diálogo de impresión. Expone: window.PPCatalogoPDF(cat) -> Promise.
(function () {
  'use strict';

  let _jspdfPromise = null;
  function cargarJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (!_jspdfPromise) _jspdfPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/vendor/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return _jspdfPromise;
  }

  function hexRgb(hex) {
    const h = String(hex || '').replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(n || '000000', 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function cargarImg(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }

  // Imagen COMPLETA (sin recortar), reescalada. Devuelve { data, w, h }. Se usa
  // para el logo (se dibuja respetando su proporción).
  async function imagenData(url, maxPx) {
    const resp = await fetch(url, { mode: 'cors' });
    const blob = await resp.blob();
    const obj = URL.createObjectURL(blob);
    try {
      const img = await cargarImg(obj);
      const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
      const scale = Math.min(1, maxPx / Math.max(iw, ih));
      const cw = Math.max(1, Math.round(iw * scale)), ch = Math.max(1, Math.round(ih * scale));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      return { data: cv.toDataURL('image/jpeg', 0.85), w: cw, h: ch };
    } finally { URL.revokeObjectURL(obj); }
  }

  // Foto recortada tipo "cover" (llena un cuadrado, como el header de la tarjeta).
  async function imagenCover(url, size) {
    const resp = await fetch(url, { mode: 'cors' });
    const blob = await resp.blob();
    const obj = URL.createObjectURL(blob);
    try {
      const img = await cargarImg(obj);
      const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
      const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
      const scale = Math.max(size / iw, size / ih);   // cover
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
      return cv.toDataURL('image/jpeg', 0.85);
    } finally { URL.revokeObjectURL(obj); }
  }

  function nombrePdf(titulo) {
    const base = String(titulo || 'catalogo').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'catalogo';
    return base + '.pdf';
  }

  // Agrupa por colección preservando orden; los sin colección van al final.
  function agrupar(items) {
    const grupos = [];
    const idx = new Map();
    items.forEach(it => {
      const key = it.coleccion || '__sin__';
      if (!idx.has(key)) { idx.set(key, grupos.length); grupos.push({ key, titulo: it.coleccion || '', items: [] }); }
      grupos[idx.get(key)].items.push(it);
    });
    const i = grupos.findIndex(g => g.key === '__sin__');
    if (i !== -1 && i !== grupos.length - 1) grupos.push(grupos.splice(i, 1)[0]);
    return grupos;
  }

  // Construye el PDF (portada + secciones + grilla de 3 columnas) y lo descarga.
  async function construirPdf(cat) {
    await cargarJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 10, contentW = PW - 2 * M;
    const op = cat.opciones || {};
    const [ar, ag, ab] = hexRgb(op.colorAcento || '#e8437a');
    const [fr, fg, fb] = hexRgb(cat.colorFondo || '#fff0f5');
    const [tr, tg, tb] = hexRgb(cat.colorTexto || '#3a0a1e');
    const items = Array.isArray(cat.items) ? cat.items : [];

    const cols = 3, gap = 5;
    const cardW = (contentW - gap * (cols - 1)) / cols;
    // La foto es el HEADER de la tarjeta: ocupa todo el ancho (cuadrado), como en
    // la web. Debajo va el texto con más aire.
    const imgH = cardW, bodyH = 19, cardH = imgH + bodyH, rowGap = gap, radio = 2.4;

    // Precargar las fotos recortadas (cover) en paralelo.
    const imgPx = 560, imgCache = {};
    await Promise.all([...new Set(items.map(i => i.imagen).filter(Boolean))].map(async u => {
      try { imgCache[u] = await imagenCover(u, imgPx); } catch (_) {}
    }));

    const pintarFondo = () => { doc.setFillColor(fr, fg, fb); doc.rect(0, 0, PW, PH, 'F'); };
    const nuevaPagina = () => { doc.addPage(); pintarFondo(); return M; };

    pintarFondo();
    let y = M;

    // Portada. Logo rasterizado y dibujado respetando su proporción (sin estirarlo).
    if (op.logo) {
      let L = null;
      try { L = await imagenData(op.logo, 400); } catch (_) {}
      if (L) {
        const box = 16, s = Math.min(box / L.w, box / L.h);
        const lw = L.w * s, lh = L.h * s;
        try { doc.addImage(L.data, 'JPEG', (PW - lw) / 2, y, lw, lh); } catch (_) {}
        y += lh + 3;
      }
    }
    doc.setTextColor(tr, tg, tb); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
    const tLines = doc.splitTextToSize(cat.titulo || 'Catálogo', contentW);
    doc.text(tLines, PW / 2, y + 4, { align: 'center' }); y += 4 + tLines.length * 6.5;
    if (cat.subtitulo) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(120, 120, 120);
      const sLines = doc.splitTextToSize(cat.subtitulo, contentW * 0.85);
      doc.text(sLines, PW / 2, y, { align: 'center' }); y += sLines.length * 5;
    }
    doc.setDrawColor(ar, ag, ab); doc.setLineWidth(0.8);
    doc.line(PW / 2 - 12, y + 2, PW / 2 + 12, y + 2); y += 7;

    const separar = op.separarPorColeccion !== false && items.some(i => i.coleccion);
    const porNombre = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    const grupos = separar
      ? agrupar(items).map(g => ({ titulo: g.titulo || 'Otros productos', items: g.items.slice().sort(porNombre) }))
      : [{ titulo: '', items: items.slice().sort(porNombre) }];

    const dibujarCard = (it, x, cy) => {
      doc.setFillColor(255, 255, 255); doc.setDrawColor(232, 232, 232); doc.setLineWidth(0.2);
      doc.roundedRect(x, cy, cardW, cardH, radio, radio, 'FD');
      const data = it.imagen && imgCache[it.imagen];
      if (data) {
        let clipped = false;
        try {
          doc.saveGraphicsState();
          doc.roundedRect(x, cy, cardW, imgH + radio, radio, radio, null);
          doc.clip(); doc.discardPath();
          clipped = true;
        } catch (_) { clipped = false; }
        try { doc.addImage(data, 'JPEG', x, cy, cardW, imgH); } catch (_) {}
        if (clipped) { try { doc.restoreGraphicsState(); } catch (_) {} }
      } else {
        doc.setFillColor(243, 240, 241); doc.roundedRect(x, cy, cardW, imgH, radio, radio, 'F');
      }
      const pad = 3;
      let ty = cy + imgH + 5;
      if (it.marca) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(ar, ag, ab);
        doc.text(doc.splitTextToSize(String(it.marca).toUpperCase(), cardW - pad * 2)[0], x + pad, ty);
        ty += 3.6;
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(40, 40, 40);
      const nLines = doc.splitTextToSize(String(it.nombre || ''), cardW - pad * 2).slice(0, 2);
      doc.text(nLines, x + pad, ty); ty += nLines.length * 4;
      if (it.precio) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(ar, ag, ab);
        doc.text(String(it.precio), x + pad, ty + 1.5);
      }
    };

    for (const g of grupos) {
      if (g.titulo) {
        if (y + 8 + cardH > PH - M) y = nuevaPagina();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(ar, ag, ab);
        doc.text(g.titulo, M, y + 4); y += 8;
      }
      for (let i = 0; i < g.items.length; i += cols) {
        if (y + cardH > PH - M) y = nuevaPagina();
        g.items.slice(i, i + cols).forEach((it, c) => dibujarCard(it, M + c * (cardW + gap), y));
        y += cardH + rowGap;
      }
    }

    doc.save(nombrePdf(cat.titulo));
  }

  window.PPCatalogoPDF = construirPdf;
})();
