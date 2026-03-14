import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { useHasActiveSubscription } from '../stores/authStore';
import { UserMenu } from './UserMenu';

export function HomePage() {
  const { isSignedIn } = useAuth();
  const hasSubscription = useHasActiveSubscription();

  return (
    <div className="home-page">
      <header className="home-header">
        {isSignedIn ? (
          <UserMenu />
        ) : (
          <Link to="/auth" className="auth-link">
            Sign In
          </Link>
        )}
      </header>

      <h1>
        <span className="highlight">Pet</span> Portal
      </h1>
      <p>Keep an eye on your pets from anywhere</p>

      <div className="home-links">
        <Link to="/camera" className="home-link camera-link">
          <span className="link-icon">📡</span>
          <span className="link-title">Go Live</span>
          <span className="link-desc">Start broadcasting</span>
          {!hasSubscription && <span className="pro-required">Pro</span>}
        </Link>

        <Link to="/viewer" className="home-link viewer-link">
          <span className="link-icon">🎬</span>
          <span className="link-title">Control Room</span>
          <span className="link-desc">Monitor all feeds</span>
          {!hasSubscription && <span className="pro-required">Pro</span>}
        </Link>
      </div>

      {!hasSubscription && (
        <div className="upgrade-cta">
          <p>Unlock all features with Pet Portal Pro</p>
          <Link to="/pricing" className="upgrade-btn">
            View Plans
          </Link>
        </div>
      )}
    </div>
  );
}
