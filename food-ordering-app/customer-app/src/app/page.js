import MenuPageClient from '@/components/MenuPageClient';

export default async function MenuPage() {
  // Server Component now just renders the client component
  // Menu fetching happens client-side to use localStorage cache
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 xl:px-16 page-transition">
      <MenuPageClient />
    </div>
  );
}