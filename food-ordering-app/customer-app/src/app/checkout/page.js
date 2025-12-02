'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCart } from '@/context/CartContext';
import { createPaymentIntent, createOrder, getSettings, sendOTP, verifyOTP } from '@/lib/api';
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
    instructions: '',
    paymentMethod: 'online' // 'online' or 'in-store'
  });
  const [settings, setSettings] = useState({ 
    deliveryEnabled: true, 
    pickupEnabled: true, 
    dineInEnabled: true, 
    taxRate: 9.0 
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
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

  const handleSendOTP = async () => {
    if (!formData.phone.trim()) {
      setError('Please enter your phone number first');
      return;
    }

    setIsSendingOTP(true);
    setError(null);

    try {
      await sendOTP(formData.phone);
      setOtpSent(true);
      setPhoneVerified(false);
      setOtpCode('');
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to send OTP. Please try again.');
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      setError('Please enter a valid 6-digit OTP code');
      return;
    }

    setIsVerifyingOTP(true);
    setError(null);

    try {
      const result = await verifyOTP(formData.phone, otpCode);
      if (result.verified) {
        setPhoneVerified(true);
        setOtpSent(false);
        setOtpCode('');
      } else {
        setError(result.error || 'Invalid OTP code. Please try again.');
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to verify OTP. Please try again.');
    } finally {
      setIsVerifyingOTP(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    if (formData.orderType === 'delivery' && !formData.address.trim()) {
      setError('Please enter your delivery address');
      return;
    }

    // Phone verification required for in-store payments
    if (formData.paymentMethod === 'in-store' && !phoneVerified) {
      setError('Please verify your phone number before placing an order');
      return;
    }

    // Payment validation for online payments
    if (formData.paymentMethod === 'online') {
      if (!stripe || !elements) {
        setError('Payment system is loading. Please wait...');
        return;
      }
    }

    setIsProcessing(true);

    try {
      console.log("Starting checkout process...");
      console.log("Cart contents:", cart);
      console.log("Subtotal:", subtotal, "Tax:", tax, "Tip:", tipAmount, "TaxRate:", taxRate);
      console.log("Calculated Total:", total);
      console.log("Form data:", formData);
      console.log("Payment method:", formData.paymentMethod);

      let paymentId = null;

      // Process payment only if paying online
      if (formData.paymentMethod === 'online') {
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
        paymentId = result.paymentIntent.id;
      } else {
        console.log("Skipping payment - customer will pay in store");
      }
      
      console.log("Creating order in the database...");
      const order = await createOrder({ 
        ...formData, 
        items: cart, 
        total, 
        paymentId: paymentId || null,
        paymentMethod: formData.paymentMethod
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
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => router.push('/cart')}
          className="text-3xl font-bold mb-6 text-[#677D6A] hover:text-[#D6BD98] transition-colors flex items-center gap-2"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Order
        </button>
        
        <div className="border-b border-gray-200 my-4"></div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - Form Sections */}
          
          <div className="md:col-span-2 space-y-6">
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
              <h2 className="text-xl font-semibold mb-4">Payment Method</h2>
              <div className="space-y-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="online"
                    checked={formData.paymentMethod === 'online'}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-4 h-4 text-[#ef4444] focus:ring-2 focus:ring-[#ef4444] border-gray-300"
                  />
                  <span className="ml-3 font-medium">Pay Online</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="in-store"
                    checked={formData.paymentMethod === 'in-store'}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-4 h-4 text-[#ef4444] focus:ring-2 focus:ring-[#ef4444] border-gray-300"
                  />
                  <span className="ml-3 font-medium">Pay In Store</span>
                </label>
              </div>
              {formData.paymentMethod === 'in-store' && (
                <p className="mt-3 text-sm text-gray-600">
                  You will pay when you pick up your order.
                </p>
              )}
            </div>

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
                <div>
                  <input
                    type="tel"
                    className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                    placeholder="Phone *"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({ ...formData, phone: e.target.value });
                      // Reset verification when phone changes
                      if (phoneVerified || otpSent) {
                        setPhoneVerified(false);
                        setOtpSent(false);
                        setOtpCode('');
                      }
                    }}
                    required
                    disabled={isSendingOTP || isVerifyingOTP}
                  />
                  
                  {/* Phone Verification Section - Only show for in-store payments */}
                  {formData.paymentMethod === 'in-store' && (
                    <div className="mt-4 space-y-3">
                      {!phoneVerified ? (
                        <>
                          {!otpSent ? (
                            <button
                              type="button"
                              onClick={handleSendOTP}
                              disabled={!formData.phone.trim() || isSendingOTP}
                              className="w-full bg-[#1A3636] text-white py-2 px-4 rounded-lg font-medium hover:bg-[#40534C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isSendingOTP ? 'Sending...' : 'Send Verification Code'}
                            </button>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                  Enter 6-digit verification code
                                </label>
                                <input
                                  type="text"
                                  maxLength="6"
                                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#ef4444] text-center text-2xl tracking-widest"
                                  placeholder="000000"
                                  value={otpCode}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                                    setOtpCode(value);
                                  }}
                                  disabled={isVerifyingOTP}
                                />
                                <p className="text-xs text-gray-500">
                                  We sent a verification code to {formData.phone}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleVerifyOTP}
                                  disabled={otpCode.length !== 6 || isVerifyingOTP}
                                  className="flex-1 bg-[#1A3636] text-white py-2 px-4 rounded-lg font-medium hover:bg-[#40534C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isVerifyingOTP ? 'Verifying...' : 'Verify Code'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOtpSent(false);
                                    setOtpCode('');
                                  }}
                                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                                  disabled={isVerifyingOTP}
                                >
                                  Change Number
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm font-medium text-green-800">Phone number verified</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
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

            {formData.paymentMethod === 'online' && (
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
            )}
          </div>

          {/* Right Column - Order Summary */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-4">
              <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
              
              {/* Items List */}
              <div className="mb-6 space-y-3 pb-6 border-b">
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
                    <div key={`${item.itemId}-${JSON.stringify(item.options)}`} className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{item.name}</div>
                        {optionsText && (
                          <div className="text-xs text-gray-500 mt-0.5">{optionsText}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          ${Number(item.price).toFixed(2)} × {item.quantity || 1}
                        </div>
                      </div>
                      <div className="font-semibold text-sm whitespace-nowrap">
                        ${itemTotal}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
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
                disabled={
                  isProcessing || 
                  (formData.paymentMethod === 'online' && !stripe) ||
                  (formData.paymentMethod === 'in-store' && !phoneVerified)
                }
                className="w-full bg-[#1A3636] text-white py-4 px-6 rounded-full font-semibold text-lg hover:bg-[#40534C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing 
                  ? 'Processing...' 
                  : formData.paymentMethod === 'online'
                    ? 'Pay & Place Order'
                    : 'Place Order'
                }
              </button>
            </div>
          </div>
        </form>
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



