'use client';

import React, { useEffect, useRef, useState } from 'react';
import CategoryTabs from './CategoryTabs';
import ItemCard from './ItemCard';
import { getMenu } from '@/lib/api';
import { mockMenu } from '@/lib/mocks';

export default function MenuPageClient() {
  const hasRestoredScroll = useRef(false);
  const [groupedItems, setGroupedItems] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch menu on client-side to use localStorage cache
    async function fetchMenu() {
      try {
        setIsLoading(true);
        const data = await getMenu();
        const menuData = Array.isArray(data) ? data : mockMenu;
        const availableItems = menuData.filter(item => item.available);

        // Group items by category
        const grouped = availableItems.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(item);
          return acc;
        }, {});

        // Create ordered object with Lunch first if it exists
        const ordered = {};
        if (grouped['Lunch']) {
          ordered['Lunch'] = grouped['Lunch'];
        }
        for (const category in grouped) {
          if (category !== 'Lunch') {
            ordered[category] = grouped[category];
          }
        }

        setGroupedItems(ordered);
      } catch (error) {
        console.error('❌ Error fetching menu, using mock data:', error);
        // Fallback to mock data
        const mockGrouped = mockMenu.filter(item => item.available).reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(item);
          return acc;
        }, {});
        setGroupedItems(mockGrouped);
      } finally {
        setIsLoading(false);
      }
    }

    fetchMenu();
  }, []);

  useEffect(() => {
    // Restore scroll position after page loads
    const savedScrollPosition = sessionStorage.getItem('menuScrollPosition');
    if (savedScrollPosition) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedScrollPosition, 10));
          sessionStorage.removeItem('menuScrollPosition');
          hasRestoredScroll.current = true;
        });
      });
    } else {
      hasRestoredScroll.current = true;
    }
  }, []);

  const handleCategoryChange = (category) => {
    // Wait for scroll restoration to complete before scrolling to category
    if (!hasRestoredScroll.current) {
      setTimeout(() => handleCategoryChange(category), 150);
      return;
    }

    if (category === 'All') {
        window.scrollTo({top: 0, behavior: 'smooth'});
        return;
    }
    
    // Use requestAnimationFrame to ensure layout is stable before calculating
    requestAnimationFrame(() => {
      const element = document.getElementById(category);
      if (element) {
        const yOffset = -40; 
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading menu...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Sticky container breaks out of parent padding using negative margins */}
      <div 
        className="sticky top-0 bg-white z-10 py-2 border-b border-gray-200 -mx-4 px-4" 
        style={{ 
          isolation: 'isolate',
          minHeight: '52px',
          contain: 'layout'
        }}
      >
        <CategoryTabs onCategoryChange={handleCategoryChange} />
      </div>
      
      {Object.entries(groupedItems).map(([category, items]) => (
        <section key={category} id={category} className="pt-16">
          <h2 className="text-2xl font-bold mb-8">{category}</h2>
          <div>
            {items.map(item => (
              <ItemCard key={item.itemId} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
