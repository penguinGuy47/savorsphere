import React, { useState, useEffect, useCallback } from 'react';
import { getKitchenPinStatus, regenerateKitchenPin } from '../../services/api';
import { isAuthenticated, isCognitoConfigured, login } from '../../auth/auth';
import './BillingAccount.css';

function BillingAccount({ restaurantId }) {
  // Kitchen PIN state
  const [pinStatus, setPinStatus] = useState({ hasPin: false, lastUpdatedAt: null });
  const [pinLoading, setPinLoading] = useState(true);
  const [pinError, setPinError] = useState(null);
  const [generatedPin, setGeneratedPin] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentPlan = {
    name: 'Pro',
    price: 599,
    billingCycle: 'monthly',
  };

  const nextInvoiceDate = new Date();
  nextInvoiceDate.setDate(nextInvoiceDate.getDate() + 7);

  // Load kitchen PIN status
  const loadPinStatus = useCallback(async () => {
    if (!restaurantId) return;
    
    // Skip if Cognito not configured (dev mode)
    if (!isCognitoConfigured()) {
      setPinLoading(false);
      setPinStatus({ hasPin: false, lastUpdatedAt: null });
      return;
    }
    
    setPinLoading(true);
    setPinError(null);
    
    try {
      const status = await getKitchenPinStatus(restaurantId);
      setPinStatus(status);
    } catch (error) {
      console.error('Error loading PIN status:', error);
      if (error.message.includes('Authentication required')) {
        setPinError('Login required to manage kitchen PIN');
      } else {
        setPinError(error.message);
      }
    } finally {
      setPinLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadPinStatus();
  }, [loadPinStatus]);

  // Handle PIN regeneration
  const handleRegeneratePin = async () => {
    if (!restaurantId) return;
    
    // Check if authenticated
    if (isCognitoConfigured() && !isAuthenticated()) {
      login(window.location.pathname);
      return;
    }
    
    setRegenerating(true);
    setPinError(null);
    setGeneratedPin(null);
    
    try {
      const result = await regenerateKitchenPin(restaurantId);
      setGeneratedPin(result.pinFormatted);
      setPinStatus({ hasPin: true, lastUpdatedAt: result.lastUpdatedAt });
    } catch (error) {
      console.error('Error regenerating PIN:', error);
      setPinError(error.message);
    } finally {
      setRegenerating(false);
    }
  };

  // Copy PIN to clipboard
  const handleCopyPin = async () => {
    if (!generatedPin) return;
    
    try {
      await navigator.clipboard.writeText(generatedPin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Dismiss the generated PIN display
  const handleDismissPin = () => {
    setGeneratedPin(null);
  };

  // Format date for display
  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleStripePortal = () => {
    // In real app, redirect to Stripe Customer Portal
    alert('Redirecting to Stripe Customer Portal...');
  };

  const handleReferFriend = () => {
    alert('Share your referral link: https://app.savorsphere.com/ref/' + restaurantId);
  };

  const handleSupport = () => {
    window.open('https://wa.me/1234567890', '_blank');
  };

  return (
    <div className="billing-account">
      {/* Kitchen Tablet PIN Section */}
      <div className="section pin-section">
        <h2>Kitchen Tablet PIN</h2>
        <div className="pin-card">
          <div className="pin-status">
            <div className="pin-icon">🔐</div>
            <div className="pin-info">
              {pinLoading ? (
                <div className="pin-loading">Loading...</div>
              ) : generatedPin ? (
                <div className="pin-generated">
                  <div className="pin-display">
                    <span className="pin-code">{generatedPin}</span>
                    <button 
                      className={`pin-copy-btn ${copied ? 'copied' : ''}`}
                      onClick={handleCopyPin}
                      title="Copy PIN"
                    >
                      {copied ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                  <div className="pin-warning">
                    Write this down - you'll need it to pair kitchen tablets.
                    <br />
                    <strong>This PIN won't be shown again.</strong>
                  </div>
                  <button className="pin-dismiss-btn" onClick={handleDismissPin}>
                    I've saved the PIN
                  </button>
                </div>
              ) : pinStatus.hasPin ? (
                <>
                  <div className="pin-title">PIN is set</div>
                  <div className="pin-meta">
                    Last updated: {formatDate(pinStatus.lastUpdatedAt)}
                  </div>
                </>
              ) : (
                <>
                  <div className="pin-title">No PIN set</div>
                  <div className="pin-meta">
                    Generate a PIN to pair kitchen display tablets
                  </div>
                </>
              )}
            </div>
          </div>
          
          {pinError && (
            <div className="pin-error">
              {pinError}
              {pinError.includes('Login required') && isCognitoConfigured() && (
                <button 
                  className="pin-login-btn"
                  onClick={() => {
                    login(window.location.pathname);
                  }}
                >
                  Login
                </button>
              )}
            </div>
          )}
          
          {!generatedPin && !pinLoading && (
            <button 
              className="pin-regenerate-btn"
              onClick={handleRegeneratePin}
              disabled={regenerating}
            >
              {regenerating ? 'Generating...' : pinStatus.hasPin ? 'Regenerate PIN' : 'Generate New PIN'}
            </button>
          )}
          
          {pinStatus.hasPin && !generatedPin && (
            <div className="pin-note">
              Regenerating will invalidate all current kitchen sessions.
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <h2>Current Plan</h2>
        <div className="plan-card">
          <div className="plan-header">
            <div className="plan-name">{currentPlan.name}</div>
            <div className="plan-badge">Active</div>
          </div>
          <div className="plan-price">
            ${currentPlan.price.toLocaleString()}
            <span className="plan-cycle">/{currentPlan.billingCycle}</span>
          </div>
          <div className="plan-features">
            <div className="feature-item">✓ Unlimited phone orders</div>
            <div className="feature-item">✓ AI voice assistant</div>
            <div className="feature-item">✓ Real-time order tracking</div>
            <div className="feature-item">✓ SMS notifications</div>
            <div className="feature-item">✓ Analytics & reports</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>Billing Information</h2>
        <div className="billing-info">
          <div className="info-row">
            <span className="info-label">Next invoice date:</span>
            <span className="info-value">
              {nextInvoiceDate.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Card on file:</span>
            <span className="info-value">•••• •••• •••• 4242</span>
          </div>
          <button className="stripe-portal-btn" onClick={handleStripePortal}>
            Manage Payment Method →
          </button>
        </div>
      </div>

      <div className="section">
        <h2>Referral Program</h2>
        <div className="referral-card">
          <div className="referral-content">
            <div className="referral-icon">🎁</div>
            <div className="referral-text">
              <div className="referral-title">Refer a friend</div>
              <div className="referral-description">
                Get one month free when they sign up!
              </div>
            </div>
          </div>
          <button className="refer-btn" onClick={handleReferFriend}>
            Get Referral Link
          </button>
        </div>
      </div>

      <div className="section">
        <h2>Need Help?</h2>
        <div className="support-card">
          <div className="support-content">
            <div className="support-icon">💬</div>
            <div className="support-text">
              <div className="support-title">Direct Support</div>
              <div className="support-description">
                Chat with us on WhatsApp or Telegram. We're here to help!
              </div>
            </div>
          </div>
          <button className="support-btn" onClick={handleSupport}>
            Contact Support →
          </button>
        </div>
      </div>

      <div className="section">
        <h2>Account Settings</h2>
        <div className="settings-list">
          <div className="setting-item">
            <span className="setting-label">Restaurant ID</span>
            <span className="setting-value">{restaurantId}</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Account created</span>
            <span className="setting-value">November 1, 2024</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Status</span>
            <span className="setting-value status-active">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BillingAccount;


