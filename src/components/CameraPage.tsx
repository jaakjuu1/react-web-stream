import { useState, useEffect, useCallback } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  VideoTrack,
  useRoomContext,
} from '@livekit/components-react';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
import { api } from '../lib/api';
import { cameraRoomOptions } from '../lib/livekit';

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

  const tracks = useTracks([Track.Source.Camera], {
    onlySubscribed: false,
  });

  const localVideoTrack = tracks.find(
    (t) =>
      t.participant.identity === localParticipant?.identity &&
      t.source === Track.Source.Camera
  );

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
    </div>
  );
}
