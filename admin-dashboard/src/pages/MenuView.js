import React from 'react';
import '../styles/MenuView.css';

function MenuView() {

  // Mock menu data - replace with real API calls
  const menuData = {
    categories: [
      {
        name: 'Pizza',
        items: [
          { name: 'Large Pepperoni', price: 18.99, description: 'Classic pepperoni pizza' },
          { name: 'Large Supreme', price: 22.99, description: 'Pepperoni, sausage, peppers, onions, mushrooms' },
        ],
      },
      {
        name: 'Wings',
        items: [
          { name: 'Wings (12pc)', price: 14.99, description: 'Buffalo, BBQ, or Garlic Parmesan' },
        ],
      },
      {
        name: 'Drinks',
        items: [
          { name: '2-Liter Coke', price: 4.99, description: '2-liter bottle' },
        ],
      },
    ],
  };

  return (
    <div className="menu-view">
      <header className="menu-header">
        <h1>Our Menu</h1>
        <p className="menu-subtitle">Order by calling (555) 123-4567</p>
      </header>

      <div className="menu-content">
        {menuData.categories.map((category, catIdx) => (
          <section key={catIdx} className="menu-category">
            <h2 className="category-title">{category.name}</h2>
            <div className="category-items">
              {category.items.map((item, itemIdx) => (
                <div key={itemIdx} className="menu-item">
                  <div className="item-info">
                    <h3 className="item-name">{item.name}</h3>
                    {item.description && (
                      <p className="item-description">{item.description}</p>
                    )}
                  </div>
                  <div className="item-price">${item.price.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="menu-footer">
        <p>Call (555) 123-4567 to place your order</p>
      </footer>
    </div>
  );
}

export default MenuView;

