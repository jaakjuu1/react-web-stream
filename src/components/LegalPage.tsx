import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/" className="legal-home-link">
          ← Pet Portal
        </Link>
      </header>
      <article className="legal-content">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {lastUpdated}</p>
        {children}
      </article>
      <footer className="legal-footer">
        <Link to="/privacy">Privacy Policy</Link>
        <span aria-hidden="true">·</span>
        <Link to="/terms">Terms of Service</Link>
      </footer>
    </div>
  );
}
