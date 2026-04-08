import type { Metadata } from 'next';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlayStation Lounge — Station Display',
  description: 'Per-station customer session display',
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full overflow-hidden">
      {/*
        touch-action: none in globals.css handles pinch zoom.
        context-menu and pull-to-refresh handled via CSS overscroll-behavior.
      */}
      <body className="h-full w-full overflow-hidden bg-[#0F172A] text-white antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}

