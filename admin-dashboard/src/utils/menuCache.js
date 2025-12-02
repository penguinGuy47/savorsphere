const MENU_CACHE_KEY = 'admin_menu_cache';
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

export function getCachedMenu() {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(MENU_CACHE_KEY);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - timestamp < CACHE_DURATION) {
      return data;
    }
    
    // Cache expired, remove it
    localStorage.removeItem(MENU_CACHE_KEY);
    return null;
  } catch (error) {
    console.error('Error reading menu cache:', error);
    return null;
  }
}

export function setCachedMenu(menuData) {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheData = {
      data: menuData,
      timestamp: Date.now(),
    };
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error setting menu cache:', error);
  }
}

export function clearMenuCache() {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(MENU_CACHE_KEY);
  } catch (error) {
    console.error('Error clearing menu cache:', error);
  }
}

export function getCacheAge() {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(MENU_CACHE_KEY);
    if (!cached) return null;
    
    const { timestamp } = JSON.parse(cached);
    const now = Date.now();
    return now - timestamp;
  } catch (error) {
    return null;
  }
}

export function isCacheValid() {
  const age = getCacheAge();
  if (age === null) return false;
  return age < CACHE_DURATION;
}

// Invalidate cache when menu items are modified
export function invalidateMenuCache() {
  clearMenuCache();
}


