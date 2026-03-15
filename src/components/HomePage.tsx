import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { useHasActiveSubscription } from '../stores/authStore';
import { UserMenu } from './UserMenu';

function LiveDot() {
  return <span className="hp-live-dot" aria-hidden="true" />;
}

export function HomePage() {
  const { isSignedIn, isLoaded } = useAuth();
  const hasSubscription = useHasActiveSubscription();

  return (
    <div className="hp">
      {/* Ambient background layers */}
      <div className="hp-bg" aria-hidden="true">
        <div className="hp-bg-orb hp-bg-orb--warm" />
        <div className="hp-bg-orb hp-bg-orb--cool" />
        <div className="hp-bg-noise" />
      </div>

      {/* Navigation */}
      <nav className="hp-nav">
        <div className="hp-nav-brand">
          <svg className="hp-logo" viewBox="0 0 24 24" fill="none" width="28" height="28">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.1"/>
            <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
            <path d="M12 16c-1.5 0-2.7-.8-3.2-2h6.4c-.5 1.2-1.7 2-3.2 2z" fill="currentColor"/>
          </svg>
          <span className="hp-nav-title">Pet Portal</span>
        </div>
        <div className="hp-nav-actions">
          {isLoaded && (
            isSignedIn ? (
              <UserMenu />
            ) : (
              <>
                <Link to="/auth" className="hp-btn hp-btn--ghost">Sign In</Link>
                <Link to="/auth?mode=sign-up" className="hp-btn hp-btn--primary">Get Started</Link>
              </>
            )
          )}
        </div>
      </nav>

      {/* Hero section */}
      <main className="hp-hero">
        <div className="hp-hero-badge">
          <LiveDot />
          <span>Live pet monitoring</span>
        </div>

        <h1 className="hp-title">
          Watch over your pets,<br />
          <span className="hp-title-accent">from anywhere.</span>
        </h1>

        <p className="hp-subtitle">
          Stream live video from up to 4 cameras. Get instant alerts when
          motion or sound is detected. All clips saved securely in the cloud.
        </p>

        <div className="hp-cta-group">
          <Link to={isSignedIn ? '/camera' : '/auth'} className="hp-btn hp-btn--large hp-btn--primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            Start Monitoring
          </Link>
          <Link to={isSignedIn ? '/viewer' : '/auth'} className="hp-btn hp-btn--large hp-btn--secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            View Cameras
          </Link>
        </div>
      </main>

      {/* Features grid */}
      <section className="hp-features">
        <div className="hp-feature">
          <div className="hp-feature-icon hp-feature-icon--amber">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </div>
          <h3>Multi-Camera Streaming</h3>
          <p>Connect up to 4 phones as cameras. View all feeds in a live grid on any device.</p>
        </div>

        <div className="hp-feature">
          <div className="hp-feature-icon hp-feature-icon--cyan">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <h3>Smart Detection</h3>
          <p>Motion and sound detection with instant push notifications. Never miss a moment.</p>
        </div>

        <div className="hp-feature">
          <div className="hp-feature-icon hp-feature-icon--green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3>Cloud Clips</h3>
          <p>Detection clips auto-upload to secure cloud storage. Watch, download, or share anytime.</p>
        </div>
      </section>

      {/* Upgrade banner for non-subscribers */}
      {isLoaded && !hasSubscription && (
        <section className="hp-upgrade">
          <div className="hp-upgrade-content">
            <span className="hp-upgrade-label">Pet Portal Pro</span>
            <h2>Unlock the full experience</h2>
            <p>Multi-camera streaming, smart detection alerts, and unlimited cloud clip storage.</p>
            <Link to="/pricing" className="hp-btn hp-btn--accent">
              View Plans
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="hp-footer">
        <span>Pet Portal</span>
        <span className="hp-footer-sep" aria-hidden="true" />
        <span>Secure pet monitoring</span>
      </footer>
    </div>
  );
}
