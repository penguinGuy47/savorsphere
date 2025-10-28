import React from 'react';
import { Link } from "react-router-dom";

function ItemCard( {item} ) {
    return (
        <div classname="card flex flex-col items-center">
            {item.image && <img src={item.image} alt={item.name} classname="w-full h-32 object-cover rounded-t-xl" />}
            <h3 className="font-semibold">{item.name}</h3>
            <p className="text-gray text-sm">{item.description}</p>
            <p className="font-bold">${item.price.toFixed(2)}</p>
            <Link to={`/item/${item.itemId}`} className="button-primary mt-2">
                View Options
            </Link>
        </div>
    )
}

export default ItemCard;