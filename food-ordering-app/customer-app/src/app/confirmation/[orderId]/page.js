'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getOrder } from '@/lib/api';

function ConfirmationPage() {
  const params = useParams();
  const orderId = params.orderId;
  const [order, setOrder] = useState(null);

  useEffect(() => {
    getOrder(orderId).then(setOrder);
  }, [orderId]);

  if (!order) return <div>Loading...</div>;

  return (
    <div className="card">
      <h2>Order Confirmed: {order.orderId}</h2>
      <p>Estimated Time: {order.etaMinutes ?? 30} min</p>
      <p>Total: ${Number(order.total).toFixed(2)}</p>
      {/* Item summary, receipt details */}
    </div>
  );
}

export default ConfirmationPage;
