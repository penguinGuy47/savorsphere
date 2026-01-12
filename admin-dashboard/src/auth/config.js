/**
 * Cognito configuration for admin dashboard authentication.
 * These values are populated from environment variables or CDK outputs.
 */

// Cognito settings - from CDK outputs (SavorSphereProd)
// These can be overridden via environment variables
export const COGNITO_CONFIG = {
  // User Pool ID (from CDK output: UserPoolId)
  userPoolId: process.env.REACT_APP_USER_POOL_ID || 'us-east-2_NJGJfYF0e',
  
  // Admin client ID (from CDK output: AdminClientId)
  clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || '58ml81hqi7jcesv8gvga8po1f2',
  
  // Cognito domain (from CDK output: CognitoDomain)
  domain: process.env.REACT_APP_COGNITO_DOMAIN || 'https://savor-sphere-027354322532.auth.us-east-2.amazoncognito.com',
  
  // Region
  region: process.env.REACT_APP_AWS_REGION || 'us-east-2',
  
  // Redirect URIs
  redirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin + '/callback',
  logoutUri: process.env.REACT_APP_LOGOUT_URI || window.location.origin + '/',
  
  // OAuth scopes
  scopes: ['openid', 'email', 'profile'],
};

/**
 * Build the Cognito Hosted UI login URL
 */
export function getLoginUrl(state = '') {
  const { domain, clientId, redirectUri, scopes } = COGNITO_CONFIG;
  
  if (!domain || !clientId) {
    console.warn('Cognito not configured - skipping auth');
    return null;
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
  });
  
  if (state) {
    params.append('state', state);
  }

  return `${domain}/login?${params.toString()}`;
}

/**
 * Build the Cognito logout URL
 */
export function getLogoutUrl() {
  const { domain, clientId, logoutUri } = COGNITO_CONFIG;
  
  if (!domain || !clientId) {
    return logoutUri;
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutUri,
  });
  
  return `${domain}/logout?${params.toString()}`;
}

