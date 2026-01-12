/**
 * OAuth callback handler for Cognito Hosted UI authentication.
 * Exchanges authorization code for tokens and redirects to the original page.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { handleCallback, isCognitoConfigured } from '../auth/auth';

function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function processCallback() {
      // Get authorization code from URL
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (errorParam) {
        setError(`Authentication error: ${errorDescription || errorParam}`);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        return;
      }

      if (!isCognitoConfigured()) {
        // If Cognito isn't configured, just redirect home
        navigate('/', { replace: true });
        return;
      }

      try {
        const returnTo = await handleCallback(code);
        navigate(returnTo, { replace: true });
      } catch (err) {
        console.error('Callback error:', err);
        setError(err.message);
      }
    }

    processCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>Authentication Error</h2>
          <p style={styles.error}>{error}</p>
          <button style={styles.button} onClick={() => navigate('/')}>
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.spinner}></div>
        <p style={styles.text}>Completing sign in...</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: '12px',
    padding: '2rem 3rem',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
  },
  title: {
    color: '#fff',
    marginBottom: '1rem',
  },
  text: {
    color: '#a0a0a0',
    margin: 0,
  },
  error: {
    color: '#ff6b6b',
    marginBottom: '1.5rem',
  },
  button: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  spinner: {
    width: '40px',
    height: '40px',
    margin: '0 auto 1rem',
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#10b981',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

// Add keyframes for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default AuthCallback;




