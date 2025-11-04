'use client';

import { CartProvider } from "@/context/CartContext";
import FloatingCartIcon from "@/components/FloatingCartIcon";

export default function AppWrappers({ children }) {
  return (
    <CartProvider>
      {children}
      <FloatingCartIcon />
    </CartProvider>
  );
}


