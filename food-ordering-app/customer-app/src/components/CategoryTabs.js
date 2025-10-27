import React, { useState } from 'react';

const categories = ['All', 'Lunch', 'Appetizers', 'Soup', 'Seafood', 'Beef & Lamb', 'Poultry', 'Pork', 'Vegetables', 'Rice & Noodles', 'Desserts', 'Drinks'];

function CategoryTabs({ onCategoryChange }) {
  const [activeCategory, setActiveCategory] = useState('All');

  const handleClick = (category) => {
    setActiveCategory(category);
    onCategoryChange(category);
  };

  return (
    <div className="flex overflow-x-auto space-x-4 mb-4">
      {categories.map((category) => (
        <button
          key={category}
          className={`px-4 py-2 rounded-lg ${activeCategory === category ? 'bg-[#ef4444] text-white' : 'bg-[#f9fafb] text-[#111827]'}`}
          onClick={() => handleClick(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

export default CategoryTabs;