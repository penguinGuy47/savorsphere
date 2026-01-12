import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, isValid } from 'date-fns';
import { getOrders, updateOrderStatus } from '../../services/api';
import './TodaysOrders.css';

// Status workflow order for sorting (lower = earlier in workflow)
const STATUS_ORDER = {
  needs_callback: -1,
  new: 0,
  paid: 1,
  accepted: 2,
  preparing: 3,
  ready: 4,
  completed: 5,
  cancelled: 6,
};

/**
 * Get display order number for sorting (numeric if available, else fallback string)
 */
function getOrderNumberForSort(order) {
  if (order.orderNumber != null) {
    return { numeric: true, value: Number(order.orderNumber) };
  }
  // Fallback to last 6 chars of id (as displayed)
  const fallback = order.id ? order.id.slice(-6) : '';
  return { numeric: false, value: fallback };
}

/**
 * Safely parse a date value. Returns null if invalid.
 */
function safeParseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }
  const d = new Date(value);
  return isValid(d) ? d : null;
}

/**
 * Safely format a date. Returns fallback string if date is invalid.
 */
function safeFormatDate(date, formatStr, fallback = '--') {
  const parsed = safeParseDate(date);
  if (!parsed) return fallback;
  try {
    return format(parsed, formatStr);
  } catch (e) {
    return fallback;
  }
}

/**
 * Safely convert to number with fallback.
 */
function safeNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// Date range presets
const DATE_RANGES = {
  today: { label: 'Today', days: 1 },
  '7d': { label: '7 Days', days: 7 },
  '30d': { label: '30 Days', days: 30 },
  all: { label: 'All Time', all: true },
};

