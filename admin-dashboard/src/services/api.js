// Use the same API base URL as customer app
// HTTP API (v2) doesn't use stage prefixes like /prod - routes are directly on the base URL
const API_BASE = process.env.REACT_APP_API_URL || 'https://b850esmck5.execute-api.us-east-2.amazonaws.com';

export const getMenu = async () => {
  try {
    const res = await fetch(`${API_BASE}/menu`);
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
    const url = restaurantId 
      ? `${API_BASE}/settings?restaurantId=${encodeURIComponent(restaurantId)}`
      : `${API_BASE}/settings`;
    const res = await fetch(url);
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

export const updateSettings = async (settings, restaurantId = null) => {
  try {
    const url = restaurantId 
      ? `${API_BASE}/settings?restaurantId=${encodeURIComponent(restaurantId)}`
      : `${API_BASE}/settings`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...settings, restaurantId }),
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
      throw new Error(errorMessage);
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

export const createOrder = async (data) => {
  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

export const getOrders = async (filters = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (filters.date) queryParams.append('date', filters.date);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.orderType) queryParams.append('orderType', filters.orderType);
    
    const url = `${API_BASE}/orders${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const res = await fetch(url);
    
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

export const updateOrderStatus = async (orderId, status, acceptedAt = null) => {
  try {
    const body = { status };
    if (acceptedAt) {
      body.acceptedAt = acceptedAt;
    }
    
    const res = await fetch(`${API_BASE}/order/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
      throw new Error(errorMessage);
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
};

// Menu Item CRUD operations
export const createMenuItem = async (menuItem, restaurantId = null) => {
  try {
    // MULTI-TENANT: Include restaurantId in request body if provided
    const requestBody = restaurantId 
      ? { ...menuItem, restaurantId }
      : menuItem;
    
    const res = await fetch(`${API_BASE}/menu`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
      throw new Error(errorMessage);
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error creating menu item:', error);
    throw error;
  }
};

export const updateMenuItem = async (menuItemId, updates, restaurantId = null) => {
  try {
    // MULTI-TENANT: Include restaurantId in request body if provided
    const requestBody = restaurantId 
      ? { ...updates, restaurantId }
      : updates;
    
    const res = await fetch(`${API_BASE}/menu/${menuItemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
      throw new Error(errorMessage);
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error updating menu item:', error);
    throw error;
  }
};

export const deleteMenuItem = async (menuItemId, restaurantId = null) => {
  try {
    // MULTI-TENANT: Include restaurantId as query param if provided
    const url = restaurantId 
      ? `${API_BASE}/menu/${menuItemId}?restaurantId=${encodeURIComponent(restaurantId)}`
      : `${API_BASE}/menu/${menuItemId}`;
    
    const res = await fetch(url, {
      method: 'DELETE',
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
      throw new Error(errorMessage);
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error deleting menu item:', error);
    throw error;
  }
};

