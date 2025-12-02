import React, { useState } from 'react';
import './LoyaltyPromos.css';

const PROMO_TEMPLATES = [
  {
    id: 'buy10get1',
    name: 'Buy 10 Get 1 Free',
    description: 'Every 10th order gets a free item',
  },
  {
    id: 'tuesday',
    name: 'Tuesday Large Pie $12.99',
    description: 'Special Tuesday pricing',
  },
  {
    id: 'firsttime',
    name: 'First-time Caller 15% Off',
    description: 'Discount for new customers',
  },
];

function LoyaltyPromos({ restaurantId }) {
  const [currentPromo, setCurrentPromo] = useState({
    banner: 'Free 2-liter with $40+ order',
    active: true,
  });

  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  const handlePromoToggle = () => {
    setCurrentPromo({ ...currentPromo, active: !currentPromo.active });
  };

  const handleApplyTemplate = (template) => {
    setCurrentPromo({
      banner: template.name,
      active: true,
    });
    alert(`Applied: ${template.name}`);
  };

  const handleSendSMS = async () => {
    if (!smsMessage.trim()) {
      alert('Please enter a message');
      return;
    }

    setSmsSending(true);
    // Simulate API call
    setTimeout(() => {
      setSmsSending(false);
      alert('SMS blast sent! (This would send to all customers from last 90 days)');
      setSmsMessage('');
    }, 2000);
  };

  return (
    <div className="loyalty-promos">
      <div className="section">
        <h2>Current Promo Banner</h2>
        <p className="section-description">
          This appears in the AI voice prompts and customer communications
        </p>
        <div className={`promo-banner ${currentPromo.active ? 'active' : 'inactive'}`}>
          <div className="promo-content">
            <div className="promo-text">{currentPromo.banner}</div>
            <label className="promo-toggle">
              <input
                type="checkbox"
                checked={currentPromo.active}
                onChange={handlePromoToggle}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
        <input
          type="text"
          className="promo-input"
          value={currentPromo.banner}
          onChange={(e) => setCurrentPromo({ ...currentPromo, banner: e.target.value })}
          placeholder="Enter promo banner text..."
        />
      </div>

      <div className="section">
        <h2>One-Click Promo Templates</h2>
        <p className="section-description">
          Click to instantly apply these proven money-makers
        </p>
        <div className="template-grid">
          {PROMO_TEMPLATES.map((template) => (
            <div key={template.id} className="template-card">
              <div className="template-name">{template.name}</div>
              <div className="template-description">{template.description}</div>
              <button
                className="apply-template-btn"
                onClick={() => handleApplyTemplate(template)}
              >
                Apply Template
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Send SMS Blast</h2>
        <p className="section-description">
          Send a message to every customer who ordered in the last 90 days
          <br />
          <span className="cost-info">Cost: $0.007 per text (charged to you, not the owner)</span>
        </p>
        <textarea
          className="sms-input"
          value={smsMessage}
          onChange={(e) => setSmsMessage(e.target.value)}
          placeholder="Type your message here... (e.g., 'New special: Large pizza $12.99 today only!')"
          rows="5"
        />
        <div className="sms-info">
          <div className="char-count">
            {smsMessage.length} characters
            {smsMessage.length > 160 && (
              <span className="warning"> (Will be split into multiple messages)</span>
            )}
          </div>
          <div className="estimated-cost">
            Estimated cost: ${((smsMessage.length > 0 ? 1 : 0) * 0.007).toFixed(3)} per recipient
          </div>
        </div>
        <button
          className="send-sms-btn"
          onClick={handleSendSMS}
          disabled={smsSending || !smsMessage.trim()}
        >
          {smsSending ? 'Sending...' : '📱 Send SMS Blast'}
        </button>
      </div>

      <div className="section">
        <h2>Loyalty Program Stats</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">1,247</div>
            <div className="stat-label">Active Members</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">$8,450</div>
            <div className="stat-label">Redeemed This Month</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">23%</div>
            <div className="stat-label">Repeat Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoyaltyPromos;


