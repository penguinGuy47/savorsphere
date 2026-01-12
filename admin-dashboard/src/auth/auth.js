/**
 * Authentication utilities for admin dashboard.
 * Handles Cognito Hosted UI OAuth flow, token storage, and session management.
 */

import { COGNITO_CONFIG, getLoginUrl, getLogoutUrl } from './config';

const TOKEN_STORAGE_KEY = 'savor_admin_tokens';
const API_BASE = process.env.REACT_APP_API_URL || 'https://b850esmck5.execute-api.us-east-2.amazonaws.com';

/**
 * Check if Cognito is configured
 */
export function isCognitoConfigured() {
  return !!(COGNITO_CONFIG.domain && COGNITO_CONFIG.clientId);
}

/**
 * Get stored tokens from localStorage
 */
export function getStoredTokens() {
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;
    
    const tokens = JSON.parse(stored);
    
    // Check if tokens are expired
    if (tokens.expiresAt && Date.now() > tokens.expiresAt) {
      // Try to refresh if we have a refresh token
      if (tokens.refreshToken) {
        // For now, just clear - we'll implement refresh later
        clearTokens();
        return null;
      }
      clearTokens();
      return null;
    }
    
    return tokens;
  } catch (error) {
    console.error('Error reading tokens:', error);
    return null;
  }
}

/**
 * Store tokens in localStorage
 */
export function storeTokens(tokens) {
  try {
    // Calculate expiry time (subtract 5 min buffer)
    const expiresAt = Date.now() + ((tokens.expiresIn || 3600) - 300) * 1000;
    
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({
      ...tokens,
      expiresAt,
    }));
  } catch (error) {
    console.error('Error storing tokens:', error);
  }
}

/**
 * Clear stored tokens
 */
export function clearTokens() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Get the current ID token (for API calls)
 */
export function getIdToken() {
  const tokens = getStoredTokens();
  return tokens?.idToken || null;
}

/**
 * Get the current access token
 */
export function getAccessToken() {
  const tokens = getStoredTokens();
  return tokens?.accessToken || null;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return !!getIdToken();
}

/**
 * Redirect to Cognito Hosted UI for login
 */
export function login(returnTo = window.location.pathname) {
  if (!isCognitoConfigured()) {
    console.warn('Cognito not configured - auth disabled');
    return;
  }
  
  // Store return URL in sessionStorage
  sessionStorage.setItem('auth_return_to', returnTo);
  
  const loginUrl = getLoginUrl();
  if (loginUrl) {
    window.location.href = loginUrl;
  }
}

/**
 * Handle OAuth callback - exchange code for tokens
 */
export async function handleCallback(code) {
  if (!code) {
    throw new Error('No authorization code provided');
  }
  
  const { domain, clientId, redirectUri } = COGNITO_CONFIG;
  
  // Exchange code for tokens
  const tokenUrl = `${domain}/oauth2/token`;
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
  });
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  const tokens = await response.json();
  
  // Store tokens
  storeTokens({
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
  
  // Get return URL
  const returnTo = sessionStorage.getItem('auth_return_to') || '/';
  sessionStorage.removeItem('auth_return_to');
  
  return returnTo;
}

/**
 * Logout - clear tokens and redirect to Cognito logout
 */
export function logout() {
  clearTokens();
  
  if (isCognitoConfigured()) {
    window.location.href = getLogoutUrl();
  } else {
    window.location.href = '/';
  }
}

/**
 * Parse JWT token to get claims (without verification)
 */
export function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

/**
 * Get current user info from token
 */
export function getCurrentUser() {
  const idToken = getIdToken();
  if (!idToken) return null;
  
  const claims = parseJwt(idToken);
  if (!claims) return null;
  
  return {
    sub: claims.sub,
    email: claims.email,
    username: claims['cognito:username'] || claims.username,
    restaurantId: claims['custom:restaurantId'],
    groups: claims['cognito:groups'] || [],
  };
}

/**
 * Get restaurantId from current user's token
 */
export function getRestaurantIdFromToken() {
  const user = getCurrentUser();
  if (!user) return null;
  
  // Check custom claim
  if (user.restaurantId) return user.restaurantId;
  
  // Check groups for restaurant-{id} pattern
  const groups = user.groups || [];
  for (const g of groups) {
    if (g.startsWith('restaurant-')) {
      return g.replace('restaurant-', '');
    }
  }
  
  // Check username for kitchen-{restaurantId} pattern
  if (user.username && user.username.startsWith('kitchen-')) {
    return user.username.replace('kitchen-', '');
  }
  
  return null;
}

