'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCart } from '@/context/CartContext';
import { createPaymentIntent, createOrder, getSettings } from '@/lib/api';
import OrderTypeSelector from '@/components/OrderTypeSelector';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

function CheckoutForm() {
  const { cart, setCart } = useCart();
  const router = useRouter();
  const [formData, setFormData] = useState({ 
    name: '', 
    phone: '', 
    email: '', 
    orderType: 'pickup', 
    address: '', 
    tip: 0, 
    table: '', 
    instructions: '' 
  });
  const [settings, setSettings] = useState({ 
    deliveryEnabled: true, 
    pickupEnabled: true, 
    dineInEnabled: true, 
    taxRate: 9.0 
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    // Redirect if cart is empty
    if (cart.length === 0) {
      router.push('/cart');
    }
  }, [cart, router]);

  useEffect(() => {
    getSettings()
      .then((s) => {
        const normalized = {
          deliveryEnabled: s?.deliveryEnabled ?? true,
          pickupEnabled: s?.pickupEnabled ?? true,
          dineInEnabled: s?.dineInEnabled ?? true,
          taxRate: Number(s?.taxRate ?? 0),
        };
        setSettings((prev) => ({ ...prev, ...normalized }));
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
  const tipAmount = Number(formData.tip) || 0;
  const total = subtotal + tax + tipAmount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError('Payment system is loading. Please wait...');
      return;
    }

    // Basic validation
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    if (!formData.email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (formData.orderType === 'delivery' && !formData.address.trim()) {
      setError('Please enter your delivery address');
      return;
    }

    setIsProcessing(true);

    try {
      console.log("Starting checkout process...");
      console.log("Cart contents:", cart);
      console.log("Subtotal:", subtotal, "Tax:", tax, "Tip:", tipAmount, "TaxRate:", taxRate);
      console.log("Calculated Total:", total);
      console.log("Form data:", formData);

      console.log("Attempting to create payment intent with total:", total);
      const { clientSecret } = await createPaymentIntent({ items: cart, total });

      if (!clientSecret) {
        setError('Failed to process payment. Please try again.');
        setIsProcessing(false);
        return;
      }
      console.log("Successfully created payment intent.");

      console.log("Confirming card payment with Stripe...");
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });

      if (result.error) {
        setError(result.error.message);
        setIsProcessing(false);
        return;
      } 
      
      console.log("Payment successful:", result.paymentIntent);
      console.log("Creating order in the database...");
      const order = await createOrder({ 
        ...formData, 
        items: cart, 
        total, 
        paymentId: result.paymentIntent.id 
      });
      console.log("Order created successfully:", order);

      setCart([]);
      router.push(`/confirmation/${order.orderId}`);

    } catch (error) {
      console.error('A critical error occurred during checkout:', error);
      setError(error.message || 'An error occurred during checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  if (cart.length === 0) {
    return null; // Will redirect
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Checkout</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
            <div className="space-y-4">
              <input
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                placeholder="Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <input
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                placeholder="Phone *"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
              <input
                type="email"
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                placeholder="Email *"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Order Type</h2>
            <OrderTypeSelector 
              onChange={(type) => setFormData({ ...formData, orderType: type })} 
              settings={settings} 
            />
            {formData.orderType === 'delivery' && (
              <div className="mt-4 space-y-4">
                <input
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                  placeholder="Delivery Address *"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required={formData.orderType === 'delivery'}
                />
                <input
                  type="number"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                  placeholder="Tip Amount"
                  value={formData.tip}
                  onChange={(e) => setFormData({ ...formData, tip: parseFloat(e.target.value) || 0 })}
                />
              </div>
            )}
            {formData.orderType === 'dine-in' && (
              <div className="mt-4">
                <input
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                  placeholder="Table Number"
                  value={formData.table}
                  onChange={(e) => setFormData({ ...formData, table: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Special Instructions</h2>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
              placeholder="Any special instructions for your order..."
              rows={4}
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Payment Information</h2>
            <div className="border border-gray-300 rounded-lg p-4">
              <CardElement 
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#424770',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                    invalid: {
                      color: '#9e2146',
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tip</span>
                  <span>${tipAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-2xl font-bold pt-4 border-t">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing || !stripe}
              className="w-full bg-[#ef4444] text-white py-4 px-6 rounded-full font-semibold text-lg hover:bg-[#dc2626] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : 'Pay & Place Order'}
            </button>
          </div>
        </form>

        <button
          onClick={() => router.push('/cart')}
          className="mt-4 text-[#ef4444] hover:text-[#dc2626] transition-colors"
        >
          ← Back to Cart
        </button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  );
}

