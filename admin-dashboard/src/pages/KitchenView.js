import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getOrders, updateOrderStatus } from '../services/api';
import { isStoreOpenFromLocal } from '../utils/storeHoursLocal';
import '../styles/KitchenView.css';

// Security code - in production, this should be environment-specific
const VALID_SECURITY_CODE = '927461';

function KitchenView() {
  const { restaurantId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const securityCode = searchParams.get('s');
  
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastOrderTime, setLastOrderTime] = useState(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [acceptedTimers, setAcceptedTimers] = useState({}); // orderId -> { startTime, intervalId }
  
  const audioRef = useRef(null);
  const wakeLockRef = useRef(null);
  const cursorTimeoutRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const flashTimeoutRef = useRef(null);
  const lastOrderIdsRef = useRef(new Set());
  const lastOrderCountRef = useRef(0);
  const lastNewOrderTimeRef = useRef(Date.now());

  // Check security code
  useEffect(() => {
    if (securityCode !== VALID_SECURITY_CODE) {
      // Show invalid access screen
      return;
    }
  }, [securityCode]);

  // Kiosk mode setup
  useEffect(() => {
    if (securityCode !== VALID_SECURITY_CODE) return;

    // Auto fullscreen
    const requestFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          await document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
          await document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.msRequestFullscreen) {
          await document.documentElement.msRequestFullscreen();
        }
      } catch (err) {
        console.warn('Fullscreen request failed:', err);
      }
    };
    requestFullscreen();

    // Wake lock (prevent screen sleep)
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          wakeLockRef.current.addEventListener('release', () => {
            // Re-request if released
            requestWakeLock();
          });
        }
      } catch (err) {
        console.warn('Wake lock failed:', err);
      }
    };
    requestWakeLock();

    // Hide cursor after 5 seconds of inactivity
    const resetCursorTimeout = () => {
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
      document.body.style.cursor = 'default';
      cursorTimeoutRef.current = setTimeout(() => {
        document.body.style.cursor = 'none';
      }, 5000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, resetCursorTimeout, true);
    });
    resetCursorTimeout();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetCursorTimeout, true);
      });
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, [securityCode]);

  // Check store hours periodically (hours stored in localStorage)
  useEffect(() => {
    if (securityCode !== VALID_SECURITY_CODE) return;
    
    // Hours are stored in localStorage, so we check them directly in the polling effect
    // No need for a separate interval here - the polling effect checks hours on each cycle
  }, [securityCode]);

  // Adaptive polling: 8-10s default, 5s when busy, 15s when quiet
  useEffect(() => {
    if (securityCode !== VALID_SECURITY_CODE) return;

    let currentInterval = 8000; // Start at 8 seconds

    const scheduleNextFetch = () => {
      // Clear existing interval
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
      }
      
      // Check if store is open before scheduling next fetch (hours from localStorage)
      if (!isStoreOpenFromLocal(restaurantId)) {
        // Store is closed - stop polling completely
        console.log('Store is closed. Polling stopped.');
        return;
      }
      
      // Schedule next fetch
      pollingIntervalRef.current = setTimeout(() => {
        fetchOrders();
      }, currentInterval);
    };

    const fetchOrders = async () => {
      // Check if store is open before fetching (hours from localStorage)
      if (!isStoreOpenFromLocal(restaurantId)) {
        console.log('Store is closed. Polling stopped.');
        // Clear any existing polling
        if (pollingIntervalRef.current) {
          clearTimeout(pollingIntervalRef.current);
        }
        return;
      }
      
      try {
        setIsReconnecting(false);
        // Fetch all orders (no status filter) and filter on frontend
        const response = await getOrders({});
        
        if (response && response.orders) {
          // Filter for active orders (new, paid, accepted) and by restaurantId
          const newOrders = response.orders.filter(order => {
            const isActive = order.status === 'new' || order.status === 'paid' || order.status === 'accepted';
            const matchesRestaurant = !restaurantId || order.restaurantId === restaurantId || order.restaurantId === undefined;
            return isActive && matchesRestaurant;
          });
          
          const currentOrderCount = newOrders.length;
          
          // Check for new orders
          const currentOrderIds = new Set(newOrders.map(o => o.orderId));
          const newOrderIds = newOrders
            .filter(o => !lastOrderIdsRef.current.has(o.orderId))
            .map(o => o.orderId);
          
          // Adaptive polling logic
          if (newOrderIds.length > 0) {
            // New order arrived! Speed up polling
            currentInterval = 5000; // Speed up to 5 seconds when busy
            lastNewOrderTimeRef.current = Date.now();
            
            // New order arrived!
            setLastOrderTime(Date.now());
            setUndoVisible(true);
            
            // Flash red border 3 times
            let flashCount = 0;
            const flash = () => {
              document.body.classList.add('flash-red');
              setTimeout(() => {
                document.body.classList.remove('flash-red');
                flashCount++;
                if (flashCount < 3) {
                  setTimeout(flash, 200);
                }
              }, 200);
            };
            flash();
            
            // Play sound
            if (audioRef.current) {
              audioRef.current.volume = 0.8;
              audioRef.current.play().catch(err => {
                console.warn('Audio play failed:', err);
              });
            }
          } else if (Date.now() - lastNewOrderTimeRef.current > 60000) {
            // Slow down if quiet for 1 minute
            currentInterval = 15000; // Slow down to 15 seconds
          } else if (currentOrderCount > lastOrderCountRef.current) {
            // More orders than before (but not new IDs) - keep fast polling
            currentInterval = 5000;
            lastNewOrderTimeRef.current = Date.now();
          } else {
            // Normal state - use default interval
            currentInterval = 8000;
          }
          
          lastOrderCountRef.current = currentOrderCount;
          lastOrderIdsRef.current = currentOrderIds;
          
          // Separate active and completed orders
          const active = newOrders.filter(o => o.status !== 'completed');
          const completed = newOrders.filter(o => o.status === 'completed');
          
          setOrders(active);
          setCompletedOrders(completed);
          
          // Update timers for accepted orders
          active.forEach(order => {
            if (order.status === 'accepted' && order.acceptedAt && !acceptedTimers[order.orderId]) {
              startTimer(order.orderId, new Date(order.acceptedAt));
            }
          });
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching orders:', error);
        setIsReconnecting(true);
        setIsLoading(false);
        // On error, use default interval
        currentInterval = 8000;
      }
      
      // Schedule next fetch with current interval (only if store is open)
      scheduleNextFetch();
    };

    // Only start polling if store is open (check hours from localStorage)
    if (isStoreOpenFromLocal(restaurantId)) {
      fetchOrders(); // Initial fetch
    } else {
      console.log('Store is closed. Polling will not start.');
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
      }
    };
  }, [securityCode, acceptedTimers, restaurantId]);

  // Hide undo button after 2 minutes
  useEffect(() => {
    if (lastOrderTime) {
      const timer = setTimeout(() => {
        setUndoVisible(false);
      }, 120000); // 2 minutes
      return () => clearTimeout(timer);
    }
  }, [lastOrderTime]);

  // Start timer for accepted order
  const startTimer = (orderId, acceptedAt) => {
    const startTime = acceptedAt.getTime();
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = 20 * 60 * 1000 - elapsed; // 20 minutes
      
      if (remaining <= 0) {
        // Auto-complete when timer ends
        handleComplete(orderId);
        clearInterval(intervalId);
        setAcceptedTimers(prev => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    }, 1000);
    
    setAcceptedTimers(prev => ({
      ...prev,
      [orderId]: { startTime, intervalId }
    }));
  };

  // Get timer display
  const getTimerDisplay = (orderId) => {
    const timer = acceptedTimers[orderId];
    if (!timer) {
      // Try to get from order data
      const order = orders.find(o => o.orderId === orderId);
      if (order && order.acceptedAt) {
        const elapsed = Date.now() - new Date(order.acceptedAt).getTime();
        const remaining = 20 * 60 * 1000 - elapsed;
        if (remaining <= 0) return { minutes: 0, seconds: 0, color: 'red' };
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        let color = 'white';
        if (minutes < 2) color = 'red';
        else if (minutes < 5) color = 'yellow';
        return { minutes, seconds, color };
      }
      return null;
    }
    
    const elapsed = Date.now() - timer.startTime;
    const remaining = 20 * 60 * 1000 - elapsed;
    if (remaining <= 0) return { minutes: 0, seconds: 0, color: 'red' };
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    let color = 'white';
    if (minutes < 2) color = 'red';
    else if (minutes < 5) color = 'yellow';
    
    return { minutes, seconds, color };
  };

  const handleAccept = async (orderId) => {
    try {
      const acceptedAt = new Date();
      await updateOrderStatus(orderId, 'accepted', acceptedAt.toISOString());
      startTimer(orderId, acceptedAt);
      
      // Update local state
      setOrders(prev => prev.map(order => 
        order.orderId === orderId 
          ? { ...order, status: 'accepted', acceptedAt: acceptedAt.toISOString() }
          : order
      ));
    } catch (error) {
      console.error('Error accepting order:', error);
      // Still update locally if API fails (for demo purposes)
      const acceptedAt = new Date();
      startTimer(orderId, acceptedAt);
      setOrders(prev => prev.map(order => 
        order.orderId === orderId 
          ? { ...order, status: 'accepted', acceptedAt: acceptedAt.toISOString() }
          : order
      ));
    }
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) {
      return;
    }
    try {
      await updateOrderStatus(orderId, 'cancelled');
      setOrders(prev => prev.filter(order => order.orderId !== orderId));
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order. Please try again.');
    }
  };

  const handleComplete = async (orderId) => {
    try {
      await updateOrderStatus(orderId, 'completed');
      const order = orders.find(o => o.orderId === orderId);
      if (order) {
        setCompletedOrders(prev => [...prev, { ...order, status: 'completed' }]);
      }
      setOrders(prev => prev.filter(o => o.orderId !== orderId));
      
      // Clear timer
      if (acceptedTimers[orderId]) {
        clearInterval(acceptedTimers[orderId].intervalId);
        setAcceptedTimers(prev => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    } catch (error) {
      console.error('Error completing order:', error);
      alert('Failed to complete order. Please try again.');
    }
  };

  const handleUndo = async () => {
    if (completedOrders.length === 0) return;
    const lastCompleted = completedOrders[completedOrders.length - 1];
    try {
      await updateOrderStatus(lastCompleted.orderId, 'accepted');
      setCompletedOrders(prev => prev.slice(0, -1));
      setOrders(prev => [...prev, { ...lastCompleted, status: 'accepted' }]);
      if (lastCompleted.acceptedAt) {
        startTimer(lastCompleted.orderId, new Date(lastCompleted.acceptedAt));
      }
      setUndoVisible(false);
    } catch (error) {
      console.error('Error undoing order:', error);
      alert('Failed to undo order. Please try again.');
    }
  };

  const getOrderTypeDisplay = (orderType, tableNumber) => {
    if (orderType === 'dineIn' && tableNumber) {
      return { text: `TABLE ${tableNumber}`, color: 'red' };
    } else if (orderType === 'pickup') {
      return { text: 'PICKUP', color: 'green' };
    } else if (orderType === 'delivery') {
      return { text: 'DELIVERY', color: 'blue' };
    }
    return { text: orderType?.toUpperCase() || 'ORDER', color: 'gray' };
  };

  const formatOrderItems = (orderItems) => {
    if (!orderItems || orderItems.length === 0) {
      return 'No items';
    }
    // Handle both array format and string format
    if (typeof orderItems === 'string') {
      return orderItems;
    }
    return orderItems.map(item => {
      const quantity = item.quantity || 1;
      const name = item.name || item.menuItemId || 'Item';
      const modifiers = item.modifiers && item.modifiers.length > 0 
        ? ` — ${item.modifiers.join(', ')}`
        : '';
      return `${quantity}x ${name}${modifiers}`;
    }).join('\n');
  };

  // Invalid access screen
  if (securityCode !== VALID_SECURITY_CODE) {
    return (
      <div className="kitchen-kiosk invalid-access">
        <div className="invalid-access-content">
          <h1>Invalid Access</h1>
          <p>This page requires a valid security code.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kitchen-kiosk">
      <audio ref={audioRef} src="../public/sounds/mixkitBeep.mp3" preload="auto" crossOrigin="anonymous" />
      
      {isReconnecting && (
        <div className="reconnecting-overlay">
          <div className="reconnecting-content">
            <div className="spinner"></div>
            <p>Reconnecting…</p>
          </div>
        </div>
      )}

      <div className="kitchen-header">
        {undoVisible && completedOrders.length > 0 && (
          <button 
            className="undo-button"
            onClick={handleUndo}
          >
            UNDO LAST ORDER
          </button>
        )}
        <div className="kitchen-title">Kitchen Display</div>
      </div>

      <div className="orders-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="no-orders">
            <div className="no-orders-icon">🍕</div>
            <div className="no-orders-text">No active orders</div>
          </div>
        ) : (
          <div className="orders-grid">
            {orders.map((order) => {
              const orderType = getOrderTypeDisplay(order.orderType || order.type, order.tableNumber || order.table);
              const timer = getTimerDisplay(order.orderId);
              const isAccepted = order.status === 'accepted';
              
              return (
                <div 
                  key={order.orderId} 
                  className={`order-card ${isAccepted ? 'accepted' : ''}`}
                  style={{ borderLeftColor: isAccepted ? '#10b981' : '#3b82f6' }}
                >
                  <div className="order-header">
                    <div 
                      className="order-type-badge"
                      style={{ backgroundColor: orderType.color }}
                    >
                      {orderType.text}
                    </div>
                    {timer && (
                      <div className={`timer ${timer.color}`}>
                        {String(timer.minutes).padStart(2, '0')}:{String(timer.seconds).padStart(2, '0')}
                      </div>
                    )}
                  </div>

                  <div className="order-items">
                    <pre className="order-items-text">
                      {formatOrderItems(order.orderItems || order.items || [])}
                    </pre>
                  </div>

                  {(order.customerName || order.name || order.customerPhone || order.phone) && (
                    <div className="customer-info">
                      {order.customerName || order.name}
                      {(order.customerPhone || order.phone) && (
                        <span> • {order.customerPhone || order.phone}</span>
                      )}
                    </div>
                  )}

                  <div className="order-total">
                    Total: ${typeof order.total === 'number' 
                      ? (order.totalCents ? (order.totalCents / 100).toFixed(2) : order.total.toFixed(2))
                      : ((order.totalCents || 0) / 100).toFixed(2)}
                  </div>

                  <div className="order-actions">
                    {order.status === 'new' || order.status === 'paid' ? (
                      <>
                        <button 
                          className="action-button accept-button"
                          onClick={() => handleAccept(order.orderId)}
                        >
                          ACCEPT
                        </button>
                        <button 
                          className="action-button cancel-button"
                          onClick={() => handleCancel(order.orderId)}
                        >
                          CANCEL
                        </button>
                      </>
                    ) : order.status === 'accepted' ? (
                      <button 
                        className="action-button done-button"
                        onClick={() => handleComplete(order.orderId)}
                      >
                        DONE
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {completedOrders.length > 0 && (
        <div className="completed-section">
          <div className="completed-header">
            <span>Completed ({completedOrders.length})</span>
          </div>
          <div className="completed-orders">
            {completedOrders.slice(-5).reverse().map(order => (
              <div key={order.orderId} className="completed-order-item">
                {getOrderTypeDisplay(order.orderType || order.type, order.tableNumber || order.table).text} • 
                ${((order.total || order.totalCents || 0) / 100).toFixed(2)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tablet-id">
        Tablet ID: {restaurantId || 'unknown'}
      </div>
    </div>
  );
}

export default KitchenView;
