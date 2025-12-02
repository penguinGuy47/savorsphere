'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMenu } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { mockMenu } from '@/lib/mocks';
// Note: Hours are stored in admin dashboard's localStorage, not accessible here

function ItemDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const itemId = params.itemId;
    const [item, setItem] = useState(null);
    const [options, setOptions] = useState({ mealType: 'lunch', rice: 'white' });
    const [quantity, setQuantity] = useState(1);
    const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
    const [isAddedToCart, setIsAddedToCart] = useState(false);
    const [showPriceText, setShowPriceText] = useState(false);
    const [lastClickedButton, setLastClickedButton] = useState(null);
    const { addToCart, setIsCartOpen } = useCart();

    useEffect(() => {
        // Check if device is mobile or tablet
        const checkDevice = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
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

    const handleBack = () => {
        // Smooth transition back to menu
        router.push('/', { scroll: false });
        // Restore scroll position after navigation
        setTimeout(() => {
            const savedScroll = sessionStorage.getItem('menuScrollPosition');
            if (savedScroll) {
                window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'smooth' });
                sessionStorage.removeItem('menuScrollPosition');
            }
        }, 100);
    };

    useEffect(() => {
        // Note: Hours check is handled by admin dashboard - customer app can always show menu
        getMenu()
        .then((items) => setItem(items.find((i) => i.itemId === itemId)))
        .catch(() => setItem(mockMenu.find((i) => i.itemId === itemId)));
    }, [itemId]);

    // Check if we're outside lunch hours (11 AM - 2 PM)
    const now = new Date().getHours();
    const isLunchTime = now >= 11 && now <= 14;
    const isLunchCategory = item?.category === 'Lunch';
    
    // If outside lunch hours and it's a lunch item, default to dinner
    useEffect(() => {
        if (isLunchCategory && !isLunchTime && options.mealType === 'lunch') {
            setOptions(prev => ({ ...prev, mealType: 'dinner' }));
        }
    }, [isLunchCategory, isLunchTime, itemId, options.mealType]); // Update when item changes or lunch time changes

    const handleAdd = () => {
        // Only check time for lunch availability if item category is "Lunch"
        if (item?.category === 'Lunch') {
            const now = new Date().getHours();
            if (options.mealType === 'lunch' && (now < 11 || now > 14)) {
                alert('Lunch not available');
                return;
            }
            // Include options only for Lunch category items
            // Add the item multiple times based on quantity
            for (let i = 0; i < quantity; i++) {
                addToCart({ ...item, options });
            }
        } else {
            // For non-Lunch items, add without options
            for (let i = 0; i < quantity; i++) {
                addToCart(item);
            }
        }

        // On mobile/tablet, show success state and redirect after 1 seconds
        if (isMobileOrTablet) {
            setIsAddedToCart(true);
            setShowPriceText(true);
            // Redirect after 1 seconds with smooth transition
            setTimeout(() => {
                // Scroll position is already stored in sessionStorage from ItemCard
                router.push('/', { scroll: false });
                // Restore scroll position after a brief delay
                setTimeout(() => {
                    const savedScroll = sessionStorage.getItem('menuScrollPosition');
                    if (savedScroll) {
                        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'smooth' });
                        sessionStorage.removeItem('menuScrollPosition');
                    }
                }, 100);
            }, 1000);
        } else {
            // On desktop, redirect to homepage and open cart preview
            router.push('/', { scroll: false });
            // Open cart preview after navigation completes
            setTimeout(() => {
                setIsCartOpen(true);
                // Restore scroll position after a brief delay
                setTimeout(() => {
                    const savedScroll = sessionStorage.getItem('menuScrollPosition');
                    if (savedScroll) {
                        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'smooth' });
                        sessionStorage.removeItem('menuScrollPosition');
                    }
                }, 100);
            }, 100);
        }
    };

    const handleIncreaseQuantity = () => {
        setLastClickedButton('increase');
        setQuantity(prev => prev + 1);
        setTimeout(() => setLastClickedButton(null), 200);
    };

    const handleDecreaseQuantity = () => {
        setLastClickedButton('decrease');
        setQuantity(prev => Math.max(1, prev - 1));
        setTimeout(() => setLastClickedButton(null), 200);
    };

    if (!item) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // Hide lunch options if outside lunch hours
    const showLunchOptions = isLunchCategory && isLunchTime;
    const showRiceOption = isLunchCategory && isLunchTime && options.mealType === 'lunch';
    
    const totalPrice = (Number(item.price) || 0) * quantity;

    // TODO: Replace with actual placeholder image
    const PlaceholderImage = () => (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <div className="grid grid-cols-4 gap-2 p-4 w-full h-full">
                {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="bg-gray-300 rounded flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="relative item-detail-page">
            {/* Back button - Mobile */}
            <button
                onClick={handleBack}
                className="md:hidden fixed top-4 left-4 z-50 bg-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-gray-100 transition-all duration-200 hover:scale-105"
                aria-label="Go back to menu"
            >
                <span className="text-2xl font-semibold text-gray-800">&times;</span>
            </button>

            {/* Back link - Desktop */}
            <button
                onClick={handleBack}
                className="hidden md:flex items-center gap-2 text-gray-700 hover:text-gray-900 mb-6 transition-all duration-200 hover:gap-3 group"
            >
                <svg className="w-5 h-5 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to SavorSphere</span>
            </button>

            {/* Mobile Layout */}
            <div className="md:hidden mt-18 card pb-24">
                {/* Item Image */}
                {item.image ? (
                    <div className="mb-4 mx-auto">
                        <img 
                            src={item.image} 
                            alt={item.name} 
                            className="w-full h-64 object-cover"
                        />
                    </div>
                ) : (
                    <div className="mb-4 -mx-4 h-64">
                        <PlaceholderImage />
                    </div>
                )}
                
                {/* Item Name and Price */}
                <div className="mb-3 pl-2">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{item.name}</h2>
                    <p className="text-xl font-bold text-gray-900">${item.price.toFixed(2)}</p>
                </div>
                
                {/* Description */}
                {item.description && (
                    <p className="text-gray-700 mb-6 pl-2 leading-relaxed">{item.description}</p>
                )}
                
                {/* Divider */}
                <div className="border-t border-gray-200 my-6"></div>
                
                {/* Quantity selector */}
                <div className="mb-6 pl-2 flex items-center gap-3">
                    <label className="font-bold text-gray-900">Quantity:</label>
                    <div className="inline-flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden">
                        <button
                            onClick={handleDecreaseQuantity}
                            disabled={quantity === 1}
                            className={`px-3 py-2 flex items-center justify-center transition-colors text-gray-800 ${
                                quantity === 1
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : `hover:bg-gray-50 ${lastClickedButton === 'decrease' ? 'bg-gray-200' : ''}`
                            }`}
                            aria-label="Decrease quantity"
                        >
                            <span className="text-lg font-medium">−</span>
                        </button>
                        <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => {
                                const value = parseInt(e.target.value) || 1;
                                setQuantity(Math.max(1, value));
                            }}
                            className="w-12 border-0 border-l border-r border-gray-300 text-center font-medium text-gray-800 focus:outline-none focus:ring-0 py-2"
                        />
                        <button
                            onClick={handleIncreaseQuantity}
                            className={`px-3 py-2 flex items-center justify-center transition-colors text-gray-800 hover:bg-gray-50 ${lastClickedButton === 'increase' ? 'bg-gray-200' : ''}`}
                            aria-label="Increase quantity"
                        >
                            <span className="text-lg font-medium">+</span>
                        </button>
                    </div>
                </div>

                {/* Divider */}
                {(showLunchOptions || isLunchCategory || showRiceOption) && (
                    <div className="border-t border-gray-200 my-6"></div>
                )}

                {/* Meal Type Options */}
                {(showLunchOptions || isLunchCategory) && (
                    <div className="mb-6">
                        <div className="mb-2">
                            <label className="block font-bold text-gray-900">Meal Type</label>
                            <p className="text-sm text-gray-600">Select one</p>
                        </div>
                        <div className="space-y-2 mt-3">
                            {showLunchOptions && (
                                <button
                                    onClick={() => setOptions({ ...options, mealType: 'lunch' })}
                                    className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                        options.mealType === 'lunch'
                                            ? 'bg-[#020403] text-white justify-between'
                                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                    }`}
                                >
                                    <span className="font-medium">Lunch</span>
                                    {options.mealType === 'lunch' && (
                                        <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => setOptions({ ...options, mealType: 'dinner' })}
                                disabled={isLunchCategory && !isLunchTime && !showLunchOptions}
                                className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                    options.mealType === 'dinner'
                                        ? 'bg-[#020403] text-white justify-between'
                                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                } ${isLunchCategory && !isLunchTime && !showLunchOptions ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                <span className="font-medium">Dinner</span>
                                {options.mealType === 'dinner' && (
                                    <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        {isLunchCategory && !isLunchTime && !showLunchOptions && (
                            <p className="text-sm text-gray-500 mt-2">Lunch is only available from 11 AM - 2 PM</p>
                        )}
                    </div>
                )}

                {/* Rice Options */}
                {showRiceOption && (
                    <>
                        <div className="border-t border-gray-200 my-6"></div>
                        <div className="mb-6">
                            <div className="mb-2">
                                <label className="block font-bold text-gray-900">Rice</label>
                                <p className="text-sm text-gray-600">Select one</p>
                            </div>
                            <div className="space-y-2 mt-3">
                                <button
                                    onClick={() => setOptions({ ...options, rice: 'white' })}
                                    className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                        options.rice === 'white'
                                            ? 'bg-[#020403] text-white justify-between'
                                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                    }`}
                                >
                                    <span className="font-medium">White</span>
                                    {options.rice === 'white' && (
                                        <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    onClick={() => setOptions({ ...options, rice: 'fried' })}
                                    className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                        options.rice === 'fried'
                                            ? 'bg-[#020403] text-white justify-between'
                                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                    }`}
                                >
                                    <span className="font-medium">Fried</span>
                                    {options.rice === 'fried' && (
                                        <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex md:gap-8 md:max-w-6xl md:mx-auto">
                {/* Left: Image Section (40-50%) */}
                <div className="w-[45%] flex-shrink-0">
                    {item.image ? (
                        <img 
                            src={item.image} 
                            alt={item.name} 
                            className="w-full h-[600px] object-cover rounded-lg"
                        />
                    ) : (
                        <div className="w-full h-[600px] rounded-lg overflow-hidden">
                            <PlaceholderImage />
                        </div>
                    )}
                </div>

                {/* Right: Details Section (50-60%) */}
                <div className="flex-1 flex flex-col">
                    {/* Item Name and Price */}
                    <div className="mb-4">
                        <h2 className="text-4xl font-bold text-gray-900 mb-3">{item.name}</h2>
                        <p className="text-2xl font-bold text-gray-900">${item.price.toFixed(2)}</p>
                    </div>
                    
                    {/* Description */}
                    {item.description && (
                        <p className="text-gray-700 mb-8 leading-relaxed">{item.description}</p>
                    )}
                    
                    {/* Quantity selector - Dropdown */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                        <div className="relative">
                            <select
                                value={quantity}
                                onChange={(e) => setQuantity(parseInt(e.target.value))}
                                className="w-full max-w-[120px] border border-gray-300 rounded-lg bg-white px-4 py-2.5 text-gray-900 font-medium appearance-none cursor-pointer hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#020403] focus:border-transparent"
                            >
                                {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                                    <option key={num} value={num}>
                                        {num}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Desktop: Options Section */}
                    {(showLunchOptions || isLunchCategory || showRiceOption) && (
                        <div className="mt-8 space-y-6">
                            {/* Meal Type Options */}
                            {(showLunchOptions || isLunchCategory) && (
                                <div>
                                    <div className="mb-3">
                                        <label className="block font-bold text-gray-900">Meal Type</label>
                                        <p className="text-sm text-gray-600">Select one</p>
                                    </div>
                                    <div className="space-y-2">
                                        {showLunchOptions && (
                                            <button
                                                onClick={() => setOptions({ ...options, mealType: 'lunch' })}
                                                className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                                    options.mealType === 'lunch'
                                                        ? 'bg-[#020403] text-white justify-between'
                                                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                                }`}
                                            >
                                                <span className="font-medium">Lunch</span>
                                                {options.mealType === 'lunch' && (
                                                    <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setOptions({ ...options, mealType: 'dinner' })}
                                            disabled={isLunchCategory && !isLunchTime && !showLunchOptions}
                                            className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                                options.mealType === 'dinner'
                                                    ? 'bg-[#020403] text-white justify-between'
                                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                            } ${isLunchCategory && !isLunchTime && !showLunchOptions ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        >
                                            <span className="font-medium">Dinner</span>
                                            {options.mealType === 'dinner' && (
                                                <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                    {isLunchCategory && !isLunchTime && !showLunchOptions && (
                                        <p className="text-sm text-gray-500 mt-2">Lunch is only available from 11 AM - 2 PM</p>
                                    )}
                                </div>
                            )}

                            {/* Rice Options */}
                            {showRiceOption && (
                                <div>
                                    <div className="mb-3">
                                        <label className="block font-bold text-gray-900">Rice</label>
                                        <p className="text-sm text-gray-600">Select one</p>
                                    </div>
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => setOptions({ ...options, rice: 'white' })}
                                            className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                                options.rice === 'white'
                                                    ? 'bg-[#020403] text-white justify-between'
                                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                            }`}
                                        >
                                            <span className="font-medium">White</span>
                                            {options.rice === 'white' && (
                                                <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setOptions({ ...options, rice: 'fried' })}
                                            className={`w-full rounded-lg px-4 py-3 flex items-center transition-all ${
                                                options.rice === 'fried'
                                                    ? 'bg-[#020403] text-white justify-between'
                                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                            }`}
                                        >
                                            <span className="font-medium">Fried</span>
                                            {options.rice === 'fried' && (
                                                <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Add to Order Button */}
                    <button 
                        onClick={handleAdd} 
                        className="w-full bg-[#020403] text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-gray-800 transition-colors mt-8 "
                    >
                        Add {quantity} to order • ${totalPrice.toFixed(2)}
                    </button>
                </div>
            </div>

            {/* Mobile/Tablet: Add to Order button at bottom */}
            {isMobileOrTablet && (
                <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none md:hidden">
                    <button 
                        onClick={handleAdd}
                        disabled={isAddedToCart}
                        className={`w-full py-4 px-6 shadow-xl rounded-full flex items-center justify-between transition-all duration-300 pointer-events-auto ${
                            isAddedToCart 
                                ? 'bg-[#59B512] text-white' 
                                : 'bg-[#020403] text-white hover:bg-[#dc2626] active:scale-95'
                        }`}
                    >
                        <span className="font-semibold text-lg flex items-center gap-2">
                            {isAddedToCart ? (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Added to cart
                                </>
                            ) : (
                                'Add to Order'
                            )}
                        </span>
                        {showPriceText && isAddedToCart ? (
                            <span className="font-bold text-xl">
                                +${totalPrice.toFixed(2)}
                            </span>
                        ) : !isAddedToCart ? (
                            <span className="font-bold text-xl">
                                ${totalPrice.toFixed(2)}
                            </span>
                        ) : null}
                    </button>
                </div>
            )}
        </div>
    );
}

export default ItemDetailsPage;


