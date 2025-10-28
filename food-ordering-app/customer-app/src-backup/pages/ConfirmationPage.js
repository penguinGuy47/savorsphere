import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getOrder } from '../services/api';

function ConfirmationPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    getOrder(orderId).then(setOrder);
  }, [orderId]);

  if (!order) return <div>Loading...</div>;

  return (
    <div className="card">
      <h2>Order Confirmed: {order.orderId}</h2>
      <p>Estimated Time: 30 min</p>
      <p>Total: ${order.total.toFixed(2)}</p>
      {/* Item summary, receipt details */}
    </div>
  );
}

export default ConfirmationPage;