/**
 * Utility functions to load store hours from localStorage
 * Hours are stored locally, not in DynamoDB
 */

/**
 * Get store hours from localStorage
 * @param {string} restaurantId - Restaurant ID
 * @returns {Object|null} - Hours object or null if not found
 */
export function getStoreHours(restaurantId) {
  if (!restaurantId) return null;
  
  try {
    const hoursKey = `restaurant-hours-${restaurantId}`;
    const savedHours = localStorage.getItem(hoursKey);
    if (savedHours) {
      return JSON.parse(savedHours);
    }
  } catch (error) {
    console.error('Error loading store hours from localStorage:', error);
  }
  
  return null;
}

/**
 * Check if the store is currently open based on hours from localStorage
 * @param {string} restaurantId - Restaurant ID
 * @returns {boolean} - True if store is open, false if closed
 */
export function isStoreOpenFromLocal(restaurantId) {
  const hours = getStoreHours(restaurantId);
  if (!hours || typeof hours !== 'object') {
    // If no hours data, assume store is open (fallback)
    return true;
  }

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }); // e.g., "Monday"
  
  const dayHours = hours[currentDay];
  
  if (!dayHours) {
    // Day not found in hours, assume closed
    return false;
  }
  
  // Check if day is marked as closed
  if (dayHours.closed) {
    return false;
  }
  
  // Parse open and close times
  const [openHour, openMinute] = (dayHours.open || '00:00').split(':').map(Number);
  const [closeHour, closeMinute] = (dayHours.close || '23:59').split(':').map(Number);
  
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  const openTimeMinutes = openHour * 60 + openMinute;
  const closeTimeMinutes = closeHour * 60 + closeMinute;
  
  // Handle case where close time is next day (e.g., 22:00 to 02:00)
  if (closeTimeMinutes < openTimeMinutes) {
    // Store closes after midnight
    return currentTimeMinutes >= openTimeMinutes || currentTimeMinutes <= closeTimeMinutes;
  }
  
  // Normal case: store opens and closes same day
  return currentTimeMinutes >= openTimeMinutes && currentTimeMinutes <= closeTimeMinutes;
}





