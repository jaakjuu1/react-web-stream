import { useEffect, useRef, useState, useCallback } from 'react';
import {
  VideoTrack,
  AudioTrack,
  isTrackReference,
} from '@livekit/components-react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { ConnectionQuality, type Participant } from 'livekit-client';

interface VideoTileProps {
  participant: Participant;
  videoTrack: TrackReferenceOrPlaceholder | undefined;
  audioTrack: TrackReferenceOrPlaceholder | undefined;
  isPinned: boolean;
  isMuted: boolean;
  onPin: () => void;
  onToggleMute: () => void;
  portraitMode?: boolean;
}

type RotationDegree = 0 | 90 | 180 | 270;

export function VideoTile({
  participant,
  videoTrack,
  audioTrack,
  isPinned,
  isMuted,
  onPin,
  onToggleMute,
  portraitMode = false,
}: VideoTileProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Rotation state (additional to portrait mode)
  const [rotation, setRotation] = useState<RotationDegree>(0);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);

  // Screenshot flash effect
  const [showFlash, setShowFlash] = useState(false);

  // Controls expanded state
  const [showControls, setShowControls] = useState(false);

  // Get connection quality indicator
  const qualityLevel = participant.connectionQuality;
  const qualityLabel =
    qualityLevel === ConnectionQuality.Excellent
      ? 'Excellent'
      : qualityLevel === ConnectionQuality.Good
        ? 'Good'
        : qualityLevel === ConnectionQuality.Poor
          ? 'Poor'
          : 'Unknown';

  // Check if participant is publishing video
  const isVideoEnabled = videoTrack?.publication?.isSubscribed;

  useEffect(() => {
    if (isPinned && tileRef.current) {
      tileRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isPinned]);

  // Check if tracks are valid TrackReferences (not placeholders)
  const hasValidVideoTrack =
    videoTrack !== undefined && isTrackReference(videoTrack);
  const hasValidAudioTrack =
    audioTrack !== undefined && isTrackReference(audioTrack);

  // Display rotation shows manual rotation (portrait handled by CSS)

  // Rotate handler
  const handleRotate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => ((prev + 90) % 360) as RotationDegree);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) {
        setPan({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleResetZoom = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Store refs for pan state to avoid stale closures in document listeners
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    panStartX: 0,
    panStartY: 0
  });

  // Pan handlers - use document-level listeners for reliable tracking
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      e.preventDefault();
      e.stopPropagation();

      dragStateRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        panStartX: pan.x,
        panStartY: pan.y
      };
      setIsDragging(true);
      setHasDragged(false);
    }
  }, [zoom, pan]);

  // Document-level mouse move and up handlers
  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state.isDragging || zoom <= 1) return;

      const deltaX = e.clientX - state.startX;
      const deltaY = e.clientY - state.startY;

      // Mark as dragged if moved more than 5px
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        setHasDragged(true);
      }

      const maxPan = (zoom - 1) * 150;
      const newX = Math.max(-maxPan, Math.min(maxPan, state.panStartX - deltaX));
      const newY = Math.max(-maxPan, Math.min(maxPan, state.panStartY - deltaY));
      setPan({ x: newX, y: newY });
    };

    const handleDocumentMouseUp = () => {
      if (dragStateRef.current.isDragging) {
        dragStateRef.current.isDragging = false;
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleDocumentMouseMove);
      document.addEventListener('mouseup', handleDocumentMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [isDragging, zoom]);

  // Touch handlers for mobile pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (zoom > 1 && e.touches.length === 1) {
      dragStateRef.current = {
        isDragging: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        panStartX: pan.x,
        panStartY: pan.y
      };
      setIsDragging(true);
      setHasDragged(false);
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const state = dragStateRef.current;
    if (!state.isDragging || zoom <= 1 || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - state.startX;
    const deltaY = e.touches[0].clientY - state.startY;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      setHasDragged(true);
      e.preventDefault();
    }

    const maxPan = (zoom - 1) * 150;
    const newX = Math.max(-maxPan, Math.min(maxPan, state.panStartX - deltaX));
    const newY = Math.max(-maxPan, Math.min(maxPan, state.panStartY - deltaY));
    setPan({ x: newX, y: newY });
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
  }, []);

  // Handle tile click - only pin if not dragging
  const handleTileClick = useCallback(() => {
    if (!hasDragged && zoom === 1) {
      onPin();
    }
    setHasDragged(false);
  }, [hasDragged, zoom, onPin]);

  // Screenshot handler - captures video with current rotation and portrait mode
  const handleScreenshot = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    const videoElement = videoContainerRef.current?.querySelector('video');
    if (!videoElement) return;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate total rotation for screenshot (manual + portrait mode if active)
      const screenshotRotation = (rotation + (portraitMode ? 90 : 0)) % 360;
      const isRotated = screenshotRotation === 90 || screenshotRotation === 270;

      canvas.width = isRotated ? videoElement.videoHeight : videoElement.videoWidth;
      canvas.height = isRotated ? videoElement.videoWidth : videoElement.videoHeight;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((screenshotRotation * Math.PI) / 180);

      if (isRotated) {
        ctx.drawImage(videoElement, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
      } else {
        ctx.drawImage(videoElement, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
      }

      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 200);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `camera-${participant.identity}-${timestamp}.png`;

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
    }
  }, [rotation, portraitMode, participant.identity]);

  // Toggle controls visibility
  const handleToggleControls = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowControls((prev) => !prev);
  }, []);

  // Video transform style - rotation, zoom, and pan for the video content
  const videoTransform = `rotate(${rotation}deg) scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`;

  return (
    <div
      ref={tileRef}
      className={`video-tile ${isPinned ? 'pinned' : ''} ${showControls ? 'controls-visible' : ''} ${zoom > 1 ? 'zoomed' : ''} ${portraitMode ? 'portrait' : ''}`}
      onClick={handleTileClick}
    >
      <div
        ref={videoContainerRef}
        className={`video-container ${isDragging ? 'dragging' : ''}`}
      >
        <div
          className="video-transform-wrapper"
          style={{ transform: videoTransform }}
        >
          {hasValidVideoTrack ? (
            <VideoTrack trackRef={videoTrack} />
          ) : (
            <div className="no-video">
              <span>No Video</span>
            </div>
          )}
        </div>

        {/* Pan interaction overlay - only active when zoomed */}
        {zoom > 1 && (
          <div
            className="pan-overlay"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        )}

        {showFlash && <div className="screenshot-flash" />}

        {hasValidAudioTrack && !isMuted && <AudioTrack trackRef={audioTrack} />}
      </div>

      <div className="tile-overlay">
        <div className="tile-header">
          <span className="participant-name">
            {participant.identity.replace('cam_', 'Camera ')}
          </span>
          <div className="tile-header-right">
            {zoom > 1 && (
              <span className="zoom-indicator">{zoom.toFixed(1)}x</span>
            )}
            {rotation !== 0 && (
              <span className="rotation-indicator">{rotation}°</span>
            )}
            <span className={`quality-indicator quality-${qualityLevel}`}>
              {qualityLabel}
            </span>
          </div>
        </div>

        <div className="tile-controls">
          <button
            className={`tile-btn ${isMuted ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          <button
            className="tile-btn screenshot-btn"
            onClick={handleScreenshot}
            title="Take screenshot"
          >
            📸
          </button>

          <button
            className={`tile-btn ${isPinned ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            📌
          </button>

          <button
            className={`tile-btn tile-btn-expand ${showControls ? 'active' : ''}`}
            onClick={handleToggleControls}
            title="More controls"
          >
            ⚙️
          </button>
        </div>

        <div className={`advanced-controls ${showControls ? 'visible' : ''}`}>
          <div className="control-group">
            <span className="control-label">Rotate</span>
            <button
              className="tile-btn"
              onClick={handleRotate}
              title="Rotate 90°"
            >
              ↻
            </button>
          </div>

          <div className="control-group">
            <span className="control-label">Zoom</span>
            <div className="zoom-controls">
              <button
                className="tile-btn tile-btn-sm"
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                title="Zoom out"
              >
                −
              </button>
              <button
                className="tile-btn tile-btn-sm"
                onClick={handleResetZoom}
                disabled={zoom === 1}
                title="Reset zoom"
              >
                ⟲
              </button>
              <button
                className="tile-btn tile-btn-sm"
                onClick={handleZoomIn}
                disabled={zoom >= 4}
                title="Zoom in"
              >
                +
              </button>
            </div>
          </div>

          {zoom > 1 && (
            <div className="pan-hint">
              Drag to pan around
            </div>
          )}
        </div>

        {!isVideoEnabled && (
          <div className="video-status">
            <span>Video Paused</span>
          </div>
        )}
      </div>
    </div>
  );
}
