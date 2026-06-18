// Búsqueda compartida: coincidencia aproximada (fuzzy) y multi-campo.
// Busca en título, descripción, tipo de producto, etiquetas y nombres de
// colección, tolerando acentos, plurales y pequeños errores de tipeo.

// Palabras de relleno que no aportan a la búsqueda (se ignoran si hay otras).
const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'con', 'sin', 'para', 'por', 'del', 'al', 'en',
]);

// Normaliza: minúsculas, sin acentos, solo letras/números/espacios.
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Divide la consulta en palabras buscables, quitando relleno.
export function tokenize(query) {
  const all = norm(query).split(' ').filter(Boolean);
  const meaningful = all.filter(t => !STOPWORDS.has(t));
  return meaningful.length ? meaningful : all;
}

// Mapa handle de colección -> título, para poder buscar por nombre de colección.
export function buildCollMap(collections = []) {
  const map = {};
  for (const c of collections) {
    if (c && c.handle) map[c.handle] = c.title || '';
  }
  return map;
}

// Distancia de edición (Levenshtein) acotada, para tolerar typos/plurales.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Construye (y cachea en el producto) el texto buscable y sus palabras.
function haystack(product, collMap) {
  if (product._hayText !== undefined) {
    return { text: product._hayText, words: product._hayWords };
  }
  const collTitles = (product.collectionHandles || [])
    .map(h => collMap[h] || '')
    .join(' ');
  const raw = [
    product.title,
    product.description,
    product.productType,
    collTitles,
    (product.tags || []).join(' '),
  ].join(' ');
  const text = norm(raw);
  const words = [...new Set(text.split(' ').filter(Boolean))];
  Object.defineProperty(product, '_hayText',  { value: text,  enumerable: false });
  Object.defineProperty(product, '_hayWords', { value: words, enumerable: false });
  return { text, words };
}

// Qué tan bien encaja un token en el texto del producto. 0 = no encaja.
function tokenScore(token, text, words) {
  if (text.includes(token)) return 2;               // coincidencia directa
  const tol = token.length <= 4 ? 1 : token.length <= 7 ? 2 : 3;
  let best = 0;
  for (const w of words) {
    if (w.startsWith(token) || token.startsWith(w)) { best = Math.max(best, 1.5); continue; }
    if (Math.abs(w.length - token.length) <= tol && levenshtein(w, token) <= tol) {
      best = Math.max(best, 1);
    }
  }
  return best;
}

// Puntaje total de un producto contra los tokens. Todos deben encajar (AND).
export function scoreProduct(product, tokens, collMap) {
  if (!tokens.length) return 0;
  const { text, words } = haystack(product, collMap);
  let total = 0;
  for (const t of tokens) {
    const s = tokenScore(t, text, words);
    if (s === 0) return 0;
    total += s;
  }
  // Bonus si los tokens están en el título (más relevante).
  const title = norm(product.title);
  for (const t of tokens) if (title.includes(t)) total += 1.5;
  return total;
}

// Devuelve los productos que coinciden, ordenados por relevancia.
export function searchProducts(products = [], query, collections = []) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const collMap = buildCollMap(collections);
  const scored = [];
  for (const p of products) {
    const s = scoreProduct(p, tokens, collMap);
    if (s > 0) scored.push({ p, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.map(x => x.p);
}
