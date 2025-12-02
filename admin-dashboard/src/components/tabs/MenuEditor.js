import React, { useState, useEffect } from 'react';
import { getMenu, createMenuItem, updateMenuItem, deleteMenuItem } from '../../services/api';
import { getCachedMenu, setCachedMenu, isCacheValid, invalidateMenuCache } from '../../utils/menuCache';
import './MenuEditor.css';

function MenuEditor({ restaurantId }) {
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    menuItemId: '',
    name: '',
    description: '',
    price: '',
    category: 'Uncategorized',
    available: true,
    image: '',
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const categories = ['Uncategorized', 'Appetizers', 'Entrees', 'Desserts', 'Beverages', 'Lunch', 'Dinner'];

  const loadMenuItems = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check cache first
      if (isCacheValid()) {
        const cached = getCachedMenu();
        if (cached && Array.isArray(cached)) {
          setMenuItems(cached);
          setIsLoading(false);
          return;
        }
      }

      // Fetch from API
      const data = await getMenu();
      const items = Array.isArray(data) ? data : [];
      setMenuItems(items);
      
      // Cache the result
      setCachedMenu(items);
    } catch (error) {
      console.error('Error loading menu items:', error);
      setError(`Failed to load menu items: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMenuItems();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const resetForm = () => {
    setFormData({
      menuItemId: '',
      name: '',
      description: '',
      price: '',
      category: 'Uncategorized',
      available: true,
      image: '',
    });
    setEditingItem(null);
    setShowAddForm(false);
    setError(null);
    setSuccess(null);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      menuItemId: item.menuItemId || item.itemId || '',
      name: item.name || '',
      description: item.description || '',
      price: item.price || '',
      category: item.category || 'Uncategorized',
      available: item.available !== undefined ? item.available : true,
      image: item.image || '',
    });
    setShowAddForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (editingItem) {
        // Update existing item
        const updates = {
          name: formData.name,
          description: formData.description,
          price: parseFloat(formData.price),
          category: formData.category,
          available: formData.available,
          image: formData.image,
          restaurantId: restaurantId, // MULTI-TENANT: Include restaurantId in request body
        };
        await updateMenuItem(formData.menuItemId, updates, restaurantId);
        setSuccess('Menu item updated successfully!');
      } else {
        // Create new item
        const newItem = {
          menuItemId: formData.menuItemId || `item_${Date.now()}`,
          name: formData.name,
          description: formData.description,
          price: parseFloat(formData.price),
          category: formData.category,
          available: formData.available,
          image: formData.image,
          restaurantId: restaurantId, // MULTI-TENANT: Include restaurantId in request body
        };
        await createMenuItem(newItem, restaurantId);
        setSuccess('Menu item created successfully!');
      }

      // Invalidate cache and reload
      invalidateMenuCache();
      await loadMenuItems();
      resetForm();
    } catch (error) {
      console.error('Error saving menu item:', error);
      setError(`Failed to save menu item: ${error.message}`);
    }
  };

  const handleDelete = async (menuItemId) => {
    if (!window.confirm('Are you sure you want to delete this menu item?')) {
      return;
    }

    try {
      setError(null);
      await deleteMenuItem(menuItemId, restaurantId);
      setSuccess('Menu item deleted successfully!');
      
      // Invalidate cache and reload
      invalidateMenuCache();
      await loadMenuItems();
    } catch (error) {
      console.error('Error deleting menu item:', error);
      setError(`Failed to delete menu item: ${error.message}`);
    }
  };

  const toggleAvailable = async (item) => {
    try {
      setError(null);
      await updateMenuItem(item.menuItemId || item.itemId, {
        available: !item.available,
        restaurantId: restaurantId, // MULTI-TENANT: Include restaurantId in request body
      }, restaurantId);
      
      // Invalidate cache and reload
      invalidateMenuCache();
      await loadMenuItems();
    } catch (error) {
      console.error('Error updating availability:', error);
      setError(`Failed to update availability: ${error.message}`);
    }
  };

  return (
    <div className="menu-editor">
      <div className="menu-editor-header">
        <h2>Menu Editor</h2>
        <button
          className="add-item-btn"
          onClick={() => {
            resetForm();
            setShowAddForm(true);
          }}
        >
          ➕ Add New Item
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {showAddForm && (
        <div className="menu-form-container">
          <form className="menu-form" onSubmit={handleSubmit}>
            <h3>{editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
            
            <div className="form-group">
              <label>Menu Item ID *</label>
              <input
                type="text"
                name="menuItemId"
                value={formData.menuItemId}
                onChange={handleInputChange}
                required
                disabled={!!editingItem}
                placeholder="e.g., item_123"
              />
            </div>

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="e.g., Large Pepperoni Pizza"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="3"
                placeholder="Item description..."
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Price ($) *</label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Image URL</label>
              <input
                type="url"
                name="image"
                value={formData.image}
                onChange={handleInputChange}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="available"
                  checked={formData.available}
                  onChange={handleInputChange}
                />
                Available for ordering
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="save-btn">
                {editingItem ? '💾 Update Item' : '➕ Create Item'}
              </button>
              <button type="button" className="cancel-btn" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="loading">Loading menu items...</div>
      ) : (
        <div className="menu-items-list">
          {menuItems.length === 0 ? (
            <div className="empty-state">
              <p>No menu items found. Click "Add New Item" to get started.</p>
            </div>
          ) : (
            <table className="menu-items-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Available</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((item) => (
                  <tr key={item.menuItemId || item.itemId}>
                    <td className="item-id">{item.menuItemId || item.itemId}</td>
                    <td className="item-name">
                      <div className="item-name-main">{item.name}</div>
                      {item.description && (
                        <div className="item-description">{item.description}</div>
                      )}
                    </td>
                    <td className="item-category">{item.category || 'Uncategorized'}</td>
                    <td className="item-price">${parseFloat(item.price || 0).toFixed(2)}</td>
                    <td className="item-available">
                      <button
                        className={`toggle-available-btn ${item.available ? 'available' : 'unavailable'}`}
                        onClick={() => toggleAvailable(item)}
                      >
                        {item.available ? '✓ Available' : '✗ Unavailable'}
                      </button>
                    </td>
                    <td className="item-actions">
                      <button
                        className="edit-btn"
                        onClick={() => handleEdit(item)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(item.menuItemId || item.itemId)}
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default MenuEditor;

