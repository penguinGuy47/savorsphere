import { getIdToken } from '../auth/auth';

// Use the same API base URL as customer app
// IMPORTANT: This backend is deployed via CDK HttpApi and does NOT use a /prod stage path.
const API_BASE = process.env.REACT_APP_API_URL || 'https://b850esmck5.execute-api.us-east-2.amazonaws.com';

/**
 * Build headers with optional Authorization and restaurantId
 * @param {Object} options
 * @param {string} [options.restaurantId] - Restaurant ID for multi-tenant isolation
 * @param {boolean} [options.includeAuth] - Whether to include Authorization header (default: true if token available)
 * @param {string} [options.contentType] - Content-Type header (default: application/json)
 * @param {string|null} [options.token] - Explicit JWT token to use (overrides admin token)
 * @returns {Object} Headers object
 */
function buildHeaders({ restaurantId = null, includeAuth = true, contentType = 'application/json', token = null } = {}) {
  const headers = {};
  
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  
  // Add restaurantId header for multi-tenant isolation
  if (restaurantId) {
    headers['x-restaurant-id'] = restaurantId;
  }
  
  // Add Authorization header if token is available
  if (includeAuth) {
    const idToken = token || getIdToken();
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }
  }
  
  return headers;
}

/**
 * Fetch menu items for a restaurant.
 * 
 * @param {string} [restaurantId] - Restaurant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Array of menu items (v1 and v2)
 */
export const getMenu = async (restaurantId = null) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add restaurantId header for multi-tenant isolation
    if (restaurantId) {
      headers['x-restaurant-id'] = restaurantId;
    }
    
    const url = `${API_BASE}/menu`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error fetching menu:', error);
    throw error;
  }
};

export const getSettings = async (restaurantId = null) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add restaurantId header for multi-tenant isolation
    if (restaurantId) {
      headers['x-restaurant-id'] = restaurantId;
    }
    
    const res = await fetch(`${API_BASE}/settings`, {
      headers,
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }
};

export const createOrder = async (data, restaurantId = null) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add restaurantId header for multi-tenant isolation
    if (restaurantId) {
      headers['x-restaurant-id'] = restaurantId;
    }
    
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const result = await res.json();
    return result;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};

