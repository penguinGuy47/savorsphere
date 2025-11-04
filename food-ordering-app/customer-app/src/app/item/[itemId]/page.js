'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMenu } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { mockMenu } from '@/lib/mocks';

function ItemDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const itemId = params.itemId;
    const [item, setItem] = useState(null);
    const [options, setOptions] = useState({ mealType: 'lunch', rice: 'white' });
    const [quantity, setQuantity] = useState(1);
    const { addToCart } = useCart();

    const handleBack = () => {
        router.push('/');
    };

    useEffect(() => {
        getMenu()
        .then((items) => setItem(items.find((i) => i.itemId === itemId)))
        .catch(() => setItem(mockMenu.find((i) => i.itemId === itemId)));
    }, [itemId]);

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
    };

    const handleIncreaseQuantity = () => {
        setQuantity(prev => prev + 1);
    };

    const handleDecreaseQuantity = () => {
        setQuantity(prev => Math.max(1, prev - 1));
    };

    if (!item) return <div>Loading...</div>;

    const isLunchCategory = item.category === 'Lunch';
    const showRiceOption = isLunchCategory && options.mealType === 'lunch';

    return (
        <div className="relative">
            <button
                onClick={handleBack}
                className="fixed top-4 left-4 z-50 bg-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors"
                aria-label="Go back to menu"
            >
                <span className="text-2xl font-semibold text-gray-800">&times;</span>
            </button>
            <div className="mt-18 card">
                <h2>{item.name}</h2>
                <p>{item.description}</p>
                <p>${item.price.toFixed(2)}</p>
                
                {/* Quantity selector */}
                <div className="mb-4">
                    <label className="block mb-2 font-semibold">Quantity:</label>
                    <div className="flex items-center gap-3">
                        {quantity > 1 && (
                            <button
                                onClick={handleDecreaseQuantity}
                                className="bg-gray-200 hover:bg-gray-300 rounded-full w-10 h-10 flex items-center justify-center transition-colors font-semibold text-lg"
                                aria-label="Decrease quantity"
                            >
                                −
                            </button>
                        )}
                        <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => {
                                const value = parseInt(e.target.value) || 1;
                                setQuantity(Math.max(1, value));
                            }}
                            className="w-20 border border-gray-300 rounded-lg p-2 text-center font-semibold text-lg"
                        />
                        <button
                            onClick={handleIncreaseQuantity}
                            className="bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors font-semibold text-lg"
                            aria-label="Increase quantity"
                        >
                            +
                        </button>
                    </div>
                </div>

                {isLunchCategory && (
                    <div className="mb-4">
                        <label className="block mb-2">Meal Type:</label>
                        <select 
                            value={options.mealType} 
                            onChange={(e) => setOptions({ ...options, mealType: e.target.value })} 
                            className="border p-2 w-full"
                        >
                            <option value="lunch">Lunch</option>
                            <option value="dinner">Dinner</option>
                        </select>
                    </div>
                )}
                {showRiceOption && (
                    <div className="mb-4">
                        <label className="block mb-2">Rice:</label>
                        <select 
                            value={options.rice} 
                            onChange={(e) => setOptions({ ...options, rice: e.target.value })} 
                            className="border p-2 w-full"
                        >
                            <option value="white">White</option>
                            <option value="fried">Fried</option>
                        </select>
                    </div>
                )}
                {/* Add more required fields */}
                <button onClick={handleAdd} className="button-primary">Add to Cart</button>
            </div>
        </div>
    );
}

export default ItemDetailsPage;


