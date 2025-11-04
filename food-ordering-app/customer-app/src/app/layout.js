import { Montserrat } from "next/font/google";
import "./globals.css";
import AppWrappers from "@/components/AppWrappers";
// import Header from '@/components/Header';
// import Footer from '@/components/Footer';

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata = {
  title: "SavorSphere",
  description: 'Order delicious food fast!',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={montserrat.className}>
        <AppWrappers>
          {children}
        </AppWrappers>
      </body>
    </html>
  );
}