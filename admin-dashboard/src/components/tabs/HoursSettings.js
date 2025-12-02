import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../../services/api';
import './HoursSettings.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function HoursSettings({ restaurantId }) {
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
    voiceGreeting: 'Welcome to our restaurant! How can I help you today?',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Load settings and hours on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Load hours from localStorage (not saved to DynamoDB)
        const hoursKey = `restaurant-hours-${restaurantId || 'default'}`;
        const savedHours = localStorage.getItem(hoursKey);
        if (savedHours) {
          try {
            const parsedHours = JSON.parse(savedHours);
            setHours(parsedHours);
          } catch (e) {
            console.error('Error parsing saved hours:', e);
          }
        }
        
        // Load settings from DynamoDB
        if (restaurantId) {
          const data = await getSettings(restaurantId);
          
          // Map DynamoDB fields to frontend state
          if (data) {
            setSettings({
              acceptDelivery: data.deliveryEnabled ?? true,
              minDeliveryOrder: data.minDeliveryOrder ?? 30,
              deliveryFee: data.deliveryFee ?? 4,
              taxRate: data.taxRate ?? 8.875,
              autoCreditCardFee: data.autoCreditCardFee ?? true,
              voiceGreeting: data.voiceGreeting || 'Welcome to our restaurant! How can I help you today?',
            });
          }
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        // Keep default values on error
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
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
    if (!restaurantId) {
      alert('Error: Restaurant ID is required');
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Save hours to localStorage (not DynamoDB)
      const hoursKey = `restaurant-hours-${restaurantId}`;
      localStorage.setItem(hoursKey, JSON.stringify(hours));
      
      // Map frontend settings to DynamoDB fields (excluding hours)
      const settingsToSave = {
        deliveryEnabled: settings.acceptDelivery,
        pickupEnabled: true, // Default to true
        dineInEnabled: true, // Default to true (can be added to UI later)
        minDeliveryOrder: settings.minDeliveryOrder,
        deliveryFee: settings.deliveryFee,
        taxRate: settings.taxRate,
        autoCreditCardFee: settings.autoCreditCardFee,
        voiceGreeting: settings.voiceGreeting,
      };

      await updateSettings(settingsToSave, restaurantId);
      
      setSaveMessage({ type: 'success', text: 'Settings and hours saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="hours-settings">
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="hours-settings">
      {saveMessage && (
        <div className={`save-message ${saveMessage.type}`}>
          {saveMessage.text}
        </div>
      )}
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
        <h2>Voice Greeting</h2>
        <p className="section-description">
          Owner can type or record a new 5-second greeting that instantly updates the AI voice
        </p>
        <textarea
          className="voice-greeting-input"
          value={settings.voiceGreeting}
          onChange={(e) => handleSettingChange('voiceGreeting', e.target.value)}
          placeholder="Enter your greeting message..."
          rows="4"
        />
        <div className="voice-actions">
          <button className="record-btn">🎤 Record New Greeting</button>
          <button className="play-btn">▶️ Play Current</button>
        </div>
      </div>

      <div className="save-section">
        <button 
          className="save-btn" 
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? '💾 Saving...' : '💾 Save All Settings'}
        </button>
        <p className="save-note">
          Note: Business hours are stored locally and not saved to the database.
        </p>
      </div>
    </div>
  );
}

export default HoursSettings;