export const getOrder = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/order/${id}`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
};

/**
 * Fetch orders with flexible filtering options.
 *
 * Supports both public and JWT-protected endpoints:
 * - Public: GET /orders
 * - Protected: GET /admin/orders (requires Authorization)
 *
 * @param {Object} filters - Filter options
 * @param {number} [filters.days] - Number of days to look back (default: 30)
 * @param {string} [filters.from] - Start date (ISO or YYYY-MM-DD)
 * @param {string} [filters.to] - End date (ISO or YYYY-MM-DD)
 * @param {boolean} [filters.all] - If true, return all orders (no date filter)
 * @param {string} [filters.status] - Filter by status (new, paid, accepted, etc.)
 * @param {string} [filters.orderType] - Filter by order type (pickup, delivery, dine-in)
 * @param {string} [filters.cursor] - Pagination cursor for large datasets
 * @param {string} [filters.date] - (Legacy) Specific date to filter by
 * @param {string} [restaurantId] - Restaurant ID for multi-tenant isolation
 * @param {Object} [options]
 * @param {boolean} [options.useAdminEndpoint] - If true, call /admin/orders
 * @param {string|null} [options.token] - Explicit JWT to use for Authorization (kitchen tokens)
 * @returns {Promise<{orders: Array, totalRevenue: number, count: number, dateRange: Object}>}
 */
export const getOrders = async (filters = {}, restaurantId = null, options = {}) => {
  try {
    const { useAdminEndpoint = false, token = null } = options || {};
    const queryParams = new URLSearchParams();
    
    // New date range parameters (takes priority)
    if (filters.days) queryParams.append('days', String(filters.days));
    if (filters.from) queryParams.append('from', filters.from);
    if (filters.to) queryParams.append('to', filters.to);
    if (filters.all) queryParams.append('all', 'true');
    
    // Legacy date parameter (for backward compatibility)
    if (filters.date && !filters.from && !filters.to) {
      queryParams.append('from', filters.date);
      queryParams.append('to', filters.date);
    }
    
    // Other filters
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.orderType) queryParams.append('orderType', filters.orderType);
    if (filters.cursor) queryParams.append('cursor', filters.cursor);
    
    const headers = buildHeaders({ restaurantId, includeAuth: useAdminEndpoint || !!token, token });
    const basePath = useAdminEndpoint ? '/admin/orders' : '/orders';
    const url = `${API_BASE}${basePath}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = `HTTP error! status: ${res.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch (e) {
        // If not JSON, use the text
        errorMessage = errorText || errorMessage;
      }
      const error = new Error(errorMessage);
      error.status = res.status;
      throw error;
    }
    
    const data = await res.json();

    return data;
  } catch (error) {
    console.error('Error fetching orders:', error);
    // Preserve status code if available
    if (error.status) {
      const enhancedError = new Error(error.message);
      enhancedError.status = error.status;
      throw enhancedError;
    }
    throw error;
  }
};

export const updateOrderStatus = async (orderId, status, acceptedAt, restaurantId = null, options = {}) => {
  try {
    const { useAdminEndpoint = false, token = null } = options || {};
    const basePath = useAdminEndpoint ? '/admin/order' : '/order';
    const url = `${API_BASE}${basePath}/${orderId}`;

    const payload = typeof acceptedAt === 'string' && acceptedAt.length > 0
      ? { status, acceptedAt }
      : { status };

    const headers = buildHeaders({ restaurantId, includeAuth: useAdminEndpoint || !!token, token });

    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = `HTTP error! status: ${res.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      const error = new Error(errorMessage);
      error.status = res.status;
      throw error;
    }
    const data = await res.json();

    return data;
  } catch (error) {
    console.error('Error updating order status:', error);
    if (error.status) {
      const enhancedError = new Error(error.message);
      enhancedError.status = error.status;
      throw enhancedError;
    }
    throw error;
  }
};

export const updateSettings = async (settingsData, restaurantId = null) => {
  try {
    const headers = buildHeaders({ restaurantId });
    
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(settingsData),
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

// ============================================================================
// Kitchen PIN Management APIs
// ============================================================================

/**
 * Check if a kitchen PIN is set for a restaurant.
 * Requires admin authentication.
 * 
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<{hasPin: boolean, lastUpdatedAt: string|null}>}
 */
export const getKitchenPinStatus = async (restaurantId) => {
  try {
    const headers = buildHeaders({ restaurantId });
    
    const res = await fetch(`${API_BASE}/kitchen/pin`, { headers });
    
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Authentication required');
      }
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error('Error checking kitchen PIN status:', error);
    throw error;
  }
};

/**
 * Regenerate the kitchen PIN for a restaurant.
 * Returns the new PIN (shown only once).
 * Requires admin authentication.
 * 
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<{success: boolean, pinFormatted: string, lastUpdatedAt: string, message: string}>}
 */
export const regenerateKitchenPin = async (restaurantId) => {
  try {
    const headers = buildHeaders({ restaurantId });
    
    const res = await fetch(`${API_BASE}/kitchen/pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Authentication required');
      }
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error('Error regenerating kitchen PIN:', error);
    throw error;
  }
};

/**
 * Exchange kitchen PIN for JWT tokens.
 * This is the kitchen tablet login - does NOT require prior authentication.
 * 
 * @param {string} restaurantId - Restaurant ID
 * @param {string} pin - 6-digit PIN (with or without dash)
 * @returns {Promise<{success: boolean, idToken: string, accessToken: string, refreshToken: string, expiresIn: number}>}
 */
export const kitchenLogin = async (restaurantId, pin) => {
  try {
    // No auth header for login endpoint
    const headers = buildHeaders({ restaurantId, includeAuth: false });
    
    const res = await fetch(`${API_BASE}/kitchen/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ restaurantId, pin }),
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error('Error logging in to kitchen:', error);
    throw error;
  }
};