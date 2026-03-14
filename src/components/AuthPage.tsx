import { SignIn, SignUp } from '@clerk/clerk-react';
import { useSearchParams, Link } from 'react-router-dom';

export function AuthPage() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');

  return (
    <div className="auth-page">
      <div className="auth-container">
        <Link to="/" className="auth-logo">
          <h1>
            <span className="highlight">Pet</span> Portal
          </h1>
        </Link>

        <div className="clerk-auth-wrapper">
          {mode === 'sign-up' ? (
            <SignUp
              routing="hash"
              signInUrl="/auth"
              afterSignUpUrl="/"
              appearance={{
                elements: {
                  rootBox: 'clerk-root',
                  card: 'clerk-card',
                },
              }}
            />
          ) : (
            <SignIn
              routing="hash"
              signUpUrl="/auth?mode=sign-up"
              afterSignInUrl="/"
              appearance={{
                elements: {
                  rootBox: 'clerk-root',
                  card: 'clerk-card',
                },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
