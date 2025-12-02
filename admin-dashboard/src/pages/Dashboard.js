import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import TabNavigation from '../components/TabNavigation';
import TodaysOrders from '../components/tabs/TodaysOrders';
import CreateOrder from '../components/tabs/CreateOrder';
import HoursSettings from '../components/tabs/HoursSettings';
import MenuEditor from '../components/tabs/MenuEditor';
import '../styles/Dashboard.css';

const TABS = [
  { id: 'orders', label: "Orders", icon: '📋' },
  { id: 'create', label: 'Create Order', icon: '➕' },
  { id: 'menu', label: 'Menu Editor', icon: '📝' },
  { id: 'hours', label: 'Hours & Settings', icon: '⏰' },
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
      case 'menu':
        return <MenuEditor restaurantId={restaurantId} />;
      case 'hours':
        return <HoursSettings restaurantId={restaurantId} />;
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

