'use client';
import React, { createContext, useState, useContext, useEffect } from 'react';

export const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

const CART_STORAGE_KEY = 'savorSphere_cart';
const CART_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes in milliseconds

// Helper functions for localStorage with expiration
const saveCartToStorage = (cartItems) => {
  try {
    const cartData = {
      items: cartItems,
      timestamp: Date.now(),
    };
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartData));
  } catch (error) {
    console.error('Error saving cart to localStorage:', error);
  }
};

const loadCartFromStorage = () => {
  try {
    const cartData = localStorage.getItem(CART_STORAGE_KEY);
    if (!cartData) return null;

    const parsed = JSON.parse(cartData);
    const now = Date.now();
    
    // Check if cart has expired (30 minutes)
    if (now - parsed.timestamp > CART_EXPIRY_TIME) {
      localStorage.removeItem(CART_STORAGE_KEY);
      return null;
    }

    return parsed.items || [];
  } catch (error) {
    console.error('Error loading cart from localStorage:', error);
    return null;
  }
};

export function CartProvider({ children }) {
  // Initialize cart from localStorage on mount
  const [cart, setCart] = useState(() => {
    if (typeof window !== 'undefined') {
      return loadCartFromStorage() || [];
    }
    return [];
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      saveCartToStorage(cart);
    }
  }, [cart]);

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


