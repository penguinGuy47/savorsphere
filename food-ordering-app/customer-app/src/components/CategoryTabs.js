'use client';

import React, { useState, useEffect, useRef } from 'react';

// Sanitize category names to valid HTML IDs (must match MenuPageClient)
const sanitizeId = (str) => {
  return str.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
};

function CategoryTabs({ categories: propCategories, groupedItems, onCategoryChange, activeCategory: externalActiveCategory, onActiveCategoryChange }) {
  const [internalActiveCategory, setInternalActiveCategory] = useState('All');
  const scrollContainerRef = useRef(null);
  const buttonRefs = useRef({});
  const scrollCompleteCallbackRef = useRef(null);

  // Use external active category if provided, otherwise use internal state
  const activeCategory = externalActiveCategory !== undefined ? externalActiveCategory : internalActiveCategory;

  // Use categories from props if provided, otherwise derive from groupedItems
  const categories = propCategories || (groupedItems ? ['All', ...Object.keys(groupedItems)] : ['All']);

  // Scroll horizontal tabs to align active category to the left on mobile
  const scrollToActiveTab = (immediate = false, targetCategory = null) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (!isMobile || !scrollContainerRef.current) {
      return;
    }

    const categoryToScroll = targetCategory || activeCategory;
    const button = buttonRefs.current[categoryToScroll];
    
    if (!button) {
      return;
    }

    const container = scrollContainerRef.current;
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (!container || !button) return;
      
      // Get accurate positions using getBoundingClientRect
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      // Calculate how much we need to scroll to align button to left edge
      const currentScroll = container.scrollLeft;
      const buttonLeftRelativeToContainer = buttonRect.left - containerRect.left;
      const scrollNeeded = currentScroll + buttonLeftRelativeToContainer;
      
      // Clamp to valid scroll range
      const maxScroll = container.scrollWidth - container.clientWidth;
      const finalScroll = Math.max(0, Math.min(scrollNeeded, maxScroll));
      
      // Only scroll if needed
      if (Math.abs(container.scrollLeft - finalScroll) > 1) {
        container.scrollTo({
          left: finalScroll,
          behavior: immediate ? 'auto' : 'smooth'
        });
      }
    });
  };

  // Scroll to active category on mobile when component mounts or active category changes
  // Skip if this is from a manual click (handled in handleClick)
  const isManualScrollRef = useRef(false);
  useEffect(() => {
    if (!isManualScrollRef.current) {
      scrollToActiveTab();
    }
    isManualScrollRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  const handleClick = (category, index) => {
    // Update active category immediately and synchronously
    const newActiveCategory = category;
    if (externalActiveCategory === undefined) {
      setInternalActiveCategory(newActiveCategory);
    } else if (onActiveCategoryChange) {
      // Call synchronously to ensure state updates before any scroll happens
      onActiveCategoryChange(newActiveCategory);
    }
    
    // Immediately scroll the tab to the left on mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) {
      isManualScrollRef.current = true; // Prevent useEffect from scrolling
      // Scroll to the clicked category immediately
      scrollToActiveTab(false, category);
    }
    
    // Store callback for when vertical scroll completes (for additional sync if needed)
    scrollCompleteCallbackRef.current = () => {
      if (isMobile) {
        scrollToActiveTab(true, category); // Use immediate scroll after vertical scroll completes
      }
      scrollCompleteCallbackRef.current = null;
    };
    
    // Use requestAnimationFrame to ensure state update has been processed
    // before triggering the scroll, which might trigger IntersectionObserver
    requestAnimationFrame(() => {
      // Trigger vertical scroll, which will call callback when done
      onCategoryChange(category, scrollCompleteCallbackRef.current);
    });
  };

  return (
    <div 
      ref={scrollContainerRef}
      className="flex md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto space-x-2 md:space-x-0 md:space-y-2 md:mt-24 mb-2 pb-2 md:mb-0 md:pb-0 scrollbar-hide"
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
          className={`flex-shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors md:w-full md:text-left
            ${activeCategory === category
              ? 'bg-[#1A3636] text-white'
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
