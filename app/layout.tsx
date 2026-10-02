import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Market Charts — Upstox Multi-Chart Dashboard',
  description:
    'Professional TradingView-style Indian market multi-chart dashboard powered by Upstox V3 Market Data API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full bg-[#070a12]">
      <body className="h-full w-full bg-[#070a12] text-slate-200 antialiased overflow-hidden font-sans">
        {children}
      </body>
    </html>
  );
}
