import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useSubscription, useHasActiveSubscription } from '../stores/authStore';
import { api } from '../lib/api';

export function PricingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isSignedIn } = useAuth();
  const subscription = useSubscription();
  const isSubscribed = useHasActiveSubscription();

  const handleSubscribe = async () => {
    if (!isSignedIn) {
      window.location.href = '/auth';
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { url } = await api.createCheckoutSession();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { url } = await api.createPortalSession();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open portal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pricing-page">
      <div className="pricing-container">
        <Link to="/" className="pricing-logo">
          <h1>
            <span className="highlight">Pet</span> Portal
          </h1>
        </Link>

        <h2 className="pricing-title">Pro Plan</h2>
        <p className="pricing-subtitle">
          Monitor your pets from anywhere with unlimited camera streams
        </p>

        <div className="pricing-card">
          <div className="pricing-price">
            <span className="price-amount">$9.99</span>
            <span className="price-period">/month</span>
          </div>
          <p className="pricing-trial">7-day free trial</p>

          <ul className="pricing-features">
            <li>Up to 4 camera streams</li>
            <li>5 concurrent viewers</li>
            <li>Motion & sound detection</li>
            <li>Cloud clip storage</li>
            <li>Push notifications</li>
            <li>Priority support</li>
          </ul>

          {error && <div className="pricing-error">{error}</div>}

          {isSubscribed ? (
            <div className="subscription-active">
              <p className="subscription-status">
                Status: <strong>{subscription.status}</strong>
                {subscription.cancelAtPeriodEnd && ' (cancels at period end)'}
              </p>
              {subscription.currentPeriodEnd && (
                <p className="subscription-period">
                  Current period ends:{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              <button
                onClick={handleManageSubscription}
                disabled={isLoading}
                className="manage-btn"
              >
                {isLoading ? 'Loading...' : 'Manage Subscription'}
              </button>
              <Link to="/viewer" className="continue-link">
                Continue to Viewer
              </Link>
            </div>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="subscribe-btn"
            >
              {isLoading
                ? 'Loading...'
                : isSignedIn
                  ? 'Start Free Trial'
                  : 'Sign Up & Subscribe'}
            </button>
          )}
        </div>

        <Link to="/" className="back-link">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
