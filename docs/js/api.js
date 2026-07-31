const BASE = 'https://api.pinkpowerhn.com';

// In-memory cache — one fetch per page load
let _products = null;
let _collections = null;

function stripGid(gid) {
  if (!gid || typeof gid !== 'string') return String(gid);
  return gid.split('/').pop();
}

function normalizeVariant(node) {
  return {
    id: stripGid(node.id),
    title: node.title || 'Default Title',
    price: parseFloat(node.price) || 0,
    availableForSale: Boolean(node.availableForSale),
    // null = inventory not tracked for this variant (treat as unlimited)
    inventoryQuantity: node.inventoryQuantity ?? null,
  };
}

function normalizeProduct(node) {
  const variants = (node.variants?.edges || []).map(({ node: v }) => normalizeVariant(v));
  const images   = (node.images?.edges   || []).map(({ node: img }) => ({
    url:     img.url || '',
    altText: img.altText || '',
  }));

  // Display price: first available variant, else first variant
  const displayVariant = variants.find(v => v.availableForSale) || variants[0];

  const collectionHandles = (node.collections?.edges || [])
    .map(({ node: c }) => c.handle)
    .filter(Boolean);

  return {
    id:                stripGid(node.id),
    title:             node.title || '',
    description:       node.description || '',
    // Versión con formato (párrafos/saltos) para respetar el espaciado que la
    // dueña escribe en Shopify; el campo `description` plano ya viene sin saltos.
    descriptionHtml:   node.descriptionHtml || '',
    productType:       node.productType || '',
    tags:              Array.isArray(node.tags) ? node.tags : [],
    collectionHandles,
    availableForSale:  variants.some(v => v.availableForSale),
    price:             displayVariant ? displayVariant.price : 0,
    variants,
    images,
  };
}

function normalizeCollection(node) {
  return {
    id:     stripGid(node.id),
    handle: node.handle || '',
    title:  node.title  || '',
  };
}

// Fetch ONE page of products. Returns { products, cursor, hasNext }.
// Frontend hace progressive loading: primera página chica para arrancar rápido,
// luego sigue tirando con cursor en background.
export async function fetchProductsPage({ cursor = null, first = 50 } = {}) {
  const params = new URLSearchParams({ first: String(first) });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${BASE}/products?${params.toString()}`);
  if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
  const json = await res.json();
  const edges = json.data?.products?.edges || [];
  const pi    = json.data?.products?.pageInfo || {};
  return {
    products: edges.map(({ node }) => normalizeProduct(node)),
    cursor:   pi.endCursor || null,
    hasNext:  Boolean(pi.hasNextPage),
  };
}

export async function fetchCollections() {
  if (_collections) return _collections;
  const res = await fetch(`${BASE}/collections`);
  if (!res.ok) throw new Error(`Collections fetch failed: ${res.status}`);
  const json = await res.json();
  _collections = (json.data?.collections?.edges || []).map(({ node }) => normalizeCollection(node));
  return _collections;
}

export async function fetchProductById(id) {
  const res = await fetch(`${BASE}/products/${id}`);
  if (!res.ok) throw new Error(`Product ${id} fetch failed: ${res.status}`);
  const json = await res.json();
  // Handle both { data: { product: {...} } } and a direct node
  const node = json.data?.product || json;
  return normalizeProduct(node);
}

// ── Mayoreo ───────────────────────────────────────────────
// Login de mayorista. Devuelve { token, usuario, nombre } o lanza error.
export async function mayoreoLogin(usuario, password) {
  const res = await fetch(`${BASE}/mayoreo/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'Usuario o contraseña incorrectos' : 'No se pudo iniciar sesión';
    throw new Error(msg);
  }
  return res.json();
}

// Catálogo de mayoreo (solo productos con precio de mayoreo, ya aplicado).
// Requiere el token de sesión. Devuelve productos normalizados como /products.
export async function fetchMayoreoProducts(token) {
  const res = await fetch(`${BASE}/mayoreo/products`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error(`Mayoreo products failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const edges = json.data?.products?.edges || [];
  return edges.map(({ node }) => normalizeProduct(node));
}

// ── Catálogos de revendedora (links temporales) ───────────
// Crea un catálogo y devuelve { token, dias, expiraEn }.
export async function crearCatalogo(token, data) {
  const res = await fetch(`${BASE}/mayoreo/catalogos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'No se pudo crear el catálogo';
    try { msg = (await res.json()).detail || msg; } catch (_) {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.json();
}

// Edita un catálogo existente (conserva link y expiración). Devuelve { token }.
export async function editarCatalogo(token, catToken, data) {
  const res = await fetch(`${BASE}/mayoreo/catalogos/${encodeURIComponent(catToken)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'No se pudo guardar el catálogo';
    try { msg = (await res.json()).detail || msg; } catch (_) {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.json();
}

// Lista los catálogos de la mayorista. Devuelve { dias, catalogos: [...] }.
export async function listarCatalogos(token) {
  const res = await fetch(`${BASE}/mayoreo/catalogos`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error('No se pudieron cargar los catálogos'); err.status = res.status; throw err;
  }
  return res.json();
}

export async function eliminarCatalogo(token, catToken) {
  const res = await fetch(`${BASE}/mayoreo/catalogos/${encodeURIComponent(catToken)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo eliminar el catálogo');
  return res.json();
}

// Called ONLY on checkout click — intentionally not cached to prevent scraping
export async function fetchConfig() {
  const res = await fetch(`${BASE}/config`);
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
  return res.json(); // { whatsapp: "504XXXXXXXX" }
}

export async function postOrder(orderData, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  // Si hay sesión de mayoreo, el token marca el pedido como de mayoreo (precios
  // personalizados + etiqueta) en el backend.
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(orderData),
  });
  if (!res.ok) {
    // Conservar el cuerpo del error (p. ej. 409 con la lista de agotados) para
    // que el checkout pueda reaccionar y avisar a la clienta.
    let body = null;
    try { body = await res.json(); } catch { /* sin cuerpo JSON */ }
    const err = new Error(`Order POST failed: ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export async function checkHealth() {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error('API unhealthy');
  return res.json();
}
