import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { getOrders, updateOrderStatus } from '../../services/api';
import './TodaysOrders.css';

function TodaysOrders({ restaurantId }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pullStartY, setPullStartY] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      const filters = {};
      
      // Apply filters
      if (filter === 'pickup') filters.orderType = 'pickup';
      if (filter === 'delivery') filters.orderType = 'delivery';
      
      const data = await getOrders(filters);
      
      // Transform API data to match component expectations
      const transformedOrders = (data.orders || []).map(order => ({
        id: order.orderId || order.id,
        orderId: order.orderId || order.id,
        time: order.time instanceof Date ? order.time : new Date(order.createdAt || order.time),
        items: order.items || 'No items',
        total: order.total || 0,
        status: order.status || 'new',
        phone: order.phone || '',
        name: order.name || '',
        email: order.email || '',
        type: order.type || order.orderType || 'pickup',
        address: order.address || '',
        table: order.table || '',
        instructions: order.instructions || '',
      }));
      
      setOrders(transformedOrders);
      setTotalRevenue(data.totalRevenue || 0);
    } catch (error) {
      console.error('Error loading orders:', error);
      
      // Handle different error types
      if (error.message?.includes('Failed to fetch') || error.message?.includes('CORS')) {
        // Network/CORS error - endpoint likely not deployed
        console.warn('⚠️ GET /orders endpoint not available. This usually means:');
        console.warn('   1. The backend needs to be deployed (cdk deploy from backend directory)');
        console.warn('   2. Or the endpoint is not configured in API Gateway');
        setOrders([]);
        setTotalRevenue(0);
      } else if (error.status === 403 || error.message?.includes('403') || error.message?.includes('Forbidden')) {
        // 403 Forbidden - endpoint not deployed
        console.warn('⚠️ GET /orders endpoint returned 403. Please deploy the backend.');
        setOrders([]);
        setTotalRevenue(0);
      } else {
        // Other errors - keep existing orders if any
        console.error('Unexpected error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [filter]); // Reload when filter changes

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders();
    setIsRefreshing(false);
    setPullDistance(0);
  };

  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      setPullStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (pullStartY !== null && window.scrollY === 0) {
      const currentY = e.touches[0].clientY;
      const distance = currentY - pullStartY;
      if (distance > 0) {
        setPullDistance(Math.min(distance, 100));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 50) {
      handleRefresh();
    }
    setPullStartY(null);
    setPullDistance(0);
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === 'pickup') return order.type === 'pickup';
    if (filter === 'delivery') return order.type === 'delivery';
    if (filter === 'last-hour') {
      const oneHourAgo = Date.now() - 60 * 60000;
      return order.time.getTime() > oneHourAgo;
    }
    return true;
  });

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      // Optimistically update UI
      setOrders(orders.map(order =>
        order.id === orderId ? { ...order, status: newStatus } : order
      ));
      
      // Update in backend (if endpoint exists)
      try {
        await updateOrderStatus(orderId, newStatus);
      } catch (error) {
        console.error('Error updating order status:', error);
        // Revert on error
        loadOrders();
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      // Reload orders to revert
      loadOrders();
    }
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Time', 'Order #', 'Items', 'Total', 'Status', 'Phone', 'Type'].join(','),
      ...filteredOrders.map(order =>
        [
          format(order.time, 'MM/dd/yyyy HH:mm'),
          order.id,
          `"${order.items}"`,
          order.total.toFixed(2),
          order.status,
          order.phone,
          order.type,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const callPhone = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const textPhone = (phone) => {
    window.location.href = `sms:${phone}`;
  };

  const statusColors = {
    new: '#3b82f6',
    accepted: '#f59e0b',
    ready: '#10b981',
    completed: '#6b7280',
  };

  return (
    <div
      className="todays-orders"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {isRefreshing && (
        <div className="refresh-indicator">
          <div className="refresh-spinner">⟳</div>
          Refreshing...
        </div>
      )}
      {pullDistance > 0 && !isRefreshing && (
        <div
          className="pull-indicator"
          style={{ transform: `translateY(${pullDistance}px)` }}
        >
          Pull to refresh
        </div>
      )}
      <div className="revenue-banner">
        <div className="revenue-amount">${totalRevenue.toLocaleString()}</div>
        <div className="revenue-label">Made today from phone orders</div>
      </div>

      <div className="orders-controls">
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${filter === 'pickup' ? 'active' : ''}`}
            onClick={() => setFilter('pickup')}
          >
            Pickup
          </button>
          <button
            className={`filter-btn ${filter === 'delivery' ? 'active' : ''}`}
            onClick={() => setFilter('delivery')}
          >
            Delivery
          </button>
          <button
            className={`filter-btn ${filter === 'last-hour' ? 'active' : ''}`}
            onClick={() => setFilter('last-hour')}
          >
            Last Hour
          </button>
        </div>
        <button className="export-btn" onClick={exportToCSV}>
          📥 Download orders as CSV
        </button>
      </div>

      {isLoading && orders.length === 0 ? (
        <div className="loading-orders">Loading orders...</div>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Order #</th>
                <th>Items Summary</th>
                <th>Total</th>
                <th>Status</th>
                <th>Customer Phone</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-orders">
                    No orders found
                  </td>
                </tr>
              ) : (
              filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>{format(order.time, 'HH:mm')}</td>
                  <td className="order-id">{order.id}</td>
                  <td>{order.items}</td>
                  <td className="order-total">${order.total.toFixed(2)}</td>
                  <td>
                    <select
                      className="status-select"
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      style={{ borderColor: statusColors[order.status] }}
                    >
                      <option value="new">New</option>
                      <option value="accepted">Accepted</option>
                      <option value="ready">Ready</option>
                      <option value="completed">Completed</option>
                    </select>
                  </td>
                  <td>
                    <div className="phone-actions">
                      <span className="phone-number">{order.phone}</span>
                      <button
                        className="phone-btn call"
                        onClick={() => callPhone(order.phone)}
                        title="Call"
                      >
                        📞
                      </button>
                      <button
                        className="phone-btn text"
                        onClick={() => textPhone(order.phone)}
                        title="Text"
                      >
                        💬
                      </button>
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TodaysOrders;

