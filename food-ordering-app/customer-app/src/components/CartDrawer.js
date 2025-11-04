'use client';
import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCart } from '@/context/CartContext';
import { createPaymentIntent, createOrder, getSettings } from '@/lib/api';
import OrderTypeSelector from './OrderTypeSelector';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

function CartDrawer({ onClose }) {
  const { cart, setCart, updateQuantity } = useCart();
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', orderType: 'pickup', address: '', tip: 0, table: '', instructions: '' });
  const [settings, setSettings] = useState({ deliveryEnabled: true, pickupEnabled: true, dineInEnabled: true, taxRate: 9.0 });
  const stripe = useStripe();
  const elements = useElements();

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

  const handleCheckout = async () => {
    console.log("Starting checkout process...");
    console.log("Cart contents:", cart);
    console.log("Subtotal:", subtotal, "Tax:", tax, "Tip:", tipAmount, "TaxRate:", taxRate);
    console.log("Calculated Total:", total);
    console.log("Form data:", formData);

    if (!stripe || !elements) {
      console.error("Stripe.js has not loaded yet. Aborting checkout.");
      return;
    }

    try {
      console.log("Attempting to create payment intent with total:", total);
      const { clientSecret } = await createPaymentIntent({ items: cart, total });

      if (!clientSecret) {
        console.error("Failed to retrieve client secret from the backend.");
        return;
      }
      console.log("Successfully created payment intent.");

      console.log("Confirming card payment with Stripe...");
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });

      if (result.error) {
        console.error("Stripe card confirmation error:", result.error.message);
        return;
      } 
      
      console.log("Payment successful:", result.paymentIntent);
      console.log("Creating order in the database...");
        const order = await createOrder({ ...formData, items: cart, total, paymentId: result.paymentIntent.id });
      console.log("Order created successfully:", order);

        setCart([]);
        onClose();
        window.location.href = `/confirmation/${order.orderId}`;

    } catch (error) {
      console.error('A critical error occurred during checkout:', error);
      if (error.response) {
        console.error("Error Response Data:", error.response.data);
        console.error("Error Response Status:", error.response.status);
      } else if (error.request) {
        console.error("No response received for the request:", error.request);
      } else {
        console.error('Error setting up the request:', error.message);
      }
    }
  };

  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-lg z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="font-bold text-lg">Your Cart</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 font-bold text-2xl">&times;</button>
      </div>
      
      <div className="overflow-y-auto flex-grow">
        {cart.length === 0 ? (
          <p className="p-4 text-center text-gray-500">Your cart is empty.</p>
        ) : (
          cart.map((item) => {
            const itemTotal = (Number(item.price) * Number(item.quantity || 0)).toFixed(2);
            const optionsText = item.options
              ? Object.entries(item.options)
                  .filter(([key, value]) => {
                    // Only show rice option if mealType is lunch
                    if (key === 'rice') {
                      return item.options.mealType === 'lunch';
                    }
                    // Don't show mealType in the options text (only rice)
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
              <div key={item.itemId} className="p-4 border-b">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="font-semibold">{item.name}</div>
                    {optionsText && (
                      <div className="text-sm text-gray-600 mt-1">{optionsText}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center border rounded">
                      <button
                        onClick={() => updateQuantity(item.itemId, item.quantity - 1)}
                        className="px-2 py-1 hover:bg-gray-100"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="px-3 py-1 min-w-[2rem] text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.itemId, item.quantity + 1)}
                        className="px-2 py-1 hover:bg-gray-100"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <div className="font-semibold text-right min-w-[4rem]">
                      ${itemTotal}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {cart.length > 0 && (
        <div className="p-4 border-t">
          <div className="mb-4">
        Subtotal: ${subtotal.toFixed(2)}<br />
        Tax: ${tax.toFixed(2)}<br />
        Total: ${total.toFixed(2)}
      </div>
          <form>
        <input className="border p-2 mb-2 w-full" placeholder="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        <input className="border p-2 mb-2 w-full" placeholder="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
        <input className="border p-2 mb-2 w-full" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
        <OrderTypeSelector onChange={(type) => setFormData({ ...formData, orderType: type })} settings={settings} />
        {formData.orderType === 'delivery' && <input className="border p-2 mb-2 w-full" placeholder="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />}
            {formData.orderType === 'delivery' && <input className="border p-2 mb-2 w-full" type="number" placeholder="Tip" value={formData.tip} onChange={(e) => setFormData({ ...formData, tip: parseFloat(e.target.value) || 0 })} />}
        {formData.orderType === 'dine-in' && <input className="border p-2 mb-2 w-full" placeholder="Table Number" value={formData.table} onChange={(e) => setFormData({ ...formData, table: e.target.value })} />}
        <textarea className="border p-2 mb-2 w-full" placeholder="Special Instructions" value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} />
        <CardElement className="border p-2 mb-2" />
        <button type="button" onClick={handleCheckout} className="button-primary mt-4 w-full">Pay & Place Order</button>
      </form>
        </div>
      )}
    </div>
  );
}

export default function CartDrawerWrapper({ onClose }) {
  return (
    <Elements stripe={stripePromise}>
      <CartDrawer onClose={onClose} />
    </Elements>
  );
}