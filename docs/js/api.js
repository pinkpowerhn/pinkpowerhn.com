const BASE = 'https://network.pinkpowerhn.com';

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

  return {
    id:               stripGid(node.id),
    title:            node.title || '',
    description:      node.description || '',
    productType:      node.productType || '',
    tags:             Array.isArray(node.tags) ? node.tags : [],
    availableForSale: variants.some(v => v.availableForSale),
    price:            displayVariant ? displayVariant.price : 0,
    variants,
    images,
  };
}

function normalizeCollection(node) {
  return {
    id:         stripGid(node.id),
    handle:     node.handle || '',
    title:      node.title  || '',
    productIds: (node.products?.edges || []).map(({ node: p }) => stripGid(p.id)),
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

// Called ONLY on checkout click — intentionally not cached to prevent scraping
export async function fetchConfig() {
  const res = await fetch(`${BASE}/config`);
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
  return res.json(); // { whatsapp: "504XXXXXXXX" }
}

export async function postOrder(orderData) {
  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData),
  });
  if (!res.ok) throw new Error(`Order POST failed: ${res.status}`);
  return res.json();
}

export async function checkHealth() {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error('API unhealthy');
  return res.json();
}
