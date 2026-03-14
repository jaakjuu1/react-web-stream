import { useState, useEffect, useCallback, useRef } from 'react';
import { api, type Clip } from '../lib/api';

interface ClipListProps {
  roomId?: string;
  onPlayClip: (clip: Clip) => void;
}

export function ClipList({ roomId, onPlayClip }: ClipListProps) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'motion' | 'sound'>('all');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const fetchClips = useCallback(async (reset = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const params: { roomId?: string; type?: 'motion' | 'sound'; limit: number; offset: number } = {
        limit,
        offset: reset ? 0 : offsetRef.current,
      };
      if (roomId) params.roomId = roomId;
      if (filter !== 'all') params.type = filter;

      const result = await api.getClips(params);
      if (reset) {
        setClips(result.clips);
        setOffset(limit);
      } else {
        setClips((prev) => [...prev, ...result.clips]);
        setOffset((prev) => prev + limit);
      }
      setTotal(result.total);
    } catch (err) {
      console.error('[ClipList] Failed to fetch clips:', err);
      setError(err instanceof Error ? err.message : 'Failed to load clips');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, filter]);

  useEffect(() => {
    fetchClips(true);
  }, [roomId, filter]);

  const handleDelete = async (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this clip?')) return;

    try {
      await api.deleteClip(clipId);
      setClips((prev) => prev.filter((c) => c.id !== clipId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      console.error('[ClipList] Failed to delete clip:', err);
    }
  };

  const handleRefresh = () => {
    setOffset(0);
    fetchClips(true);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (error) {
    return (
      <div className="clip-list clip-list-error">
        <div className="clip-list-header">
          <span className="clip-list-title">Clips</span>
        </div>
        <div className="clip-list-error-message">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="clip-list">
      <div className="clip-list-header">
        <span className="clip-list-title">
          Clips
          {total > 0 && <span className="clip-count">{total}</span>}
        </span>
        <button className="clip-refresh-btn" onClick={handleRefresh} disabled={isLoading}>
          {isLoading ? '...' : '↻'}
        </button>
      </div>

      <div className="clip-filters">
        <button
          className={`clip-filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`clip-filter-btn ${filter === 'motion' ? 'active' : ''}`}
          onClick={() => setFilter('motion')}
        >
          Motion
        </button>
        <button
          className={`clip-filter-btn ${filter === 'sound' ? 'active' : ''}`}
          onClick={() => setFilter('sound')}
        >
          Sound
        </button>
      </div>

      {clips.length === 0 && !isLoading ? (
        <div className="clip-list-empty">
          <span className="clip-list-empty-icon">📹</span>
          <p>No clips yet</p>
          <span className="clip-list-empty-hint">
            Clips appear when motion or sound is detected
          </span>
        </div>
      ) : (
        <div className="clip-list-items">
          {clips.map((clip) => (
            <div
              key={clip.id}
              className={`clip-item ${clip.detectionType}`}
              onClick={() => onPlayClip(clip)}
            >
              <div className="clip-thumbnail">
                <span className="clip-type-icon">
                  {clip.detectionType === 'motion' ? '🏃' : '🔊'}
                </span>
              </div>
              <div className="clip-info">
                <div className="clip-title">
                  {clip.detectionType === 'motion' ? 'Motion' : 'Sound'} detected
                </div>
                <div className="clip-meta">
                  <span className="clip-time">{formatTime(clip.recordedAt)}</span>
                  <span className="clip-duration">{formatDuration(clip.duration)}</span>
                  <span className="clip-size">{formatSize(clip.fileSize)}</span>
                </div>
              </div>
              <div className="clip-confidence">
                <span className="confidence-value">
                  {Math.round(clip.confidence * 100)}%
                </span>
              </div>
              <button
                className="clip-delete-btn"
                onClick={(e) => handleDelete(clip.id, e)}
                title="Delete clip"
              >
                🗑️
              </button>
            </div>
          ))}

          {clips.length < total && (
            <button
              className="clip-load-more-btn"
              onClick={() => fetchClips(false)}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : `Load more (${total - clips.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
