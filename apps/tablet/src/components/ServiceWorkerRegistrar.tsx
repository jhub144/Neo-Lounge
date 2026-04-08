'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[sw] Registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('[sw] Registration failed:', err);
        });
    }
  }, []);

  return null;
}
