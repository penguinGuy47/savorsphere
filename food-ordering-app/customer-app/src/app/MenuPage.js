import React, { useState, useEffect } from 'react';
import CategoryTabs from '@/components/CategoryTabs';
import ItemCard from '@/components/ItemCard';
import { getMenu } from '@/services/api';
import { mockMenu } from '@/utils/mocks'; // Fallback to mocks

function MenuPage() {
    const [menuItems, setMenuItems] = useState([]);
    const [filteredItems, setFilteredItems] = useState([]);
    const [category, setCategory] = useState('All');

    useEffect(() => {
        console.log('🔄 Starting menu fetch...');
        
        getMenu()
            .then((data) => {
                console.log('✅ Raw API response:', data);
                console.log('Type of data:', typeof data);
                console.log('Is array:', Array.isArray(data));
                console.log('Data length:', data?.length);
                console.log('Data contents:', JSON.stringify(data, null, 2));
                
                const menuData = Array.isArray(data) ? data : [];
                console.log('Setting menuItems to:', menuData);
                setMenuItems(menuData);
            })
            .catch((error) => {
                console.error('❌ Error fetching menu:', error);
                console.error('Error details:', error.response?.data);
                console.log('Using mock data');
                setMenuItems(mockMenu);
            });
    }, []);

    useEffect(() => {
        if (Array.isArray(menuItems)) {
            if (category === 'All') {
                setFilteredItems(menuItems);
            } else if (category === 'Lunch') {
                setFilteredItems(menuItems.filter((item) => item.type === 'lunch'));
            } else {
                setFilteredItems(menuItems.filter((item) => item.category === category));
            }
        } else {
            setFilteredItems([]);
        }
    }, [category, menuItems]);

    console.log('menuItems:', menuItems, Array.isArray(menuItems));
    console.log('filteredItems:', filteredItems, Array.isArray(filteredItems));

    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Menu</h1>
            <CategoryTabs onCategoryChange={setCategory} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.isArray(filteredItems) ? (
                    filteredItems.map((item) => <ItemCard key={item.itemId} item={item} />)
                ) : (
                    <p>No items available or loading error.</p> // Fallback UI
                )}
            </div>
        </div>
    );
}

export default MenuPage;