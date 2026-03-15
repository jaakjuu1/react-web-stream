import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  console.warn('VITE_CLERK_PUBLISHABLE_KEY not set - auth features disabled');
}

// In production, route Clerk requests through our own server to bypass
// CNAME/SSL issues with clerk.<subdomain> auto-detection
const proxyUrl = import.meta.env.PROD ? '/__clerk' : undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY || 'pk_placeholder'}
      proxyUrl={proxyUrl}
      afterSignOutUrl="/"
    >
      <App />
    </ClerkProvider>
  </StrictMode>
);
