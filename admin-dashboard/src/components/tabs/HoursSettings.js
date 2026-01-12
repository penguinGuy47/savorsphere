import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../../services/api';
import { saveStoreHoursLocal } from '../../utils/storeHoursLocal';
import './HoursSettings.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Rush level labels for the slider
const RUSH_LABELS = {
  1.0: 'Normal',
  1.3: 'Busy',
  1.6: 'Very Busy',
  2.0: 'Slammed',
};

function HoursSettings({ restaurantId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [hours, setHours] = useState(
    DAYS.reduce((acc, day) => {
      acc[day] = { open: '11:00', close: '22:00', closed: false };
      return acc;
    }, {})
  );

  const [settings, setSettings] = useState({
    acceptDelivery: true,
    minDeliveryOrder: 30,
    deliveryFee: 4,
    taxRate: 8.875,
    autoCreditCardFee: true,
    // ETA settings
    etaPickupBaseMinutes: 15,
    etaPickupRangeMinutes: 5,
    etaDeliveryBaseMinutes: 30,
    etaDeliveryRangeMinutes: 10,
    etaRushMultiplier: 1.0,
    etaPerPizzaMinutes: 3,
    etaPerSideMinutes: 1,
  });

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        // Pass restaurantId for multi-tenant isolation
        const data = await getSettings(restaurantId);
        // Merge loaded settings with defaults
        setSettings(prev => ({
          ...prev,
          ...data,
        }));
        // Load hours if present
        if (data.hours) {
          setHours(prev => ({
            ...prev,
            ...data.hours,
          }));
          // Keep a local copy for KitchenView kiosk logic
          saveStoreHoursLocal(restaurantId, data.hours);
        }
        setError(null);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [restaurantId]);

  const handleDayToggle = (day) => {
    setHours({
      ...hours,
      [day]: { ...hours[day], closed: !hours[day].closed },
    });
  };

  const handleTimeChange = (day, field, value) => {
    setHours({
      ...hours,
      [day]: { ...hours[day], [field]: value },
    });
  };

  const handleSettingChange = (field, value) => {
    setSettings({ ...settings, [field]: value });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Pass restaurantId for multi-tenant isolation
      await updateSettings({ ...settings, hours }, restaurantId);
      // Keep a local copy for KitchenView kiosk logic
      saveStoreHoursLocal(restaurantId, hours);
      setError(null);
      alert('Settings saved!');
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Get current rush level label
  const getRushLabel = (multiplier) => {
    const closest = Object.keys(RUSH_LABELS)
      .map(Number)
      .reduce((prev, curr) => 
        Math.abs(curr - multiplier) < Math.abs(prev - multiplier) ? curr : prev
      );
    return RUSH_LABELS[closest] || `${multiplier}x`;
  };

  if (loading) {
    return <div className="hours-settings"><p>Loading settings...</p></div>;
  }

  return (
    <div className="hours-settings">
      <div className="section">
        <h2>Business Hours</h2>
        <p className="section-description">
          The AI phone automatically says "we're closed" outside these hours
        </p>
        <div className="hours-list">
          {DAYS.map((day) => (
            <div key={day} className="hours-row">
              <div className="day-label">{day}</div>
              <div className="hours-controls">
                <label className="closed-toggle">
                  <input
                    type="checkbox"
                    checked={hours[day].closed}
                    onChange={() => handleDayToggle(day)}
                  />
                  <span>Closed</span>
                </label>
                {!hours[day].closed && (
                  <>
                    <input
                      type="time"
                      value={hours[day].open}
                      onChange={(e) => handleTimeChange(day, 'open', e.target.value)}
                      className="time-input"
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={hours[day].close}
                      onChange={(e) => handleTimeChange(day, 'close', e.target.value)}
                      className="time-input"
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Delivery Settings</h2>
        <div className="settings-list">
          <div className="setting-row">
            <label className="setting-label">Accept delivery orders?</label>
            <label className="toggle-switch-large">
              <input
                type="checkbox"
                checked={settings.acceptDelivery}
                onChange={(e) => handleSettingChange('acceptDelivery', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {settings.acceptDelivery && (
            <>
              <div className="setting-row">
                <label className="setting-label">Minimum delivery order</label>
                <div className="input-group">
                  <span className="currency">$</span>
                  <input
                    type="number"
                    value={settings.minDeliveryOrder}
                    onChange={(e) => handleSettingChange('minDeliveryOrder', parseFloat(e.target.value))}
                    className="number-input"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="setting-row">
                <label className="setting-label">Delivery fee</label>
                <div className="input-group">
                  <span className="currency">$</span>
                  <input
                    type="number"
                    value={settings.deliveryFee}
                    onChange={(e) => handleSettingChange('deliveryFee', parseFloat(e.target.value))}
                    className="number-input"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section">
        <h2>Payment Settings</h2>
        <div className="settings-list">
          <div className="setting-row">
            <label className="setting-label">Tax rate</label>
            <div className="input-group">
              <input
                type="number"
                value={settings.taxRate}
                onChange={(e) => handleSettingChange('taxRate', parseFloat(e.target.value))}
                className="number-input"
                min="0"
                max="100"
                step="0.001"
              />
              <span className="percent">%</span>
            </div>
          </div>

          <div className="setting-row">
            <label className="setting-label">Auto-add 3% credit card fee?</label>
            <label className="toggle-switch-large">
              <input
                type="checkbox"
                checked={settings.autoCreditCardFee}
                onChange={(e) => handleSettingChange('autoCreditCardFee', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>⏱️ Order Wait Times (ETA)</h2>
        <p className="section-description">
          Control how long the AI tells customers to wait. Adjust the rush slider when you're busy!
        </p>
        
        {/* Rush Mode Slider - Most Important Control */}
        <div className="eta-rush-control">
          <div className="rush-header">
            <label className="setting-label">Current Rush Level</label>
            <span className={`rush-badge rush-${getRushLabel(settings.etaRushMultiplier).toLowerCase().replace(' ', '-')}`}>
              {getRushLabel(settings.etaRushMultiplier)}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="2"
            step="0.1"
            value={settings.etaRushMultiplier}
            onChange={(e) => handleSettingChange('etaRushMultiplier', parseFloat(e.target.value))}
            className="rush-slider"
          />
          <div className="rush-labels">
            <span>Normal</span>
            <span>Busy</span>
            <span>Very Busy</span>
            <span>Slammed</span>
          </div>
          <p className="rush-preview">
            AI will quote: Pickup ~{Math.round(settings.etaPickupBaseMinutes * settings.etaRushMultiplier)}-{Math.round((settings.etaPickupBaseMinutes + settings.etaPickupRangeMinutes) * settings.etaRushMultiplier)} min
            {settings.acceptDelivery && <>, Delivery ~{Math.round(settings.etaDeliveryBaseMinutes * settings.etaRushMultiplier)}-{Math.round((settings.etaDeliveryBaseMinutes + settings.etaDeliveryRangeMinutes) * settings.etaRushMultiplier)} min</>}
          </p>
        </div>

        <div className="eta-grid">
          <div className="eta-column">
            <h3>🚗 Pickup</h3>
            <div className="setting-row">
              <label className="setting-label">Base time</label>
              <div className="input-group">
                <input
                  type="number"
                  value={settings.etaPickupBaseMinutes}
                  onChange={(e) => handleSettingChange('etaPickupBaseMinutes', parseInt(e.target.value) || 0)}
                  className="number-input"
                  min="5"
                  max="120"
                />
                <span className="unit">min</span>
              </div>
            </div>
            <div className="setting-row">
              <label className="setting-label">Range (+/-)</label>
              <div className="input-group">
                <input
                  type="number"
                  value={settings.etaPickupRangeMinutes}
                  onChange={(e) => handleSettingChange('etaPickupRangeMinutes', parseInt(e.target.value) || 0)}
                  className="number-input"
                  min="0"
                  max="30"
                />
                <span className="unit">min</span>
              </div>
            </div>
          </div>

          {settings.acceptDelivery && (
            <div className="eta-column">
              <h3>🛵 Delivery</h3>
              <div className="setting-row">
                <label className="setting-label">Base time</label>
                <div className="input-group">
                  <input
                    type="number"
                    value={settings.etaDeliveryBaseMinutes}
                    onChange={(e) => handleSettingChange('etaDeliveryBaseMinutes', parseInt(e.target.value) || 0)}
                    className="number-input"
                    min="10"
                    max="180"
                  />
                  <span className="unit">min</span>
                </div>
              </div>
              <div className="setting-row">
                <label className="setting-label">Range (+/-)</label>
                <div className="input-group">
                  <input
                    type="number"
                    value={settings.etaDeliveryRangeMinutes}
                    onChange={(e) => handleSettingChange('etaDeliveryRangeMinutes', parseInt(e.target.value) || 0)}
                    className="number-input"
                    min="0"
                    max="60"
                  />
                  <span className="unit">min</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <details className="eta-advanced">
          <summary>Advanced ETA Settings</summary>
          <div className="settings-list">
            <div className="setting-row">
              <label className="setting-label">Extra time per pizza (after first)</label>
              <div className="input-group">
                <input
                  type="number"
                  value={settings.etaPerPizzaMinutes}
                  onChange={(e) => handleSettingChange('etaPerPizzaMinutes', parseInt(e.target.value) || 0)}
                  className="number-input"
                  min="0"
                  max="15"
                />
                <span className="unit">min</span>
              </div>
            </div>
            <div className="setting-row">
              <label className="setting-label">Extra time per side item</label>
              <div className="input-group">
                <input
                  type="number"
                  value={settings.etaPerSideMinutes}
                  onChange={(e) => handleSettingChange('etaPerSideMinutes', parseInt(e.target.value) || 0)}
                  className="number-input"
                  min="0"
                  max="10"
                />
                <span className="unit">min</span>
              </div>
            </div>
          </div>
        </details>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="save-section">
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? '⏳ Saving...' : '💾 Save All Settings'}
        </button>
      </div>
    </div>
  );
}

export default HoursSettings;

