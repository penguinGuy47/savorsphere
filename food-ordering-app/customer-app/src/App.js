import React, { createContext, useState } from 'react';
import {BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MenuPage from './pages/MenuPage';
import ItemDetailsPage from './pages/ItemDetailsPage';
import ConfirmationPage from './pages/ConfirmationPage';
import FloatingCartIcon from './components/FloatingCartIcon';
import CartDrawerWrapper from './components/CartDrawer';

export const CartContext = createContext();

function App() {
  const [cart, setCart] = useState([]); // Array of {itemId, name, quantity, price, options}
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.itemId === item.itemId);
      if (existing) {
        // If the item exists, we increase qty by +1
        return prev.map((i) =>
          i.itemId === item.itemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
        // If doesn't exist, we add the item to cart and set qty = 1
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, setCart, cartCount }}>
      <Router>
        <div classname="container mxauto p-4">
          <Routes>
            <Route path="/" element={<MenuPage />} />
            <Route path="/item/:itemId" element={<ItemDetailsPage />} />
            <Route path="/confirmation/:orderId" element={<ConfirmationPage />} />
          </Routes>
          <FloatingCartIcon onClick={() => setIsCartOpen(!isCartOpen)} />
          {isCartOpen && <CartDrawerWrapper onClose={() => setIsCartOpen(false)} />}
        </div>
      </Router>
    </CartContext.Provider>
  );
}

export default App;
