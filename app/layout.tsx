import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'GT Anywhere · 2e Pathway',
  description: 'Support-first documentation and routing for 2e concerns.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Literata:wght@400;600;700&family=Inter:wght@400;500;600;700&family=Inconsolata:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
