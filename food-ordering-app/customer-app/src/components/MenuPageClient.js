'use client';

import React, { useEffect, useRef, useState } from 'react';
import CategoryTabs from './CategoryTabs';
import ItemCard from './ItemCard';
import { getMenu, getSettings } from '@/lib/api';
import { mockMenu } from '@/lib/mocks';
import { isStoreOpen } from '@/lib/storeHours';

// Sanitize category names to valid HTML IDs
const sanitizeId = (str) => {
  return str.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
};

export default function MenuPageClient() {
  const hasRestoredScroll = useRef(false);
  const [groupedItems, setGroupedItems] = useState({});
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [storeHours, setStoreHours] = useState(null);
  const stickyHeaderRef = useRef(null);
  const isManualCategoryChangeRef = useRef(false);

  // Load store hours on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (settings && settings.hours) {
          setStoreHours(settings.hours);
        }
      } catch (error) {
        console.error('Error loading store hours:', error);
        // Continue without hours check (assume open)
      }
    };
    
    loadSettings();
  }, []);

  useEffect(() => {
    // Fetch menu on client-side to use localStorage cache
    async function fetchMenu() {
      // Check if store is open before fetching menu
      if (storeHours !== null && !isStoreOpen(storeHours)) {
        console.log('Store is closed. Skipping menu fetch.');
        setIsLoading(false);
        setGroupedItems({});
        setCategories(['All']);
        return;
      }
      
      try {
        setIsLoading(true);
        const data = await getMenu();
        const menuData = Array.isArray(data) ? data : mockMenu;
        const availableItems = menuData.filter(item => item.available);

        // Check if we're outside lunch hours (11 AM - 2 PM)
        const now = new Date().getHours();
        const isLunchTime = now >= 11 && now <= 14;
        
        // Filter out Lunch items if outside lunch hours
        const filteredItems = isLunchTime 
          ? availableItems 
          : availableItems.filter(item => item.category !== 'Lunch');

        // Group items by category
        const grouped = filteredItems.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(item);
          return acc;
        }, {});

        // Create ordered object with Lunch first if it exists and is available
        const ordered = {};
        const categoryList = ['All']; // Always start with 'All'
        
        if (isLunchTime && grouped['Lunch']) {
          ordered['Lunch'] = grouped['Lunch'];
          categoryList.push('Lunch');
        }
        
        // Add other categories
        for (const category in grouped) {
          if (category !== 'Lunch') {
            ordered[category] = grouped[category];
            categoryList.push(category);
          }
        }

        setGroupedItems(ordered);
        setCategories(categoryList);
      } catch (error) {
        console.error('❌ Error fetching menu, using mock data:', error);
        // Fallback to mock data
        const now = new Date().getHours();
        const isLunchTime = now >= 11 && now <= 14;
        const mockAvailable = mockMenu.filter(item => item.available);
        const mockFiltered = isLunchTime 
          ? mockAvailable 
          : mockAvailable.filter(item => item.category !== 'Lunch');
        
        const mockGrouped = mockFiltered.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(item);
          return acc;
        }, {});
        
        // Create category list from mock data
        const mockCategoryList = ['All'];
        for (const category in mockGrouped) {
          if (category !== 'Lunch' || isLunchTime) {
            mockCategoryList.push(category);
          }
        }
        if (isLunchTime && mockGrouped['Lunch']) {
          mockCategoryList.splice(1, 0, 'Lunch');
        }
        
        setGroupedItems(mockGrouped);
        setCategories(mockCategoryList);
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

  // Sync active category with visible section using IntersectionObserver
  useEffect(() => {
    if (!hasRestoredScroll.current || isLoading) return;

    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px', // Trigger when section is in upper portion of viewport
      threshold: 0
    };

    let debounceTimer;
    let isScrolling = false;
    
    // Track scrolling state - mark as scrolling, then debounce the end
    const handleScroll = () => {
      isScrolling = true;
      clearTimeout(debounceTimer);
      // Wait 300ms after scroll stops before allowing observer updates
      debounceTimer = setTimeout(() => {
        isScrolling = false;
      }, 300);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });

    const observerCallback = (entries) => {
      // Don't update if user manually changed category recently or if actively scrolling
      if (isManualCategoryChangeRef.current || isScrolling) {
        return;
      }

      // Check if we're at the top of the page (for "All" category)
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      if (scrollTop < 100) {
        if (activeCategory !== 'All') {
          setActiveCategory('All');
        }
        return;
      }

      // Find the entry with the highest intersection ratio that's intersecting
      const visibleEntries = entries.filter(entry => entry.isIntersecting);
      if (visibleEntries.length > 0) {
        // Sort by intersection ratio, highest first
        visibleEntries.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const topEntry = visibleEntries[0];
        if (topEntry) {
          const categoryId = topEntry.target.id;
          // Convert ID back to category name
          const category = Object.keys(groupedItems).find(
            cat => sanitizeId(cat) === categoryId
          );
          if (category && category !== activeCategory) {
            setActiveCategory(category);
          }
        }
      }
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    
    // Observe all category sections
    Object.keys(groupedItems).forEach(category => {
      const element = document.getElementById(sanitizeId(category));
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(debounceTimer);
    };
  }, [groupedItems, isLoading, activeCategory]);

  const handleCategoryChange = (category, onScrollComplete) => {
    // Mark as manual change FIRST to prevent IntersectionObserver from overriding
    // This must happen before any state updates or scrolls
    isManualCategoryChangeRef.current = true;
    
    // Update active category immediately (should already be set by CategoryTabs, but ensure it)
    setActiveCategory(category);
    
    // Wait for scroll restoration to complete before scrolling to category
    if (!hasRestoredScroll.current) {
      setTimeout(() => handleCategoryChange(category, onScrollComplete), 150);
      return;
    }

    if (category === 'All') {
      window.scrollTo({top: 0, behavior: 'smooth'});
      if (onScrollComplete) {
        // Wait for scroll to complete
        const checkScroll = () => {
          if (window.pageYOffset === 0) {
            // Re-enable IntersectionObserver after scroll completes
            setTimeout(() => {
              isManualCategoryChangeRef.current = false;
            }, 800);
            onScrollComplete();
          } else {
            requestAnimationFrame(checkScroll);
          }
        };
        requestAnimationFrame(checkScroll);
      } else {
        // Re-enable IntersectionObserver after a delay (longer to ensure scroll is done)
        setTimeout(() => {
          isManualCategoryChangeRef.current = false;
        }, 1500);
      }
      return;
    }
    
    // Use sanitized ID for element lookup
    const sanitizedId = sanitizeId(category);
    
    // Calculate dynamic offset based on sticky header height for all viewport sizes
    const calculateOffset = () => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      
      if (isMobile) {
        // Mobile: Account for navbar (64px) + fixed category tabs header
        // Navbar is at top-0 with h-16 (64px)
        // Category tabs are at top-16 (64px from top), so they're below the navbar
        let totalOffset = 64; // Navbar height (h-16 = 64px)
        
        if (stickyHeaderRef.current) {
          // Get the actual height of the category tabs container
          const categoryTabsHeight = stickyHeaderRef.current.offsetHeight;
          totalOffset += categoryTabsHeight;
        } else {
          // Fallback: try to find the fixed category tabs header
          const mobileHeader = document.querySelector('.fixed.top-16');
          if (mobileHeader) {
            totalOffset += mobileHeader.offsetHeight;
          } else {
            // Default estimate: navbar (64px) + estimated category tabs (~56px)
            totalOffset += 56;
          }
        }
        
        // Add small padding to ensure category title is fully visible
        return totalOffset + 84;
      } else {
        // Desktop: Only account for navbar (64px) + small padding
        // Category tabs are in sidebar, not sticky, so they don't affect scroll
        const navbar = document.querySelector('nav.sticky.top-0');
        if (navbar) {
          return navbar.offsetHeight + 8; // Navbar height + padding
        }
        // Fallback: assume 64px navbar + 8px padding
        return 72;
      }
    };
    
    // Use requestAnimationFrame to ensure layout is stable before calculating
    requestAnimationFrame(() => {
      const element = document.getElementById(sanitizedId);
      if (element) {
        // Try to find the h2 (category title) inside the section for more precise positioning
        const categoryTitle = element.querySelector('h2');
        const targetElement = categoryTitle || element;
        
        const offset = calculateOffset();
        const elementTop = targetElement.getBoundingClientRect().top;
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const targetScroll = elementTop + currentScroll - offset;
        
        // Ensure we don't scroll below 0 and properly position the category header
        window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        
        // Wait for scroll to complete using scroll event listener
        if (onScrollComplete) {
          let scrollEndTimer;
          const handleScroll = () => {
            clearTimeout(scrollEndTimer);
            scrollEndTimer = setTimeout(() => {
              window.removeEventListener('scroll', handleScroll);
              // Re-enable IntersectionObserver after scroll completes
              // Use longer delay to ensure scroll animation is fully done
              setTimeout(() => {
                isManualCategoryChangeRef.current = false;
              }, 800);
              onScrollComplete();
            }, 100);
          };
          window.addEventListener('scroll', handleScroll, { passive: true });
          
          // Cleanup: remove listener after 3 seconds max
          setTimeout(() => {
            window.removeEventListener('scroll', handleScroll);
            if (scrollEndTimer) {
              clearTimeout(scrollEndTimer);
            }
            // Re-enable IntersectionObserver as fallback (longer delay to ensure scroll is done)
            setTimeout(() => {
              isManualCategoryChangeRef.current = false;
            }, 500);
          }, 3000);
        } else {
          // Re-enable IntersectionObserver after a delay if no callback
          setTimeout(() => {
            isManualCategoryChangeRef.current = false;
          }, 1000);
        }
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
    <>
      {/* Mobile: Horizontal category tabs fixed to top */}
      <div className="md:hidden" ref={stickyHeaderRef}>
        <div 
          className="fixed top-16 left-0 right-0 bg-white z-30 py-2 border-b border-gray-200 px-4 shadow-sm"
        >
          <CategoryTabs 
            categories={categories}
            groupedItems={groupedItems}
            activeCategory={activeCategory}
            onActiveCategoryChange={setActiveCategory}
            onCategoryChange={handleCategoryChange} 
          />
        </div>
      </div>

      <div className="md:flex md:py-4 md:gap-8 lg:gap-12">
        {/* Desktop: Vertical category tabs on the left (1/4 width) */}
        <div className="hidden md:block md:w-1/4 md:sticky md:top-0 md:self-start md:pt-2">
          <div className="max-h-[calc(100vh-2rem)] overflow-y-auto">
            <CategoryTabs 
              categories={categories}
              groupedItems={groupedItems}
              activeCategory={activeCategory}
              onActiveCategoryChange={setActiveCategory}
              onCategoryChange={handleCategoryChange} 
            />
          </div>
        </div>
        
        {/* Menu items on the right (3/4 width on desktop) */}
        <div className="md:w-3/4 mt-[120px] md:mt-0">
          {Object.entries(groupedItems).map(([category, items]) => (
            <section 
              key={category} 
              id={sanitizeId(category)} 
              className="pb-8 scroll-mt-[60px] md:scroll-mt-[80px]"
            >
              <h2 className="text-2xl font-bold mb-8">{category}</h2>
              <div>
                {items.map(item => (
                  <ItemCard key={item.itemId} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
