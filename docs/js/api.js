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

export async function fetchProducts() {
  if (_products) return _products;
  const res = await fetch(`${BASE}/products`);
  if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
  const json = await res.json();
  _products = (json.data?.products?.edges || []).map(({ node }) => normalizeProduct(node));
  return _products;
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
