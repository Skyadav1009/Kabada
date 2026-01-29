import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// Basic global handlers to ensure errors are visible in console
window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('Window error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled rejection:', e.reason);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// In dev, unregister any previously-registered service workers and clear caches
// This ensures stale cached index.html (LegacyLink) doesn't persist.
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => {
        r.unregister().then(() => console.log('Service worker unregistered (dev)'));
      });
    }).catch(() => {});
  }
  if (window.caches) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => console.log('Caches cleared (dev)')).catch(() => {});
  }
}

// Diagnostic log so you can confirm the app boot is attempted
// eslint-disable-next-line no-console
console.log('Mounting React app...');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// eslint-disable-next-line no-console
console.log('Render call completed.');