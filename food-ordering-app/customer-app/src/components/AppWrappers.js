'use client';

import { CartProvider } from "@/context/CartContext";
import FloatingCartIcon from "@/components/FloatingCartIcon";
import CartPreviewDrawer from "@/components/CartPreviewDrawer";
import NavigationLoader from "@/components/NavigationLoader";
import Navbar from "@/components/Navbar";

export default function AppWrappers({ children }) {
  return (
    <CartProvider>
      <NavigationLoader />
      <Navbar />
      {children}
      <FloatingCartIcon />
      <CartPreviewDrawer />
    </CartProvider>
  );
}


