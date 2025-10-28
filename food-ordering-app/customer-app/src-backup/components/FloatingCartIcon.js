import React, { useContext } from 'react';
import { CartContext } from '../App';

function FloatingCartIcon({ onClick }) {
  const { cartCount } = useContext(CartContext);

  return (
    <button 
      className="fixed bottom-4 right-4 bg-[#ef4444] text-white rounded-full p-4 shadow-lg cursor-pointer"
      onClick={onClick}
    >
      Cart {cartCount > 0 && <span className="bg-white text-[#ef4444] rounded-full px-2">{cartCount}</span>}
    </button>
  );
}

export default FloatingCartIcon;