'use client';
import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';

function FloatingCartIcon() {
  const { cart, cartCount } = useCart();
  const router = useRouter();
  const pathname = usePathname();

  // Calculate subtotal
  const subtotal = cart.reduce((sum, item) => {
    const itemPrice = Number(item?.price);
    const qty = Number(item?.quantity) || 0;
    return sum + (isNaN(itemPrice) ? 0 : itemPrice) * qty;
  }, 0);

  // Hide on cart/checkout pages
  if (pathname === '/cart' || pathname === '/checkout') {
    return null;
  }

  const handleClick = () => {
    router.push('/cart');
  };

  return (
    <>
      {/* Mobile: Full-width bar at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none md:hidden">
        {cartCount > 0 && (
          <button 
            className="w-full bg-[#ef4444] text-white py-4 px-6 shadow-xl rounded-full flex items-center justify-between transition-all duration-300 hover:bg-[#dc2626] active:scale-95 pointer-events-auto"
            onClick={handleClick}
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-full px-3 py-1.5 font-semibold text-base min-w-[2rem] text-center">
                {cartCount}
              </div>
              <span className="font-semibold text-lg">View Cart</span>
            </div>
            <span className="font-bold text-xl">
              ${subtotal.toFixed(2)}
            </span>
          </button>
        )}
      </div>

      {/* Desktop: Cart icon at top-right */}
      <div className="fixed top-4 right-4 z-[60] pointer-events-none hidden md:block">
        <button 
          className="bg-white text-gray-700 p-3 shadow-lg rounded-full flex items-center gap-2 transition-all duration-300 hover:bg-gray-50 active:scale-95 pointer-events-auto border border-gray-200"
          onClick={handleClick}
          aria-label={cartCount > 0 ? `View cart (${cartCount} items)` : 'View cart'}
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
            <span className="bg-[#ef4444] text-white rounded-full px-2 py-0.5 font-bold text-sm min-w-[1.5rem] text-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </>
  );
}

export default FloatingCartIcon;