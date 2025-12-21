import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="home-page">
      <h1>
        <span className="highlight">Broadcast</span> Control
      </h1>
      <p>Multi-camera streaming powered by WebRTC</p>

      <div className="home-links">
        <Link to="/camera" className="home-link camera-link">
          <span className="link-icon">📡</span>
          <span className="link-title">Go Live</span>
          <span className="link-desc">Start broadcasting</span>
        </Link>

        <Link to="/viewer" className="home-link viewer-link">
          <span className="link-icon">🎬</span>
          <span className="link-title">Control Room</span>
          <span className="link-desc">Monitor all feeds</span>
        </Link>
      </div>
    </div>
  );
}
