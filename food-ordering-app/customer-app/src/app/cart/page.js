'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { getSettings } from '@/lib/api';

export default function CartPage() {
  const { cart, updateQuantity, removeItem } = useCart();
  const router = useRouter();
  const [settings, setSettings] = React.useState({ taxRate: 9.0 });

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings({
          taxRate: Number(s?.taxRate ?? 0),
        });
      })
      .catch(console.error);
  }, []);

  const subtotal = cart.reduce((sum, item) => {
    const itemPrice = Number(item?.price);
    const qty = Number(item?.quantity) || 0;
    return sum + (isNaN(itemPrice) ? 0 : itemPrice) * qty;
  }, 0);

  const taxRate = Number(settings.taxRate) || 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-4">Your Order</h1>
          <p className="text-gray-500 mb-8">Add an item from the menu to start your order.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-[#677D6A] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#D6BD98] transition-colors"
          >
            Continue Ordering
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Your Order</h1>

        <button
          onClick={() => router.push('/')}
          className="text-[#677D6A] hover:text-[#D6BD98] transition-colors"
        >
          ← Continue Ordering
        </button>

        <div className="border-b border-gray-200 my-4"></div>

        <div className="bg-white rounded-lg shadow-sm mb-6">
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
              <div key={item.itemId} className="p-4 border-b last:border-b-0">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{item.name}</div>
                    {optionsText && (
                      <div className="text-sm text-gray-600 mt-1">{optionsText}</div>
                    )}
                    <div className="text-lg font-bold text-black mt-2">
                      ${Number(item.price).toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center border rounded">
                      <button
                        onClick={() => updateQuantity(item.itemId, item.quantity - 1)}
                        className="px-3 py-2 hover:bg-gray-100 transition-colors"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="px-4 py-2 min-w-[3rem] text-center font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.itemId, item.quantity + 1)}
                        className="px-3 py-2 hover:bg-gray-100 transition-colors"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <div className="font-bold text-lg text-right min-w-[5rem]">
                      ${itemTotal}
                    </div>
                    <button
                      onClick={() => removeItem(item.itemId)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      aria-label="Remove item"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-2xl font-bold pt-4 border-t">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => router.push('/checkout')}
            className="w-full bg-[#1A3636] text-white py-4 px-6 rounded-full font-semibold text-lg hover:bg-[#40534C] transition-colors"
          >
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  );
}

