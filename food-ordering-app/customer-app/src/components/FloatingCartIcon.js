'use client';
import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';

function FloatingCartIcon() {
  const { cart, cartCount, setIsCartOpen } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  // Track when component has mounted to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Calculate subtotal
  const subtotal = cart.reduce((sum, item) => {
    const itemPrice = Number(item?.price);
    const qty = Number(item?.quantity) || 0;
    return sum + (isNaN(itemPrice) ? 0 : itemPrice) * qty;
  }, 0);

  // Hide on cart/checkout pages
  // On item detail pages, hide mobile/tablet cart icon (they have their own button), but show desktop icon
  const isItemDetailPage = pathname?.startsWith('/item/');
  if (pathname === '/cart' || pathname === '/checkout') {
    return null;
  }

  const handleClick = () => {
    // Desktop: Open drawer, Mobile: Navigate to cart page
    if (window.innerWidth >= 768) {
      setIsCartOpen(true);
    } else {
      router.push('/cart');
    }
  };

  // Don't render cart-dependent content until after hydration to avoid mismatch
  if (!isMounted) {
    return null;
  }

  return (
    <>
      {/* Mobile: Full-width bar at bottom - Hide on item detail pages */}
      {!isItemDetailPage && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none md:hidden">
          {cartCount > 0 && (
            <button 
              className="w-full bg-[#020403] text-white py-4 px-6 shadow-xl rounded-full flex items-center justify-between transition-all duration-300 hover:bg-[#dc2626] active:scale-95 pointer-events-auto"
              onClick={handleClick}
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full px-3 py-1.5 font-semibold text-base min-w-[2rem] text-center">
                  {cartCount}
                </div>
                <span className="font-semibold text-lg">View Order</span>
              </div>
              <span className="font-bold text-xl">
                ${subtotal.toFixed(2)}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Desktop: Cart icon at top-right - Show on all pages except cart/checkout */}
      <div className="fixed top-2 right-4 z-[60] pointer-events-none hidden md:block">
        <button 
          className="bg-white text-gray-700 p-3 shadow-lg rounded-full flex items-center gap-2.5 transition-all duration-300 hover:bg-gray-50 active:scale-95 pointer-events-auto border border-gray-200"
          onClick={handleClick}
          aria-label={cartCount > 0 ? `View Order (${cartCount} items)` : 'View Order'}
        >
          <svg 
            className="w-6 h-6" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" 
            />
          </svg>
          {cartCount > 0 && (
            <span className="bg-[#677D6A] text-white rounded-full px-2 py-0.5 font-bold text-sm min-w-[1.5rem] text-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </>
  );
}

export default FloatingCartIcon;