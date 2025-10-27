import React, { useContext, useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CartContext } from '../App';
import { createPaymentIntent, createOrder, getSettings } from '../services/api';
import OrderTypeSelector from './OrderTypeSelector';

const stripePromise = loadStripe('pk_test_your_test_key'); // Replace with your Stripe public key

function CartDrawer({ onClose }) {
  const { cart, setCart } = useContext(CartContext);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', orderType: 'pickup', address: '', tip: 0, table: '', instructions: '' });
  const [settings, setSettings] = useState({ deliveryEnabled: true, pickupEnabled: true, dineInEnabled: true, taxRate: 9.0 });
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * (settings.taxRate / 100);
  const total = subtotal + tax + (formData.tip || 0);

  const handleCheckout = async () => {
    try {
      const { clientSecret } = await createPaymentIntent({ items: cart, total });
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
      if (result.error) {
        console.error(result.error);
      } else {
        const order = await createOrder({ ...formData, items: cart, total, paymentId: result.paymentIntent.id });
        setCart([]);
        onClose();
        window.location.href = `/confirmation/${order.orderId}`;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    }
  };

  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-lg z-50">
      <h2 className="p-4 font-bold">Cart</h2>
      {cart.map((item) => (
        <div key={item.itemId} className="p-2 border-b">
          {item.name} x {item.quantity} - ${ (item.price * item.quantity).toFixed(2) }
        </div>
      ))}
      <div className="p-4">
        Subtotal: ${subtotal.toFixed(2)}<br />
        Tax: ${tax.toFixed(2)}<br />
        Total: ${total.toFixed(2)}
      </div>
      <form className="p-4">
        <input className="border p-2 mb-2 w-full" placeholder="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        <input className="border p-2 mb-2 w-full" placeholder="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
        <input className="border p-2 mb-2 w-full" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
        <OrderTypeSelector onChange={(type) => setFormData({ ...formData, orderType: type })} settings={settings} />
        {formData.orderType === 'delivery' && <input className="border p-2 mb-2 w-full" placeholder="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />}
        {formData.orderType === 'delivery' && <input className="border p-2 mb-2 w-full" type="number" placeholder="Tip" value={formData.tip} onChange={(e) => setFormData({ ...formData, tip: parseFloat(e.target.value) })} />}
        {formData.orderType === 'dine-in' && <input className="border p-2 mb-2 w-full" placeholder="Table Number" value={formData.table} onChange={(e) => setFormData({ ...formData, table: e.target.value })} />}
        <textarea className="border p-2 mb-2 w-full" placeholder="Special Instructions" value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} />
        <CardElement className="border p-2 mb-2" />
        <button type="button" onClick={handleCheckout} className="button-primary mt-4 w-full">Pay & Place Order</button>
      </form>
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