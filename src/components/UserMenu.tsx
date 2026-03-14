import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserButton, useUser, useAuth } from '@clerk/react';
import { useSubscription, useHasActiveSubscription } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || '';

export function UserMenu() {
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const { user } = useUser();
  const { getToken } = useAuth();
  const subscription = useSubscription();
  const isSubscribed = useHasActiveSubscription();

  const handleManageBilling = async () => {
    setIsLoadingPortal(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/stripe/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to create portal session');

      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Failed to open billing portal:', err);
    } finally {
      setIsLoadingPortal(false);
    }
  };

  if (!user) return null;

  return (
    <div className="user-menu">
      <div className="user-menu-content">
        {isSubscribed && <span className="pro-badge">PRO</span>}

        <div className="user-menu-actions">
          {isSubscribed ? (
            <button
              className="btn-secondary btn-small"
              onClick={handleManageBilling}
              disabled={isLoadingPortal}
            >
              {isLoadingPortal ? 'Loading...' : 'Billing'}
            </button>
          ) : (
            <Link to="/pricing" className="btn-primary btn-small">
              Upgrade
            </Link>
          )}
        </div>

        <UserButton />
      </div>

      {subscription.status !== 'none' && subscription.status !== 'active' && subscription.status !== 'trialing' && (
        <div className="subscription-warning">
          Subscription: {subscription.status}
        </div>
      )}
    </div>
  );
}
