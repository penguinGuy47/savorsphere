'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Logo() {
  return (
    <Link href="/" className="flex items-center group">
      <div className="relative w-10 h-10 flex items-center justify-center cursor-pointer">
        {/* Globe circumference (always visible) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-900 transition-colors duration-300 group-hover:text-[#677D6A]"
          />
        </svg>

        {/* Globe sphere details (visible by default, fade out on hover) */}
        <svg
          className="absolute inset-0 w-full h-full transition-opacity duration-300 ease-in-out group-hover:opacity-0"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Globe grid lines - vertical meridians */}
          <path
            d="M12 2C12 2 8 6 8 12C8 18 12 22 12 22"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-gray-600"
          />
          <path
            d="M12 2C12 2 16 6 16 12C16 18 12 22 12 22"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-gray-600"
          />
          {/* Horizontal latitude lines */}
          <ellipse
            cx="12"
            cy="7"
            rx="8"
            ry="2"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-gray-600"
          />
          <ellipse
            cx="12"
            cy="12"
            rx="10"
            ry="3"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-gray-600"
          />
          <ellipse
            cx="12"
            cy="17"
            rx="8"
            ry="2"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-gray-600"
          />
        </svg>

        {/* Letter S (hidden by default, fade in on hover) */}
        <span
          className="absolute inset-0 flex items-center justify-center text-2xl font-bold transition-all duration-300 ease-in-out opacity-0 group-hover:opacity-100 text-[#677D6A] transform scale-95 group-hover:scale-100"
          style={{ fontFamily: 'inherit', lineHeight: '1' }}
        >
          S
        </span>
      </div>
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  // Hide navbar on certain pages if needed
  if (pathname === '/checkout' || pathname?.startsWith('/confirmation/')) {
    return null;
  }

  return (
    <nav className="sticky top-0 z-40 bg-white md:border-b md:border-gray-200 md:shadow-sm">
      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 xl:px-16">
        <div className="flex items-center justify-center md:justify-between h-16 relative">
          <Logo />
          
          {/* Right side - can add navigation items here later */}
          <div className="hidden md:flex items-center gap-4">
            {/* Placeholder for future nav items */}
          </div>
        </div>
      </div>
    </nav>
  );
}