function TodaysOrders({ restaurantId }) {
  const [orders, setOrders] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all'); // all, pickup, delivery
  const [dateRange, setDateRange] = useState('30d'); // today, 7d, 30d, all
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pullStartY, setPullStartY] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);
  
  // Sorting state - default to newest first (time descending)
  const [sortKey, setSortKey] = useState('time');
  const [sortDir, setSortDir] = useState('desc');

  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Build filters based on current state
      const filters = {};
      
      // Apply date range
      const range = DATE_RANGES[dateRange];
      if (range.all) {
        filters.all = true;
      } else if (range.days) {
        filters.days = range.days;
      }
      
      // Apply type filter (handled server-side)
      if (typeFilter === 'pickup') filters.orderType = 'pickup';
      if (typeFilter === 'delivery') filters.orderType = 'delivery';
      
      // Pass restaurantId for multi-tenant isolation
      const data = await getOrders(filters, restaurantId);
      
      // Transform API data with safe parsing
      const transformedOrders = (data.orders || []).map(order => {
        // Safely parse the date
        let orderTime = safeParseDate(order.createdAt) || safeParseDate(order.time);
        
        // Fallback: try to extract timestamp from orderId (ord_1766887721913)
        if (!orderTime && order.orderId && order.orderId.startsWith('ord_')) {
          const ts = parseInt(order.orderId.replace('ord_', ''), 10);
          if (!isNaN(ts) && ts > 0) {
            orderTime = new Date(ts);
            if (!isValid(orderTime)) orderTime = null;
          }
        }
        
        // Ultimate fallback: use current time (shouldn't happen with valid data)
        if (!orderTime) {
          orderTime = new Date();
        }
        
        return {
          id: order.orderId || order.id || 'unknown',
          orderId: order.orderId || order.id || 'unknown',
          orderNumber: order.orderNumber || null, // Sequential display number (e.g., 1001)
          time: orderTime,
          items: order.items || 'No items',
          total: safeNumber(order.total, 0),
          status: order.status || 'new',
          phone: order.phone || '',
          callbackPhone: order.callbackPhone || '',
          name: order.name || '',
          email: order.email || '',
          type: order.type || order.orderType || 'pickup',
          address: order.address || '',
          table: order.table || '',
          instructions: order.instructions || '',
        };
      });
      
      setOrders(transformedOrders);
      setTotalRevenue(safeNumber(data.totalRevenue, 0));
      setOrderCount(data.count || transformedOrders.length);
    } catch (err) {
      console.error('Error loading orders:', err);
      setError(err.message || 'Failed to load orders');
      
      // Handle different error types
      if (err.message?.includes('Failed to fetch') || err.message?.includes('CORS')) {
        console.warn('⚠️ GET /orders endpoint not available. Please deploy the backend.');
      } else if (err.status === 403 || err.message?.includes('403')) {
        console.warn('⚠️ GET /orders endpoint returned 403. Please deploy the backend.');
      }
      
      // Don't clear existing orders on error - let user see stale data
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, typeFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

  // Apply "last-hour" filter locally (since it's dynamic)
  const filteredOrders = orders.filter((order) => {
    // Type filter is already applied server-side, but double-check locally
    if (typeFilter === 'pickup' && order.type !== 'pickup') return false;
    if (typeFilter === 'delivery' && order.type !== 'delivery') return false;
    
    // Last hour is a special local filter
    if (typeFilter === 'last-hour') {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const orderTime = safeParseDate(order.time);
      return orderTime && orderTime.getTime() > oneHourAgo;
    }
    return true;
  });

  // Sorted orders - stable sort using index as tie-breaker
  const sortedOrders = useMemo(() => {
    // Decorate with original index for stable sorting
    const decorated = filteredOrders.map((order, idx) => ({ order, idx }));
    
    decorated.sort((a, b) => {
      let cmp = 0;
      const orderA = a.order;
      const orderB = b.order;
      
      switch (sortKey) {
        case 'time': {
          // Compare full timestamp
          const timeA = safeParseDate(orderA.time)?.getTime() || 0;
          const timeB = safeParseDate(orderB.time)?.getTime() || 0;
          cmp = timeA - timeB;
          break;
        }
        case 'date': {
          // Compare date-only (midnight), then tie-break with full time
          const dateA = safeParseDate(orderA.time);
          const dateB = safeParseDate(orderB.time);
          const dayA = dateA ? new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()).getTime() : 0;
          const dayB = dateB ? new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()).getTime() : 0;
          cmp = dayA - dayB;
          if (cmp === 0) {
            cmp = (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
          }
          break;
        }
        case 'orderNumber': {
          // Numeric compare if both have orderNumber, else string compare on fallback
          const numA = getOrderNumberForSort(orderA);
          const numB = getOrderNumberForSort(orderB);
          if (numA.numeric && numB.numeric) {
            cmp = numA.value - numB.value;
          } else if (numA.numeric && !numB.numeric) {
            cmp = -1; // numeric comes first
          } else if (!numA.numeric && numB.numeric) {
            cmp = 1;
          } else {
            cmp = String(numA.value).localeCompare(String(numB.value));
          }
          break;
        }
        case 'total': {
          cmp = safeNumber(orderA.total) - safeNumber(orderB.total);
          break;
        }
        case 'status': {
          const statusA = STATUS_ORDER[orderA.status] ?? 99;
          const statusB = STATUS_ORDER[orderB.status] ?? 99;
          cmp = statusA - statusB;
          break;
        }
        default:
          cmp = 0;
      }
      
      // Apply direction
      if (sortDir === 'desc') cmp = -cmp;
      
      // Stable sort: use original index as tie-breaker
      if (cmp === 0) cmp = a.idx - b.idx;
      
      return cmp;
    });
    
    return decorated.map(d => d.order);
  }, [filteredOrders, sortKey, sortDir]);

  // Handler for clicking sortable headers
  const handleSort = (key) => {
    if (sortKey === key) {
      // Toggle direction
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - default to descending for time/date/orderNumber, ascending for others
      setSortKey(key);
      setSortDir(['time', 'date', 'orderNumber'].includes(key) ? 'desc' : 'asc');
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      // Optimistically update UI
      setOrders(prevOrders => prevOrders.map(order =>
        order.id === orderId ? { ...order, status: newStatus } : order
      ));
      
      // Update in backend
      // Pass restaurantId for multi-tenant isolation
      await updateOrderStatus(orderId, newStatus, undefined, restaurantId);
    } catch (err) {
      console.error('Error updating order status:', err);
      // Revert on error by reloading
      loadOrders();
    }
  };

  const exportToCSV = () => {
    // Export in current sorted order, using display order number
    const csvContent = [
      ['Time', 'Date', 'Order #', 'Items', 'Total', 'Status', 'Phone', 'Type'].join(','),
      ...sortedOrders.map(order =>
        [
          safeFormatDate(order.time, 'HH:mm', '--'),
          safeFormatDate(order.time, 'MM/dd/yyyy', '--'),
          order.orderNumber || order.id.slice(-6), // Use display order number
          `"${(order.items || '').replace(/"/g, '""')}"`,
            safeNumber(order.total, 0).toFixed(2),
            order.status,
            order.callbackPhone || order.phone,
            order.type,
          ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${safeFormatDate(new Date(), 'yyyy-MM-dd', 'export')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const callPhone = (phone) => {
    if (phone) window.location.href = `tel:${phone}`;
  };

  const statusColors = {
    needs_callback: '#dc2626',
    new: '#3b82f6',
    paid: '#8b5cf6',
    accepted: '#f59e0b',
    preparing: '#f59e0b',
    ready: '#10b981',
    completed: '#6b7280',
    cancelled: '#ef4444',
  };

  // Revenue label based on selected date range
  const getRevenueLabel = () => {
    const range = DATE_RANGES[dateRange];
    if (range.all) return 'Total revenue (all time)';
    if (range.days === 1) return 'Made today from orders';
    return `Revenue (last ${range.days} days)`;
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
        <div className="revenue-amount">${safeNumber(totalRevenue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="revenue-label">{getRevenueLabel()}</div>
        <div className="order-count">{orderCount} order{orderCount !== 1 ? 's' : ''}</div>
      </div>

      <div className="orders-controls">
        <div className="filter-section">
          <div className="filter-group">
            <span className="filter-label">Date Range:</span>
            <div className="filter-buttons">
              {Object.entries(DATE_RANGES).map(([key, { label }]) => (
                <button
                  key={key}
                  className={`filter-btn ${dateRange === key ? 'active' : ''}`}
                  onClick={() => setDateRange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="filter-group">
            <span className="filter-label">Type:</span>
            <div className="filter-buttons">
              <button
                className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All
              </button>
              <button
                className={`filter-btn ${typeFilter === 'pickup' ? 'active' : ''}`}
                onClick={() => setTypeFilter('pickup')}
              >
                Pickup
              </button>
              <button
                className={`filter-btn ${typeFilter === 'delivery' ? 'active' : ''}`}
                onClick={() => setTypeFilter('delivery')}
              >
                Delivery
              </button>
              <button
                className={`filter-btn ${typeFilter === 'last-hour' ? 'active' : ''}`}
                onClick={() => setTypeFilter('last-hour')}
              >
                Last Hour
              </button>
            </div>
          </div>
        </div>
        
        <button className="export-btn" onClick={exportToCSV}>
          📥 Download orders as CSV
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={loadOrders}>Retry</button>
        </div>
      )}

      {isLoading && orders.length === 0 ? (
        <div className="loading-orders">Loading orders...</div>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th 
                  className="sortable-header"
                  aria-sort={sortKey === 'time' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
                  onClick={() => handleSort('time')}
                >
                  <span className="header-content">
                    Time
                    <span className={`sort-indicator ${sortKey === 'time' ? 'active' : ''}`}>
                      {sortKey === 'time' ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                    </span>
                  </span>
                </th>
                <th 
                  className="sortable-header"
                  aria-sort={sortKey === 'date' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
                  onClick={() => handleSort('date')}
                >
                  <span className="header-content">
                    Date
                    <span className={`sort-indicator ${sortKey === 'date' ? 'active' : ''}`}>
                      {sortKey === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                    </span>
                  </span>
                </th>
                <th 
                  className="sortable-header"
                  aria-sort={sortKey === 'orderNumber' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
                  onClick={() => handleSort('orderNumber')}
                >
                  <span className="header-content">
                    Order #
                    <span className={`sort-indicator ${sortKey === 'orderNumber' ? 'active' : ''}`}>
                      {sortKey === 'orderNumber' ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                    </span>
                  </span>
                </th>
                <th>Items Summary</th>
                <th 
                  className="sortable-header"
                  aria-sort={sortKey === 'total' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
                  onClick={() => handleSort('total')}
                >
                  <span className="header-content">
                    Total
                    <span className={`sort-indicator ${sortKey === 'total' ? 'active' : ''}`}>
                      {sortKey === 'total' ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                    </span>
                  </span>
                </th>
                <th 
                  className="sortable-header"
                  aria-sort={sortKey === 'status' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
                  onClick={() => handleSort('status')}
                >
                  <span className="header-content">
                    Status
                    <span className={`sort-indicator ${sortKey === 'status' ? 'active' : ''}`}>
                      {sortKey === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                    </span>
                  </span>
                </th>
                <th>Customer Phone</th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-orders">
                    No orders found for this period
                  </td>
                </tr>
              ) : (
                sortedOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{safeFormatDate(order.time, 'HH:mm', '--')}</td>
                    <td>{safeFormatDate(order.time, 'MMM d', '--')}</td>
                    <td className="order-id">#{order.orderNumber || order.id.slice(-6)}</td>
                    <td className="order-items">{order.items}</td>
                    <td className="order-total">${safeNumber(order.total, 0).toFixed(2)}</td>
                    <td>
                      {order.status === 'needs_callback' && (
                        <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 4 }}>
                          Needs callback
                        </div>
                      )}
                      <select
                        className="status-select"
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        style={{ borderColor: statusColors[order.status] || '#6b7280' }}
                      >
                        <option value="needs_callback">Needs callback</option>
                        <option value="new">New</option>
                        <option value="paid">Paid</option>
                        <option value="accepted">Accepted</option>
                        <option value="preparing">Preparing</option>
                        <option value="ready">Ready</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td>
                      <div className="phone-actions">
                        <span className="phone-number">{order.callbackPhone || order.phone || '--'}</span>
                        {(order.callbackPhone || order.phone) && (
                          <button
                            className="phone-btn call"
                            onClick={() => callPhone(order.callbackPhone || order.phone)}
                            title="Call"
                          >
                            📞
                          </button>
                        )}
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

