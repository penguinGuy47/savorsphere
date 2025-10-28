import React, { useState } from 'react';

const categories = [
  'All', 'Lunch', 'Appetizers', 'Soup', 'Seafood', 'Beef & Lamb',
  'Poultry', 'Pork', 'Vegetables', 'Rice & Noodles', 'Desserts', 'Drinks'
];

function CategoryTabs({ onCategoryChange }) {
  const [activeCategory, setActiveCategory] = useState('All');

  const handleClick = (category) => {
    setActiveCategory(category);
    onCategoryChange(category);
  };

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
      {categories.map((category) => (
        <button
          key={category}
          className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition
            ${activeCategory === category
              ? 'bg-[#ef4444] text-white'
              : 'bg-[#f9fafb] text-[#111827] hover:bg-gray-200'}`}
          onClick={() => handleClick(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

export default CategoryTabs;
