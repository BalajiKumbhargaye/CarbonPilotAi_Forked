import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CarbonPilot - Supplier Sustainability Intelligence & Evidence Verification',
  description:
    'B2B platform for automating Scope 3 data collection, PCF claim verification, and cross-document evidence consistency.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
