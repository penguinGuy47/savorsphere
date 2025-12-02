'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { getSettings } from '@/lib/api';

function CartPreviewDrawer() {
  const { cart, updateQuantity, removeItem, isCartOpen, setIsCartOpen } = useCart();
  const router = useRouter();
  const [settings, setSettings] = useState({ taxRate: 9.0 });

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings({
          taxRate: Number(s?.taxRate ?? 0),
        });
      })
      .catch(console.error);
  }, []);

  // Close drawer on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isCartOpen) {
        setIsCartOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isCartOpen, setIsCartOpen]);

  // Close drawer on scroll
  useEffect(() => {
    if (!isCartOpen) return;

    const handleScroll = () => {
      setIsCartOpen(false);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isCartOpen, setIsCartOpen]);

  // Close drawer on click outside
  useEffect(() => {
    if (!isCartOpen) return;

    const handleClickOutside = (e) => {
      const cartDrawer = document.querySelector('[data-cart-drawer]');
      // Don't close if clicking on:
      // 1. The cart icon button
      // 2. Inside the cart drawer
      // 3. ItemCard add buttons (buttons with data-item-card-button attribute)
      const isCartIconButton = e.target.closest('button[aria-label*="View Order"]') || 
                                e.target.closest('button[aria-label*="View cart"]');
      const isItemCardButton = e.target.closest('button[data-item-card-button]');
      
      if (cartDrawer && !cartDrawer.contains(e.target) && !isCartIconButton && !isItemCardButton) {
        setIsCartOpen(false);
      }
    };

    // Small delay to avoid immediate close when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isCartOpen, setIsCartOpen]);

  const subtotal = cart.reduce((sum, item) => {
    const itemPrice = Number(item?.price);
    const qty = Number(item?.quantity) || 0;
    return sum + (isNaN(itemPrice) ? 0 : itemPrice) * qty;
  }, 0);

  const taxRate = Number(settings.taxRate) || 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    router.push('/checkout');
  };

  return (
    <>
      {/* Drawer */}
      <div 
        data-cart-drawer
        className={`fixed top-0 right-0 h-full w-96 rounded-lg bg-white shadow-2xl z-[80] hidden md:flex flex-col transform transition-all duration-300 ease-in-out ${
          isCartOpen 
            ? 'translate-x-0 opacity-100' 
            : 'translate-x-full opacity-0 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6">
          <button
            onClick={() => setIsCartOpen(false)}
            className="text-gray-500 hover:text-gray-800 font-bold text-2xl transition-colors"
            aria-label="Close cart"
          >
            &times;
          </button>
        </div>

        {/* Cart Items */}
        <div className="overflow-y-auto flex-grow px-6 py-4">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">Add an item from the menu to start your order.</p>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-black hover:text-[#dc2626] transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => {
                const itemTotal = (Number(item.price) * Number(item.quantity || 0)).toFixed(2);
                const optionsText = item.options
                  ? Object.entries(item.options)
                      .filter(([key, value]) => {
                        if (key === 'rice') {
                          return item.options.mealType === 'lunch';
                        }
                        if (key === 'mealType') {
                          return false;
                        }
                        return true;
                      })
                      .map(([key, value]) => {
                        if (key === 'rice') {
                          return `Rice ${value.charAt(0).toUpperCase() + value.slice(1)}`;
                        }
                        return `${key.charAt(0).toUpperCase() + key.slice(1)} ${value}`;
                      })
                      .filter(Boolean)
                      .join(' ')
                  : '';

                return (
                  <div key={`${item.itemId}-${JSON.stringify(item.options)}`} className="pb-4 border-b last:border-b-0">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="font-semibold">{item.name}</div>
                        {optionsText && (
                          <div className="text-sm text-gray-600 mt-1">{optionsText}</div>
                        )}
                        <div className="font-semibold text-black mt-2">
                          ${Number(item.price).toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center border rounded">
                          <button
                            onClick={() => updateQuantity(item.itemId, item.quantity - 1)}
                            className="px-2 py-1 hover:bg-gray-100 transition-colors"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="px-3 py-1 min-w-[2rem] text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.itemId, item.quantity + 1)}
                            className="px-2 py-1 hover:bg-gray-100 transition-colors"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <div className="font-semibold text-right min-w-[4rem]">
                          ${itemTotal}
                        </div>
                        <button
                          onClick={() => removeItem(item.itemId)}
                          className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                          aria-label="Remove item"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with Total and Checkout Button */}
        {cart.length > 0 && (
          <div className="border-t p-6 bg-gray-50">
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold pt-2 border-t">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handleProceedToCheckout}
              className="w-full bg-[#1A3636] text-white py-4 px-6 rounded-full font-semibold text-lg hover:bg-[#40534C] transition-colors"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default CartPreviewDrawer;

