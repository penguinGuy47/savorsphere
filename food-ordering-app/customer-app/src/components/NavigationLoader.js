'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// TODO: Update component to use a more modern loading indicator like a spinner or other visual indicator

export default function NavigationLoader() {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Show loading indicator briefly on route change
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [pathname]);

  if (!isLoading) return null;

  return <div className="navigation-loading active" />;
}



