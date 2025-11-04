'use client';
import React, { createContext, useState, useContext } from 'react';

export const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.itemId === item.itemId);
      if (existing) {
        return prev.map((i) =>
          i.itemId === item.itemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeItem(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const removeItem = (itemId) => {
    setCart((prev) => prev.filter((item) => item.itemId !== itemId));
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const value = {
    cart,
    setCart,
    addToCart,
    updateQuantity,
    removeItem,
    cartCount,
    isCartOpen,
    setIsCartOpen,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}


