import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  VideoTrack,
  AudioTrack,
  useRoomContext,
} from '@livekit/components-react';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
import { api } from '../lib/api';
import { cameraRoomOptions } from '../lib/livekit';

// Type for Wake Lock API (using built-in types if available)
type WakeLockSentinelType = WakeLockSentinel;

export function CameraPage() {
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Use demo endpoint for now (no auth required)
    api.getDemoCameraToken()
      .then((response) => {
        setToken(response.token);
        setLivekitUrl(response.livekitUrl);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="camera-page">
        <div className="error-container">
          <h2>Connection Error</h2>
          <p>{error}</p>
          <p className="hint">
            Make sure the backend server is running on port 3001.
          </p>
        </div>
      </div>
    );
  }

  if (!token || !livekitUrl) {
    return (
      <div className="camera-page">
        <div className="loading">Connecting...</div>
      </div>
    );
  }

  return (
    <div className="camera-page">
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect={true}
        video={true}
        audio={true}
        options={cameraRoomOptions}
      >
        <CameraInterface />
      </LiveKitRoom>
    </div>
  );
}

function CameraInterface() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Connecting
  );
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    'environment'
  );
  const [isSwitching, setIsSwitching] = useState(false);

  // Sleep mode state
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepHintVisible, setSleepHintVisible] = useState(true);
  const wakeLockRef = useRef<WakeLockSentinelType | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  // Local camera track for preview
  const videoTracks = useTracks([Track.Source.Camera], {
    onlySubscribed: false,
  });

  // Subscribe to viewer audio tracks (for two-way communication)
  const audioTracks = useTracks([Track.Source.Microphone], {
    onlySubscribed: true,
  });

  const localVideoTrack = videoTracks.find(
    (t) =>
      t.participant.identity === localParticipant?.identity &&
      t.source === Track.Source.Camera
  );

  // Get audio tracks from viewers (participants starting with "viewer_")
  const viewerAudioTracks = audioTracks.filter(
    (t) =>
      t.participant.identity.startsWith('viewer_') &&
      t.source === Track.Source.Microphone
  );

  // Check if any viewer is currently speaking
  const viewerIsSpeaking = viewerAudioTracks.length > 0;

  useEffect(() => {
    const handleConnectionChange = (state: ConnectionState) => {
      setConnectionState(state);
    };

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionChange);
    setConnectionState(room.state);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionChange);
    };
  }, [room]);

  // Track state logging for debugging screen-off behavior
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      console.log(`[TrackState] Visibility changed: ${document.visibilityState}`);

      if (localParticipant) {
        const videoTrack = localParticipant.getTrackPublication(Track.Source.Camera);
        const audioTrack = localParticipant.getTrackPublication(Track.Source.Microphone);

        console.log('[TrackState] Video track:', {
          exists: !!videoTrack,
          muted: videoTrack?.isMuted,
          subscribed: videoTrack?.isSubscribed,
          mediaStreamTrack: videoTrack?.track?.mediaStreamTrack?.readyState,
        });

        console.log('[TrackState] Audio track:', {
          exists: !!audioTrack,
          muted: audioTrack?.isMuted,
          subscribed: audioTrack?.isSubscribed,
          mediaStreamTrack: audioTrack?.track?.mediaStreamTrack?.readyState,
        });
      }

      console.log('[TrackState] Connection state:', room.state);

      // Re-acquire wake lock when becoming visible (it gets released when hidden)
      if (isVisible && isSleeping && wakeLockRef.current?.released) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [localParticipant, room, isSleeping]);

  // Request Wake Lock
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      console.log('[WakeLock] API not supported');
      return;
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Acquired');

      wakeLockRef.current.addEventListener('release', () => {
        console.log('[WakeLock] Released');
      });
    } catch (err) {
      console.error('[WakeLock] Failed to acquire:', err);
    }
  }, []);

  // Release Wake Lock
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('[WakeLock] Manually released');
    }
  }, []);

  // Enter sleep mode
  const enterSleepMode = useCallback(async () => {
    setIsSleeping(true);
    setSleepHintVisible(true);
    await requestWakeLock();

    // Hide hint after 3 seconds
    setTimeout(() => {
      setSleepHintVisible(false);
    }, 3000);
  }, [requestWakeLock]);

  // Exit sleep mode
  const exitSleepMode = useCallback(async () => {
    setIsSleeping(false);
    setSleepHintVisible(true);
    await releaseWakeLock();
  }, [releaseWakeLock]);

  // Triple-tap detection
  const handleSleepOverlayClick = useCallback(() => {
    const now = Date.now();
    const recentTaps = tapTimesRef.current.filter(t => now - t < 500);
    recentTaps.push(now);
    tapTimesRef.current = recentTaps;

    if (recentTaps.length >= 3) {
      tapTimesRef.current = [];
      exitSleepMode();
    }

    // Show hint briefly on any tap
    setSleepHintVisible(true);
    setTimeout(() => {
      if (isSleeping) {
        setSleepHintVisible(false);
      }
    }, 2000);
  }, [exitSleepMode, isSleeping]);

  // Cleanup wake lock on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  const toggleCamera = useCallback(async () => {
    if (isSwitching) return;

    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setIsSwitching(true);

    try {
      if (localParticipant) {
        await localParticipant.setCameraEnabled(false);
        await localParticipant.setCameraEnabled(true, {
          facingMode: newFacing,
        });
        setFacingMode(newFacing);
      }
    } catch (err) {
      console.error('Failed to switch camera:', err);
    } finally {
      setIsSwitching(false);
    }
  }, [localParticipant, facingMode, isSwitching]);

  const toggleMute = useCallback(async () => {
    if (localParticipant) {
      const enabled = localParticipant.isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(!enabled);
    }
  }, [localParticipant]);

  const isMuted = !localParticipant?.isMicrophoneEnabled;
  const isConnected = connectionState === ConnectionState.Connected;

  return (
    <div className="camera-interface">
      <div className={`camera-preview ${isSwitching ? 'switching' : ''}`}>
        {localVideoTrack ? (
          <VideoTrack trackRef={localVideoTrack} />
        ) : (
          <div className="no-video">No camera available</div>
        )}

        {/* Camera switching overlay */}
        {isSwitching && (
          <div className="switch-overlay">
            <div className="switch-spinner" />
            <span>Switching camera...</span>
          </div>
        )}
      </div>

      {/* Camera mode indicator */}
      <div className="camera-mode-indicator">
        <span className={`mode-icon ${facingMode === 'user' ? 'active' : ''}`}>
          👤
        </span>
        <div className="mode-track">
          <div className={`mode-thumb ${facingMode === 'environment' ? 'right' : ''}`} />
        </div>
        <span className={`mode-icon ${facingMode === 'environment' ? 'active' : ''}`}>
          🌍
        </span>
      </div>

      <div className="camera-controls">
        <button
          className={`control-btn ${isMuted ? 'muted' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        <button
          className={`control-btn control-btn-primary ${isSwitching ? 'spinning' : ''}`}
          onClick={toggleCamera}
          disabled={isSwitching}
          title="Switch Camera"
        >
          <span className="switch-icon">🔄</span>
        </button>

        <button
          className="control-btn sleep-btn"
          onClick={enterSleepMode}
          title="Sleep mode (triple-tap to wake)"
        >
          🌙
        </button>
      </div>

      <div className={`connection-status ${connectionState.toLowerCase()}`}>
        <span className="status-dot" />
        <span className="status-text">
          {isConnected ? 'Live' : connectionState}
        </span>
      </div>

      <div className="camera-info">
        <span>{localParticipant?.identity}</span>
        <span className="camera-type">
          {facingMode === 'user' ? 'Front' : 'Back'}
        </span>
      </div>

      {/* Viewer speaking indicator */}
      {viewerIsSpeaking && (
        <div className="viewer-speaking-indicator">
          <span className="speaking-icon">🔊</span>
          <span>Viewer speaking...</span>
        </div>
      )}

      {/* Render audio tracks from viewers (hidden, just for playback) */}
      {viewerAudioTracks.map((track) => (
        <AudioTrack key={track.participant.identity} trackRef={track} />
      ))}

      {/* Sleep mode overlay */}
      {isSleeping && (
        <div
          className="sleep-overlay"
          onClick={handleSleepOverlayClick}
          onTouchStart={(e) => {
            e.preventDefault();
            handleSleepOverlayClick();
          }}
        >
          {/* Tiny streaming indicator */}
          <div className="sleep-streaming-dot" />

          {/* Hint text - fades after 3 seconds */}
          <div className={`sleep-hint ${sleepHintVisible ? 'visible' : ''}`}>
            <span className="sleep-hint-icon">👆👆👆</span>
            <span className="sleep-hint-text">Triple-tap to wake</span>
          </div>
        </div>
      )}
    </div>
  );
}
