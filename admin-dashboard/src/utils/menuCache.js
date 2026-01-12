const MENU_CACHE_KEY_PREFIX = 'admin_menu_cache';
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Generate cache key that includes restaurantId for multi-tenant isolation
 */
function getCacheKey(restaurantId = null) {
  if (restaurantId) {
    return `${MENU_CACHE_KEY_PREFIX}_${restaurantId}`;
  }
  return MENU_CACHE_KEY_PREFIX;
}

/**
 * Get cached menu for a specific restaurant
 * @param {string} [restaurantId] - Restaurant ID for multi-tenant cache
 * @returns {Array|null} - Cached menu data or null if expired/missing
 */
export function getCachedMenu(restaurantId = null) {
  if (typeof window === 'undefined') return null;
  
  try {
    const cacheKey = getCacheKey(restaurantId);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - timestamp < CACHE_DURATION) {
      return data;
    }
    
    // Cache expired, remove it
    localStorage.removeItem(cacheKey);
    return null;
  } catch (error) {
    console.error('Error reading menu cache:', error);
    return null;
  }
}

/**
 * Cache menu data for a specific restaurant
 * @param {Array} menuData - Menu items to cache
 * @param {string} [restaurantId] - Restaurant ID for multi-tenant cache
 */
export function setCachedMenu(menuData, restaurantId = null) {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheKey = getCacheKey(restaurantId);
    const cacheData = {
      data: menuData,
      timestamp: Date.now(),
      restaurantId: restaurantId || null,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error setting menu cache:', error);
  }
}

/**
 * Clear menu cache for a specific restaurant (or all if no restaurantId)
 * @param {string} [restaurantId] - Restaurant ID to clear cache for
 */
export function clearMenuCache(restaurantId = null) {
  if (typeof window === 'undefined') return;
  
  try {
    if (restaurantId) {
      // Clear specific restaurant cache
      localStorage.removeItem(getCacheKey(restaurantId));
    } else {
      // Clear all menu caches (scan localStorage for all matching keys)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(MENU_CACHE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  } catch (error) {
    console.error('Error clearing menu cache:', error);
  }
}

/**
 * Get age of cached menu in milliseconds
 * @param {string} [restaurantId] - Restaurant ID
 * @returns {number|null} - Age in ms or null if no cache
 */
export function getCacheAge(restaurantId = null) {
  if (typeof window === 'undefined') return null;
  
  try {
    const cacheKey = getCacheKey(restaurantId);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const { timestamp } = JSON.parse(cached);
    const now = Date.now();
    return now - timestamp;
  } catch (error) {
    return null;
  }
}

/**
 * Check if cache is still valid
 * @param {string} [restaurantId] - Restaurant ID
 * @returns {boolean} - True if cache exists and is not expired
 */
export function isCacheValid(restaurantId = null) {
  const age = getCacheAge(restaurantId);
  if (age === null) return false;
  return age < CACHE_DURATION;
}
