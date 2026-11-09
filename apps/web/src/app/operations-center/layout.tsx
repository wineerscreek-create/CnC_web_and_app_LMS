import type { Metadata, Viewport } from 'next';
import * as React from 'react';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: {
    default: 'Operations Center — Platform Security & Infrastructure Command',
    template: '%s · Operations Center',
  },
  description: 'Isolated Security Operations & Infrastructure Command Dashboard for Winners Creek LMS.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020617',
};

export default function OperationsCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-rose-500 selection:text-white dark font-sans relative">
      {children}
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#0f172a',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            fontSize: '12px',
            fontFamily: 'ui-monospace, monospace',
          },
        }}
      />
    </div>
  );
}
