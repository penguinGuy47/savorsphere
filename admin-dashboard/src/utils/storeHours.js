/**
 * Utility functions to check if store is currently open based on business hours
 */

/**
 * Check if the store is currently open
 * @param {Object} hours - Hours object with structure: { [day]: { open: 'HH:mm', close: 'HH:mm', closed: boolean } }
 * @returns {boolean} - True if store is open, false if closed
 */
export function isStoreOpen(hours) {
  if (!hours || typeof hours !== 'object') {
    // If no hours data, assume store is open (fallback)
    return true;
  }

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }); // e.g., "Monday"
  const currentTime = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }); // e.g., "14:30"
  
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

/**
 * Get the current day's hours
 * @param {Object} hours - Hours object
 * @returns {Object|null} - Current day's hours or null
 */
export function getCurrentDayHours(hours) {
  if (!hours || typeof hours !== 'object') {
    return null;
  }
  
  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
  
  return hours[currentDay] || null;
}





