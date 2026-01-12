// Local storage helpers for store hours.
// KitchenView uses this to avoid polling when the store is closed.

const STORAGE_PREFIX = 'savorSphere.storeHours';

function getStorageKey(restaurantId) {
  const id = (restaurantId && String(restaurantId).trim()) || 'default';
  return `${STORAGE_PREFIX}.${id}`;
}

function safeJsonParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function timeToMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function loadStoreHoursLocal(restaurantId) {
  const key = getStorageKey(restaurantId);
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) return null;
  return parsed.value;
}

export function saveStoreHoursLocal(restaurantId, hours) {
  const key = getStorageKey(restaurantId);
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(hours || {}));
  } catch {
    // ignore localStorage quota / serialization errors
  }
}

export function isStoreOpenFromLocal(restaurantId, now = new Date()) {
  const key = getStorageKey(restaurantId);

  const hours = loadStoreHoursLocal(restaurantId);
  if (!hours || typeof hours !== 'object') {
    // IMPORTANT: default open so the kitchen kiosk still runs even if hours were never set.
    return true;
  }

  const dayName = DAY_NAMES[(now instanceof Date ? now.getDay() : new Date().getDay())] || 'Sunday';
  const cfg = hours[dayName];
  if (!cfg || typeof cfg !== 'object') {
    // Unknown schema; be permissive.
    return true;
  }

  if (cfg.closed === true) {
    return false;
  }

  const openMin = timeToMinutes(cfg.open);
  const closeMin = timeToMinutes(cfg.close);
  const currentMin = (now instanceof Date ? now.getHours() * 60 + now.getMinutes() : new Date().getHours() * 60 + new Date().getMinutes());

  // If parsing fails, default open.
  if (openMin === null || closeMin === null) {
    return true;
  }

  let open = false;
  if (openMin === closeMin) {
    // Treat as 24h open.
    open = true;
  } else if (closeMin < openMin) {
    // Spans midnight
    open = currentMin >= openMin || currentMin < closeMin;
  } else {
    open = currentMin >= openMin && currentMin < closeMin;
  }

  return open;
}


