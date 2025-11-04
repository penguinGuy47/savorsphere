'use client'; // This directive is required for client-side hooks

import React, { useState, useEffect } from 'react';
import CategoryTabs from './CategoryTabs'; // Assuming CategoryTabs is in the same folder or adjusted path
import ItemCard from './ItemCard';

export default function MenuClientLayout({ initialItems }) {
    const [menuItems] = useState(initialItems); // Initial data from server
    const [filteredItems, setFilteredItems] = useState(initialItems);
    const [category, setCategory] = useState('All');

    // This useEffect handles the filtering, just like your original code
    useEffect(() => {
        if (category === 'All') {
            setFilteredItems(menuItems);
        } else if (category === 'Lunch') {
            setFilteredItems(menuItems.filter((item) => item.type === 'lunch'));
        } else {
            setFilteredItems(menuItems.filter((item) => item.category === category));
        }
    }, [category, menuItems]);

    return (
        <>
            <CategoryTabs onCategoryChange={setCategory} />
            <div className="grid grid-cols-1 md:grid-cols-1">
                {Array.isArray(filteredItems) ? (
                    filteredItems.map((item) => <ItemCard key={item.itemId} item={item} />)
                ) : (
                    <p>No items available or loading error.</p> 
                )}
            </div>
        </>
    );
}