import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import {
  useHasActiveSubscription,
  useSubscriptionInitialized,
  useSubscriptionStore,
} from '../stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSubscription?: boolean;
}

export function ProtectedRoute({
  children,
  requireSubscription = false,
}: ProtectedRouteProps) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const hasActiveSubscription = useHasActiveSubscription();
  const subscriptionInitialized = useSubscriptionInitialized();
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  const location = useLocation();

  // Fetch subscription when user is signed in
  useEffect(() => {
    if (isLoaded && isSignedIn && !subscriptionInitialized) {
      fetchSubscription(getToken);
    }
  }, [isLoaded, isSignedIn, subscriptionInitialized, fetchSubscription, getToken]);

  // Show loading while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  // Redirect to login if not signed in
  if (!isSignedIn) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  // Show loading while fetching subscription (if required)
  if (requireSubscription && !subscriptionInitialized) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner" />
        <p>Checking subscription...</p>
      </div>
    );
  }

  // Redirect to pricing if subscription required but not active
  if (requireSubscription && !hasActiveSubscription) {
    return (
      <Navigate to="/pricing" state={{ from: location.pathname }} replace />
    );
  }

  return <>{children}</>;
}
