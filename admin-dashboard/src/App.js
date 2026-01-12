import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import KitchenView from './pages/KitchenView';
import MenuView from './pages/MenuView';
import AuthCallback from './pages/AuthCallback';
import './App.css';

function App() {
  // Default restaurant ID for demo purposes
  const DEFAULT_RESTAURANT_ID = 'demo123';

  return (
    <Router>
      <Routes>
        {/* OAuth callback route */}
        <Route path="/callback" element={<AuthCallback />} />
        
        {/* Main routes */}
        <Route path="/" element={<Navigate to={`/${DEFAULT_RESTAURANT_ID}`} replace />} />
        <Route path="/:restaurantId" element={<Dashboard />} />
        <Route path="/:restaurantId/kitchen" element={<KitchenView />} />
        <Route path="/:restaurantId/menu" element={<MenuView />} />
      </Routes>
    </Router>
  );
}

export default App;
