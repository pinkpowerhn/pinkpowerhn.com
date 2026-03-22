// ── Internal state ────────────────────────────────────────
const _state = {
  products:          [],
  collections:       [],
  activeCollection:  null,   // collection handle | null = all
  searchQuery:       '',
  cart:              [],     // hydrated from localStorage on initState()
  cartOpen:          false,
  modalProductId:    null,   // short numeric string | null
  waNumber:          null,   // cached on load so FAB click is synchronous on iOS
  activeSize:        null,   // variant/size filter
};

// ── Event bus ─────────────────────────────────────────────
const _listeners = {};

export function on(event, handler) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(handler);
}

export function off(event, handler) {
  if (!_listeners[event]) return;
  _listeners[event] = _listeners[event].filter(h => h !== handler);
}

function emit(event, payload) {
  (_listeners[event] || []).forEach(h => h(payload));
}

// ── Accessors ─────────────────────────────────────────────
export function getState() {
  // Shallow copy — callers must not mutate nested arrays directly
  return { ..._state };
}

export function setState(patch) {
  Object.assign(_state, patch);
  // Persist cart whenever it changes
  if ('cart' in patch) {
    try {
      localStorage.setItem('pinkpower_cart', JSON.stringify(_state.cart));
    } catch (_) { /* private browsing — silent fail */ }
  }
  emit('statechange', { ..._state });
}

// ── Init ──────────────────────────────────────────────────
export function initState() {
  try {
    const raw = localStorage.getItem('pinkpower_cart');
    if (raw) _state.cart = JSON.parse(raw);
  } catch (_) { /* corrupted storage — start fresh */ }
}
