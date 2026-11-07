'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log error to client console or monitoring service without leaking sensitive data
    console.error('Root Layout Global Error:', error.message);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Application Error · Winners Creek LMS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          backgroundColor: '#F8F9FA',
          color: '#111827',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div
          role="alert"
          aria-live="assertive"
          style={{
            maxWidth: '460px',
            width: '90%',
            padding: '32px',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            border: '1px solid #E5E7EB',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
            }}
          >
            <AlertTriangle size={24} aria-hidden="true" />
          </div>

          <h1
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 8px 0',
            }}
          >
            Application Error
          </h1>

          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.5,
              color: '#64748B',
              margin: '0 0 24px 0',
            }}
          >
            An unexpected error occurred while loading the application shell. You can attempt to reload the
            interface or return to the main portal.
          </p>

          {error.digest && (
            <p
              style={{
                fontSize: '11px',
                color: '#94A3B8',
                marginBottom: '20px',
                fontFamily: 'monospace',
              }}
            >
              Error ID: {error.digest}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#FFFFFF',
                backgroundColor: '#4F46E5',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Try again
            </button>

            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#374151',
                backgroundColor: '#F3F4F6',
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              <Home size={16} aria-hidden="true" />
              Go to Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
