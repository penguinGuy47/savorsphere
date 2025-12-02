'use client';
import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { useCart } from '@/context/CartContext'; 

function ItemCard({ item }) {
    const { cart, addToCart, setIsCartOpen } = useCart();
    const isLunchCategory = item.category === 'Lunch';
    const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);

    useEffect(() => {
        // Check if device is mobile or tablet (portrait)
        const checkDevice = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            // Mobile/tablet portrait: width <= 1024px (tablets) and in portrait mode
            // Or mobile: width <= 768px regardless of orientation
            const isPortrait = height > width;
            const isSmallScreen = width <= 768;
            const isTabletPortrait = width <= 1024 && isPortrait && width > 768;
            
            setIsMobileOrTablet(isSmallScreen || isTabletPortrait);
        };

        checkDevice();
        window.addEventListener('resize', checkDevice);
        window.addEventListener('orientationchange', checkDevice);

        return () => {
            window.removeEventListener('resize', checkDevice);
            window.removeEventListener('orientationchange', checkDevice);
        };
    }, []);

    // Find the item in cart - for non-Lunch items, match by itemId
    // For Lunch items, we only check if any item with this itemId exists (options may differ)
    const cartItem = cart.find((i) => {
        if (isLunchCategory) {
            // For Lunch items, we'll show quantity if any version exists
            // But typically they need to configure options first
            return i.itemId === item.itemId;
        } else {
            // For non-Lunch items, exact match by itemId
            return i.itemId === item.itemId;
        }
    });

    const currentQuantity = cartItem?.quantity || 0;
    const showQuantity = currentQuantity > 0;

    const handleAddToCart = (e) => {
        // Disable add functionality on mobile/tablet portrait - must go to detail page
        if (isMobileOrTablet) {
            return; // Let the Link handle navigation
        }

        // For Lunch items, don't prevent navigation - let it go to detail page
        if (isLunchCategory) {
            return; // Let the Link handle navigation
        }
        
        e.stopPropagation(); // Prevent navigation if the card is a link
        e.preventDefault();
        
        // Create a plain JavaScript object clone to prevent issues
        const itemToAdd = JSON.parse(JSON.stringify(item));

        addToCart(itemToAdd);
        
        // Open cart preview on desktop when adding item
        if (typeof window !== 'undefined' && window.innerWidth >= 768) {
            setIsCartOpen(true);
        }
        
        console.log('Added to cart:', itemToAdd);
    };

    const handleLinkClick = () => {
        // Store scroll position before navigating
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('menuScrollPosition', window.scrollY.toString());
        }
    };

    const cardContent = (
        <div className="flex justify-between items-center p-4 border-b hover:bg-gray-50 cursor-pointer transition-all duration-200 ease-out">
            <div className="flex-1 mr-4">
                <h3 className="font-semibold text-lg transition-colors duration-200">{item.name}</h3>
                {item.description && <p className="text-gray-600 text-sm mt-1">{item.description}</p>}
                <p className="font-bold mt-2">${item.price ? item.price.toFixed(2) : 'N/A'}</p>
            </div>
            <div className="relative">
                {item.image && (
                    <img 
                        src={item.image} 
                        alt={item.name} 
                        className="w-28 h-28 object-cover rounded-md transition-transform duration-200 group-hover:scale-105" 
                    />
                )}
                <button 
                    onClick={handleAddToCart}
                    data-item-card-button
                    className={`absolute -bottom-3 -right-3 bg-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg transition-all duration-200 transform hover:scale-110 active:scale-95 z-10 ${
                        showQuantity ? 'bg-[#ef4444] text-white' : ''
                    }`}
                    aria-label={isLunchCategory || isMobileOrTablet ? `View ${item.name} details` : `Add ${item.name} to cart`}
                >
                    <span className={`text-xl font-semibold transition-colors duration-200 ${showQuantity ? 'text-black' : 'text-gray-800'}`}>
                        {showQuantity ? currentQuantity : '+'}
                    </span>
                </button>
            </div>
        </div>
    );

    // All items are clickable and link to their detail page
    return (
        <Link 
            href={`/item/${item.itemId}`} 
            className="block group" 
            onClick={handleLinkClick}
            prefetch={true}
        >
            {cardContent}
        </Link>
    );
}

export default ItemCard;