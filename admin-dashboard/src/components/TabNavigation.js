import React, { useState, useEffect } from 'react';
import VirtualKeyboard from './VirtualKeyboard';
import './TabNavigation.css';

function TabNavigation({ tabs, activeTab, onTabChange, darkMode, onDarkModeToggle }) {
  const [showKeyboard, setShowKeyboard] = useState(false);

  return (
    <nav className="tab-navigation">
      <div className="nav-header">
        <h1 className="nav-title">Savor Sphere Admin</h1>
        <div className="nav-actions">
          <button
            className={`keyboard-toggle ${showKeyboard ? 'active' : ''}`}
            onClick={() => setShowKeyboard(!showKeyboard)}
            aria-label="Toggle virtual keyboard"
            title="Virtual Keyboard"
          >
            ⌨️
          </button>
          <button
            className="dark-mode-toggle"
            onClick={onDarkModeToggle}
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
      <div className="tab-list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
      <VirtualKeyboard
        isVisible={showKeyboard}
        onClose={() => setShowKeyboard(false)}
      />
    </nav>
  );
}

export default TabNavigation;

