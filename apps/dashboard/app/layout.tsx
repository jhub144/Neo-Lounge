import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Neo Lounge — Owner Dashboard',
  description: 'Remote owner dashboard for Neo Lounge gaming centre',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full bg-[#0F172A] text-white antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
