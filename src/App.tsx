import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './components/HomePage';
import { AuthPage } from './components/AuthPage';
import { PricingPage } from './components/PricingPage';
import { CameraPage } from './components/CameraPage';
import { ViewerPage } from './components/ViewerPage';
import { setTokenGetter } from './lib/api';
import '@livekit/components-styles';
import './index.css';

function AppContent() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  // Set token getter for API client
  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);

  // Clear subscription when user signs out
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Import dynamically to avoid circular dependency
      import('./stores/authStore').then(({ useSubscriptionStore }) => {
        useSubscriptionStore.getState().clearSubscription();
      });
    }
  }, [isLoaded, isSignedIn]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/pricing" element={<PricingPage />} />

      {/* Protected routes - require auth + subscription */}
      <Route
        path="/camera"
        element={
          <ProtectedRoute requireSubscription>
            <CameraPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/viewer"
        element={
          <ProtectedRoute requireSubscription>
            <ViewerPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
