import { useRef, useEffect, useState } from 'react';
import { api, type Clip } from '../lib/api';

interface ClipPlayerProps {
  clip: Clip;
  onClose: () => void;
}

export function ClipPlayer({ clip, onClose }: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch playback URL (presigned R2 URL or local streaming URL)
  useEffect(() => {
    let cancelled = false;
    setVideoUrl(null);
    setError(null);

    api.getClipPlaybackUrl(clip.id).then((url) => {
      if (!cancelled) setVideoUrl(url);
    }).catch((err) => {
      if (!cancelled) setError(err.message || 'Failed to load clip');
    });

    return () => { cancelled = true; };
  }, [clip.id]);

  // Auto-play when URL is ready
  useEffect(() => {
    if (videoUrl) {
      videoRef.current?.play().catch(() => {});
    }
  }, [videoUrl]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleDownload = async () => {
    const url = videoUrl || await api.getClipPlaybackUrl(clip.id);
    const link = document.createElement('a');
    link.href = url;
    link.download = clip.filename || `clip-${clip.id}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Unknown';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="clip-player-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="clip-player-modal">
        <div className="clip-player-header">
          <div className="clip-player-title">
            <span className="clip-player-icon">
              {clip.detectionType === 'motion' ? '🏃' : '🔊'}
            </span>
            <span>{clip.detectionType === 'motion' ? 'Motion' : 'Sound'} Detection</span>
          </div>
          <button className="clip-player-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="clip-player-video">
          {error ? (
            <div className="clip-player-error">{error}</div>
          ) : !videoUrl ? (
            <div className="clip-player-loading">Loading clip...</div>
          ) : (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              playsInline
            />
          )}
        </div>

        <div className="clip-player-info">
          <div className="clip-player-meta">
            <div className="clip-meta-item">
              <span className="meta-label">Recorded</span>
              <span className="meta-value">{formatTime(clip.recordedAt)}</span>
            </div>
            <div className="clip-meta-item">
              <span className="meta-label">Duration</span>
              <span className="meta-value">{formatDuration(clip.duration)}</span>
            </div>
            <div className="clip-meta-item">
              <span className="meta-label">Confidence</span>
              <span className="meta-value">{Math.round(clip.confidence * 100)}%</span>
            </div>
            <div className="clip-meta-item">
              <span className="meta-label">Camera</span>
              <span className="meta-value">{clip.deviceId}</span>
            </div>
          </div>
          <div className="clip-player-actions">
            <button className="clip-action-btn download" onClick={handleDownload}>
              <span>📥</span>
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
