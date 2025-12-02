import React from 'react';
import './BillingAccount.css';

function BillingAccount({ restaurantId }) {
  const currentPlan = {
    name: 'Pro',
    price: 599,
    billingCycle: 'monthly',
  };

  const nextInvoiceDate = new Date();
  nextInvoiceDate.setDate(nextInvoiceDate.getDate() + 7);

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


