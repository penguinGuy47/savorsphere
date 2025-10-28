import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { getMenu } from '../services/api';
import { CartContext } from '../App';
import { mockMenu } from '../utils/mocks';

function ItemDetailsPage() {
    const { itemId } = useParams();
    const [item, setItem] = useState(null);
    const [options, setOptions] = useState({ mealType: 'lunch' }); // e.g., lunch/dinner
    const { addToCart } = useContext(CartContext);

    useEffect(() => {
        getMenu()
        .then((items) => setItem(items.find((i) => i.itemId === itemId)))
        .catch(() => setItem(mockMenu.find((i) => i.itemId === itemId)));
    }, [itemId]);

    const handleAdd = () => {
        // Check time for lunch availability (placeholder)
        const now = new Date().getHours();
        if (options.mealType === 'lunch' && (now < 11 || now > 14)) {
        alert('Lunch not available');
        return;
        }
        addToCart({ ...item, options });
    };

    if (!item) return <div>Loading...</div>;

    return (
        <div className="card">
        <h2>{item.name}</h2>
        <p>{item.description}</p>
        <p>${item.price.toFixed(2)}</p>
        <select value={options.mealType} onChange={(e) => setOptions({ ...options, mealType: e.target.value })}>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
        </select>
        {/* Add more required fields */}
        <button onClick={handleAdd} className="button-primary">Add to Cart</button>
        </div>
    );
}

export default ItemDetailsPage;