'use client';

import React, { useState, useEffect, useRef } from 'react';

const baseCategories = [
  'All', 'Lunch', 'Appetizers', 'Soup', 'Seafood', 'Beef & Lamb',
  'Poultry', 'Pork', 'Vegetables', 'Rice & Noodles', 'Desserts', 'Drinks'
];

function CategoryTabs({ onCategoryChange }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [categories, setCategories] = useState(baseCategories);
  const scrollContainerRef = useRef(null);
  const buttonRefs = useRef({});

  useEffect(() => {
    const now = new Date().getHours();
    // Lunch is available from 11 AM to 2 PM (14:00)
    const isLunchTime = now >= 11 && now <= 14; 
    
    if (isLunchTime) {
      const otherCategories = baseCategories.filter(c => c !== 'Lunch' && c !== 'All');
      const reorderedCategories = ['All', 'Lunch', ...otherCategories];
      setCategories(reorderedCategories);
    } else {
      // Otherwise, use the default order
      setCategories(baseCategories);
    }
  }, []);

  const handleClick = (category, index) => {
    setActiveCategory(category);
    onCategoryChange(category);

    // Wait for vertical scroll animation to complete before scrolling horizontally
    // Smooth scroll typically takes ~500ms, so we wait a bit longer to ensure it's done
    setTimeout(() => {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        const button = buttonRefs.current[category];
        
        if (container && button) {
          const containerRect = container.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          
          // Calculate the current scroll position
          const currentScroll = container.scrollLeft;
          
          // Calculate the position of the button relative to the container
          const buttonLeft = buttonRect.left - containerRect.left + currentScroll;
          
          // Calculate how much to scroll to align button to the left
          const scrollTo = buttonLeft - 16; // 16px padding/margin
          
          // Get the maximum scroll position
          const maxScroll = container.scrollWidth - container.clientWidth;
          
          // Scroll to the calculated position, but don't exceed max scroll
          const finalScroll = Math.min(Math.max(0, scrollTo), maxScroll);
          
          // Only scroll if the button is not already visible/aligned
          if (Math.abs(container.scrollLeft - finalScroll) > 5) {
            container.scrollTo({
              left: finalScroll,
              behavior: 'smooth'
            });
          }
        }
      });
    }, 600); // Wait for vertical scroll animation to complete
  };

  return (
    <div 
      ref={scrollContainerRef}
      className="flex overflow-x-auto space-x-2 mb-2 pb-2 scrollbar-hide"
      style={{ 
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        touchAction: 'pan-x'
      }}
    >
      {categories.map((category, index) => (
        <button
          key={category}
          ref={(el) => (buttonRefs.current[category] = el)}
          className={`flex-shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${activeCategory === category
              ? 'bg-[#ef4444] text-white'
              : 'bg-[#f9fafb] text-[#111827] hover:bg-gray-200'}`}
          onClick={() => handleClick(category, index)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

export default CategoryTabs;
