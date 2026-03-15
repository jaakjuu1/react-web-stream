import { SignIn, SignUp } from '@clerk/react';
import { useSearchParams, Link } from 'react-router-dom';

const clerkAppearance = {
  variables: {
    colorPrimary: '#00d4ff',
    colorBackground: '#12121a',
    colorInputBackground: '#1a1a24',
    colorInputText: '#f0f0f5',
    colorText: '#f0f0f5',
    colorTextSecondary: '#8888a0',
    colorTextOnPrimaryBackground: '#050508',
    colorDanger: '#ff5252',
    colorSuccess: '#00e676',
    colorNeutral: '#8888a0',
    borderRadius: '10px',
    fontFamily: "'DM Sans', 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '0.9375rem',
    spacingUnit: '1rem',
  },
  elements: {
    rootBox: 'ck-root',
    card: 'ck-card',
    cardBox: 'ck-card-box',
    header: 'ck-header',
    socialButtonsBlockButton: 'ck-social-btn',
    socialButtonsBlockButtonText: 'ck-social-btn-text',
    dividerLine: 'ck-divider-line',
    dividerText: 'ck-divider-text',
    formFieldLabel: 'ck-label',
    formFieldInput: 'ck-input',
    formButtonPrimary: 'ck-btn-primary',
    footerAction: 'ck-footer',
    footer: 'ck-footer',
    identityPreview: 'ck-identity-preview',
    identityPreviewText: 'ck-identity-text',
    identityPreviewEditButton: 'ck-identity-edit',
    formFieldAction: 'ck-field-action',
    alertText: 'ck-alert-text',
    formFieldInputShowPasswordButton: 'ck-password-toggle',
    otpCodeFieldInput: 'ck-otp-input',
    formResendCodeLink: 'ck-resend-link',
    backLink: 'ck-back-link',
  },
} as const;

export function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isSignUp = searchParams.get('mode') === 'sign-up';

  const switchMode = () => {
    if (isSignUp) {
      setSearchParams({});
    } else {
      setSearchParams({ mode: 'sign-up' });
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-bg-orb auth-bg-orb--1" />
        <div className="auth-bg-orb auth-bg-orb--2" />
      </div>

      <div className="auth-card">
        <Link to="/" className="auth-back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Home
        </Link>

        <div className="auth-header">
          <Link to="/" className="auth-logo-link">
            <svg className="auth-logo-icon" viewBox="0 0 24 24" fill="none" width="36" height="36">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.15"/>
              <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
              <path d="M12 16c-1.5 0-2.7-.8-3.2-2h6.4c-.5 1.2-1.7 2-3.2 2z" fill="currentColor"/>
            </svg>
            <span className="auth-logo-text">Pet Portal</span>
          </Link>

          <h1 className="auth-heading">
            {isSignUp ? 'Create your account' : 'Welcome to Pet Portal'}
          </h1>
          <p className="auth-subheading">
            {isSignUp
              ? 'Start monitoring your pets in minutes'
              : 'Sign in to check on your pets'}
          </p>
        </div>

        <div className="auth-form-area">
          {isSignUp ? (
            <SignUp
              routing="hash"
              signInUrl="/auth"
              fallbackRedirectUrl="/"
              appearance={clerkAppearance}
            />
          ) : (
            <SignIn
              routing="hash"
              signUpUrl="/auth?mode=sign-up"
              fallbackRedirectUrl="/"
              appearance={clerkAppearance}
            />
          )}
        </div>

        <div className="auth-mode-switch">
          <span className="auth-mode-text">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          </span>
          <button
            type="button"
            className="auth-mode-btn"
            onClick={switchMode}
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </div>
      </div>
    </div>
  );
}
