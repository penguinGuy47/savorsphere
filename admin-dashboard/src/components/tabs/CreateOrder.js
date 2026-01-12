import React, { useState, useEffect } from 'react';
import { getMenu, createOrder, getSettings } from '../../services/api';
import { getCachedMenu, setCachedMenu, isCacheValid } from '../../utils/menuCache';
import PizzaCustomizerModal from '../PizzaCustomizerModal';
import './CreateOrder.css';

/**
 * Check if a menu item is a v2 pizza item
 */
function isPizzaItem(item) {
  return item?.schemaVersion === 2 && item?.kind === 'pizza';
}

/**
 * Generate a unique cart item ID for pizzas (since same pizza with different toppings = different items)
 */
function generateCartItemId() {
  return `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function CreateOrder({ restaurantId }) {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState({ taxRate: 8.875 });
  
  // Pizza customizer modal state
  const [pizzaModalOpen, setPizzaModalOpen] = useState(false);
  const [selectedPizzaItem, setSelectedPizzaItem] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    orderType: 'pickup',
    address: '',
    tip: 0,
    table: '',
    instructions: '',
    paymentMethod: 'in-store',
  });

  useEffect(() => {
    // Load menu (will use cache if valid)
    loadMenu(false);
    loadSettings();
    
    // Set up periodic refresh check (every minute)
    const refreshInterval = setInterval(() => {
      // Only refresh if cache is expired (pass restaurantId for multi-tenant cache check)
      if (!isCacheValid(restaurantId)) {
        console.log('🔄 Cache expired, refreshing menu in background...');
        loadMenu(true);
      }
    }, 60 * 1000); // Check every minute
    
    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const loadMenu = async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      
      // Check cache first (unless forcing refresh) - use restaurantId for multi-tenant cache
      if (!forceRefresh) {
        const cachedMenu = getCachedMenu(restaurantId);
        if (cachedMenu && Array.isArray(cachedMenu) && cachedMenu.length > 0) {
          console.log('✅ Using cached menu data for', restaurantId || 'default');
          processMenuData(cachedMenu);
          setIsLoading(false);
          return;
        }
      }
      
      // Fetch from API if cache is invalid or forced refresh
      console.log('🔄 Fetching menu from API for', restaurantId || 'default');
      const data = await getMenu(restaurantId);
      const menuData = Array.isArray(data) ? data : [];
      
      // Cache the menu data (with restaurantId for multi-tenant cache)
      if (menuData.length > 0) {
        setCachedMenu(menuData, restaurantId);
        console.log('✅ Menu cached for 15 minutes');
      }
      
      processMenuData(menuData);
    } catch (error) {
      console.error('Error loading menu:', error);
      
      // Try to use cached data as fallback even if expired
      const cachedMenu = getCachedMenu(restaurantId);
      if (cachedMenu && Array.isArray(cachedMenu) && cachedMenu.length > 0) {
        console.log('⚠️ Using expired cache due to API error');
        processMenuData(cachedMenu);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const processMenuData = (menuData) => {
    // Sort by sortOrder if available
    const sorted = [...menuData].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    // Group by category
    const grouped = sorted.reduce((acc, item) => {
      const category = item.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {});

    setMenuItems(sorted);
    setCategories(['All', ...Object.keys(grouped)]);
  };

  const loadSettings = async () => {
    try {
      // Pass restaurantId for multi-tenant isolation
      const data = await getSettings(restaurantId);
      if (data.taxRate) {
        setSettings({ taxRate: data.taxRate });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const filteredItems = activeCategory === 'All' 
    ? menuItems 
    : menuItems.filter(item => item.category === activeCategory);

  const addToCart = (item) => {
    // If it's a pizza item, open the customizer modal
    if (isPizzaItem(item)) {
      setSelectedPizzaItem(item);
      setPizzaModalOpen(true);
      return;
    }
    
    // For v1 flat items, use existing logic
    const existingItem = cart.find(cartItem => 
      cartItem.itemId === item.itemId && !cartItem.isPizza
    );
    
    if (existingItem) {
      setCart(cart.map(cartItem =>
        cartItem.cartItemId === existingItem.cartItemId
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      ));
    } else {
      setCart([...cart, {
        cartItemId: generateCartItemId(),
        itemId: item.itemId,
        name: item.name,
        price: item.price,
        quantity: 1,
        modifiers: [],
        isPizza: false,
      }]);
    }
  };

  const addPizzaToCart = (pizzaCartItem) => {
    // Each pizza configuration is a unique cart item
    setCart([...cart, {
      ...pizzaCartItem,
      cartItemId: generateCartItemId(),
    }]);
  };

  const updateQuantity = (cartItemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
    } else {
      setCart(cart.map(item =>
        item.cartItemId === cartItemId ? { ...item, quantity } : item
      ));
    }
  };

  const removeFromCart = (cartItemId) => {
    setCart(cart.filter(item => item.cartItemId !== cartItemId));
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * (settings.taxRate / 100);
    const tip = parseFloat(formData.tip) || 0;
    const total = subtotal + tax + tip;
    return { subtotal, tax, tip, total };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (cart.length === 0) {
      alert('Please add items to cart');
      return;
    }

    if (!formData.name || !formData.phone) {
      alert('Please fill in customer name and phone');
      return;
    }

    setIsSubmitting(true);

    try {
      const { subtotal, tax, tip, total } = calculateTotals();
      
      // Prepare order items - include pizzaDetails for pizza items
      const orderItems = cart.map(item => {
        const orderItem = {
          itemId: item.itemId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        };
        
        // Include pizza details for server-side pricing
        if (item.isPizza && item.pizzaDetails) {
          orderItem.pizzaDetails = item.pizzaDetails;
        }
        
        return orderItem;
      });
      
      const orderData = {
        ...formData,
        items: orderItems,
        subtotal,
        tax,
        tip,
        total,
        paymentId: null,
        paymentMethod: formData.paymentMethod,
      };

      // Pass restaurantId for multi-tenant isolation
      const order = await createOrder(orderData, restaurantId);
      
      const orderDisplay = order.orderNumber ? `#${order.orderNumber}` : order.orderId;
      alert(`Order created successfully! Order ${orderDisplay}`);
      
      // Reset form
      setCart([]);
      setFormData({
        name: '',
        phone: '',
        email: '',
        orderType: 'pickup',
        address: '',
        tip: 0,
        table: '',
        instructions: '',
        paymentMethod: 'in-store',
      });
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { subtotal, tax, total } = calculateTotals();

  /**
   * Get display price for a menu item (base price for pizzas, actual price for v1 items)
   */
  const getDisplayPrice = (item) => {
    if (isPizzaItem(item)) {
      // Show starting price for pizzas
      const minSize = item.allowedSizes?.[0] || 'Personal';
      const basePrice = item.pricingRules?.basePriceCentsBySize?.[minSize] || 1199;
      return basePrice / 100;
    }
    return item.price || 0;
  };

  return (
    <div className="create-order">
      <div className="create-order-header">
        <div>
          <h2>Create New Order</h2>
          <p className="section-description">Add items from the menu and create an order</p>
        </div>
        <button
          className="refresh-menu-btn"
          onClick={() => loadMenu(true)}
          title="Refresh menu (cache expires after 15 minutes)"
          disabled={isLoading}
        >
          🔄 Refresh Menu
        </button>
      </div>

      <div className="create-order-layout">
        <div className="menu-section">
          <div className="category-tabs">
            {categories.map(category => (
              <button
                key={category}
                className={`category-tab ${activeCategory === category ? 'active' : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="loading">Loading menu...</div>
          ) : (
            <div className="menu-items-grid">
              {filteredItems.map(item => (
                <div 
                  key={item.itemId} 
                  className={`menu-item-card ${isPizzaItem(item) ? 'pizza-item' : ''}`}
                >
                  <div className="item-info">
                    <h3 className="item-name">
                      {item.name}
                      {isPizzaItem(item) && <span className="pizza-badge">🍕</span>}
                    </h3>
                    {item.description && (
                      <p className="item-description">{item.description}</p>
                    )}
                    <div className="item-price">
                      {isPizzaItem(item) && <span className="starting-at">from </span>}
                      ${getDisplayPrice(item).toFixed(2)}
                    </div>
                  </div>
                  <button
                    className="add-item-btn"
                    onClick={() => addToCart(item)}
                    disabled={!item.available}
                  >
                    {item.available ? (isPizzaItem(item) ? 'Customize' : '+') : 'Unavailable'}
                  </button>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="no-items">No items in this category</div>
              )}
            </div>
          )}
        </div>

        <div className="cart-section">
          <div className="cart-header">
            <h3>Cart ({cart.length})</h3>
            {cart.length > 0 && (
              <button className="clear-cart-btn" onClick={() => setCart([])}>
                Clear
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="empty-cart">Cart is empty</div>
          ) : (
            <>
              <div className="cart-items">
                {cart.map(item => (
                  <div key={item.cartItemId} className="cart-item">
                    <div className="cart-item-info">
                      <div className="cart-item-name">
                        {item.name}
                        {item.isPizza && <span className="pizza-indicator">🍕</span>}
                      </div>
                      {/* Pizza summary */}
                      {item.isPizza && item.pizzaSummary && (
                        <div className="cart-item-pizza-summary">
                          {item.pizzaSummary}
                        </div>
                      )}
                      <div className="cart-item-price">${item.price.toFixed(2)}</div>
                    </div>
                    <div className="cart-item-controls">
                      <button
                        className="quantity-btn"
                        onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                      >
                        -
                      </button>
                      <span className="quantity">{item.quantity}</span>
                      <button
                        className="quantity-btn"
                        onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        className="remove-btn"
                        onClick={() => removeFromCart(item.cartItemId)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="cart-totals">
                <div className="total-row">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="total-row">
                  <span>Tax ({settings.taxRate}%):</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
                <div className="total-row">
                  <span>Tip:</span>
                  <input
                    type="number"
                    className="tip-input"
                    value={formData.tip}
                    onChange={(e) => setFormData({ ...formData, tip: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <div className="total-row total-final">
                  <span>Total:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="order-form">
                <div className="form-group">
                  <label>Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>

                <div className="form-group">
                  <label>Phone *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </div>

                <div className="form-group">
                  <label>Order Type</label>
                  <select
                    value={formData.orderType}
                    onChange={(e) => setFormData({ ...formData, orderType: e.target.value })}
                  >
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery</option>
                    <option value="dine-in">Dine In</option>
                  </select>
                </div>

                {formData.orderType === 'delivery' && (
                  <div className="form-group">
                    <label>Delivery Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Main St, City, State 12345"
                    />
                  </div>
                )}

                {formData.orderType === 'dine-in' && (
                  <div className="form-group">
                    <label>Table Number</label>
                    <input
                      type="text"
                      value={formData.table}
                      onChange={(e) => setFormData({ ...formData, table: e.target.value })}
                      placeholder="Table 5"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Special Instructions</label>
                  <textarea
                    value={formData.instructions}
                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                    placeholder="Any special requests..."
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                  >
                    <option value="in-store">Pay In Store</option>
                    <option value="online">Pay Online</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="submit-order-btn"
                  disabled={isSubmitting || cart.length === 0}
                >
                  {isSubmitting ? 'Creating Order...' : 'Create Order'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Pizza Customizer Modal */}
      {pizzaModalOpen && selectedPizzaItem && (
        <PizzaCustomizerModal
          menuItem={selectedPizzaItem}
          onClose={() => {
            setPizzaModalOpen(false);
            setSelectedPizzaItem(null);
          }}
          onAddToCart={addPizzaToCart}
        />
      )}
    </div>
  );
}

export default CreateOrder;
