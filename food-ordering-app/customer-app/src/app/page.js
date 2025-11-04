import MenuPageClient from '@/components/MenuPageClient';

export default async function MenuPage() {
  // Server Component now just renders the client component
  // Menu fetching happens client-side to use localStorage cache
  return (
    <div className="container mx-auto px-2">
      <MenuPageClient />
    </div>
  );
}