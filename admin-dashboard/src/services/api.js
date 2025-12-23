// Use the same API base URL as customer app
const API_BASE = process.env.REACT_APP_API_URL || 'https://j0xei88zi7.execute-api.us-east-2.amazonaws.com/prod';

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

export const getSettings = async () => {
  try {
    const res = await fetch(`${API_BASE}/settings`);
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

export const updateOrderStatus = async (orderId, status) => {
  try {
    // Note: You'll need to create an updateOrderStatus endpoint in the backend
    // For now, this is a placeholder
    const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
};

