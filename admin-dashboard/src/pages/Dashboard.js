import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import TabNavigation from '../components/TabNavigation';
import TodaysOrders from '../components/tabs/TodaysOrders';
import CreateOrder from '../components/tabs/CreateOrder';
import HoursSettings from '../components/tabs/HoursSettings';
import LoyaltyPromos from '../components/tabs/LoyaltyPromos';
import CallLogs from '../components/tabs/CallLogs';
import Reports from '../components/tabs/Reports';
import BillingAccount from '../components/tabs/BillingAccount';
import '../styles/Dashboard.css';

const TABS = [
  { id: 'orders', label: "Orders", icon: '📋' },
  { id: 'create', label: 'Create Order', icon: '➕' },
  { id: 'hours', label: 'Hours & Settings', icon: '⏰' },
  { id: 'loyalty', label: 'Loyalty & Promos', icon: '🎁' },
  { id: 'calls', label: 'Call Logs', icon: '📞' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'billing', label: 'Billing & Account', icon: '💳' },
];

function Dashboard() {
  const { restaurantId } = useParams();
  const [activeTab, setActiveTab] = useState('create');
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem('darkMode') === 'true' || 
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'orders':
        return <TodaysOrders restaurantId={restaurantId} />;
      case 'create':
        return <CreateOrder restaurantId={restaurantId} />;
      case 'hours':
        return <HoursSettings restaurantId={restaurantId} />;
      case 'loyalty':
        return <LoyaltyPromos restaurantId={restaurantId} />;
      case 'calls':
        return <CallLogs restaurantId={restaurantId} />;
      case 'reports':
        return <Reports restaurantId={restaurantId} />;
      case 'billing':
        return <BillingAccount restaurantId={restaurantId} />;
      default:
        return <CreateOrder restaurantId={restaurantId} />;
    }
  };

  return (
    <div className="app-container">
      <TabNavigation
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        darkMode={darkMode}
        onDarkModeToggle={() => setDarkMode(!darkMode)}
      />
      <main className="dashboard-main">
        {renderTabContent()}
      </main>
    </div>
  );
}

export default Dashboard;

