'use client';

import { useEffect } from 'react';
import { errorReference } from '@/shared/utils/error-reference';

/**
 * The last line of defence: shown when the page frame itself (the root layout) fails. It replaces
 * the whole document, so it brings its own <html>, and cannot use the site's styles or language
 * files. Plain English and inline styles keep it dependable even when everything else is broken.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const reference = errorReference(error);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0c0a09',
          color: '#f5f5f4',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <main role="alert" style={{ maxWidth: 480, padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>Something went wrong</h1>
          <p style={{ color: '#a8a29e', margin: '0 0 16px' }}>
            The site hit a problem and could not show this page. Your orders are safe. Please try
            again in a moment.
          </p>
          {reference ? (
            <p style={{ color: '#78716c', fontSize: 14, margin: '0 0 16px' }}>
              Reference: {reference}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              retry();
            }}
            style={{
              minHeight: 44,
              padding: '0 20px',
              border: 0,
              borderRadius: 8,
              background: '#f97316',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
