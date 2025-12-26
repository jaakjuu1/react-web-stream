import { useState, useEffect, useCallback } from 'react';
import {
  LiveKitRoom,
  useTracks,
  useRoomContext,
  useParticipants,
  useLocalParticipant,
} from '@livekit/components-react';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
import { api } from '../lib/api';
import { viewerRoomOptions } from '../lib/livekit';
import { VideoTile } from './VideoTile';
import { EventFeed } from './EventFeed';
import { DetectionSettings } from './DetectionSettings';

export function ViewerPage() {
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Use demo endpoint for now (no auth required)
    api.getDemoViewerToken()
      .then((response) => {
        setToken(response.token);
        setLivekitUrl(response.livekitUrl);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="viewer-page">
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
      <div className="viewer-page">
        <div className="loading">Connecting...</div>
      </div>
    );
  }

  return (
    <div className="viewer-page">
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect={true}
        video={false}
        audio={true}
        options={viewerRoomOptions}
      >
        <ViewerInterface />
      </LiveKitRoom>
    </div>
  );
}

function ViewerInterface() {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Connecting
  );
  const [pinnedParticipant, setPinnedParticipant] = useState<string | null>(
    null
  );
  const [mutedParticipants, setMutedParticipants] = useState<Set<string>>(
    new Set()
  );
  // Portrait mode - rotates all feeds 90° for 9:16 phone cameras
  const [portraitMode, setPortraitMode] = useState(false);
  // Push-to-talk state
  const [isTalking, setIsTalking] = useState(false);
  // Sidebar visibility
  const [showSidebar, setShowSidebar] = useState(true);

  // Disable microphone on mount (start silent)
  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(false);
    }
  }, [localParticipant]);

  // Push-to-talk handlers
  const startTalking = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(true);
      setIsTalking(true);
    }
  }, [localParticipant]);

  const stopTalking = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(false);
      setIsTalking(false);
    }
  }, [localParticipant]);

  // Get all camera tracks from remote participants
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone], {
    onlySubscribed: true,
  });

  // Filter to only remote camera participants (those starting with 'cam_')
  const cameraParticipants = participants.filter(
    (p) => p.identity.startsWith('cam_') && !p.isLocal
  );

  // Group tracks by participant
  const participantTracks = cameraParticipants.map((participant) => {
    const videoTrack = tracks.find(
      (t) =>
        t.participant.identity === participant.identity &&
        t.source === Track.Source.Camera
    );
    const audioTrack = tracks.find(
      (t) =>
        t.participant.identity === participant.identity &&
        t.source === Track.Source.Microphone
    );
    return { participant, videoTrack, audioTrack };
  });

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

  const handlePin = (participantId: string) => {
    setPinnedParticipant((prev) =>
      prev === participantId ? null : participantId
    );
  };

  const handleToggleMute = (participantId: string) => {
    setMutedParticipants((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(participantId)) {
        newSet.delete(participantId);
      } else {
        newSet.add(participantId);
      }
      return newSet;
    });
  };

  const togglePortraitMode = () => {
    setPortraitMode((prev) => !prev);
  };

  // Sort tiles: pinned first, then by identity
  const sortedTracks = [...participantTracks].sort((a, b) => {
    if (a.participant.identity === pinnedParticipant) return -1;
    if (b.participant.identity === pinnedParticipant) return 1;
    return a.participant.identity.localeCompare(b.participant.identity);
  });

  return (
    <div className={`viewer-interface ${showSidebar ? 'with-sidebar' : ''}`}>
      {/* Header bar with status and controls */}
      <div className="viewer-header">
        <div className={`connection-status ${connectionState.toLowerCase()}`}>
          <span className="status-dot" />
          <span className="status-text">
            {connectionState === ConnectionState.Connected
              ? 'Connected'
              : connectionState}
          </span>
          <span className="camera-count">
            {cameraParticipants.length} camera
            {cameraParticipants.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="viewer-header-controls">
          {/* Portrait mode toggle for 9:16 feeds */}
          <button
            className={`portrait-toggle ${portraitMode ? 'active' : ''}`}
            onClick={togglePortraitMode}
            title={portraitMode ? 'Switch to landscape (16:9)' : 'Switch to portrait (9:16)'}
          >
            <span className="portrait-icon">
              {portraitMode ? '🖼️' : '📱'}
            </span>
            <span className="portrait-label">
              {portraitMode ? '16:9' : '9:16'}
            </span>
          </button>

          {/* Sidebar toggle */}
          <button
            className={`sidebar-toggle ${showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            <span className="sidebar-icon">📊</span>
          </button>
        </div>
      </div>

      <div className="viewer-content">
        <div
          className={`video-grid ${pinnedParticipant ? 'has-pinned' : ''} cameras-${Math.min(cameraParticipants.length, 4)} ${portraitMode ? 'portrait-mode' : ''}`}
        >
          {sortedTracks.length === 0 ? (
            <div className="no-cameras">
              <p>Waiting for cameras to connect...</p>
              <p className="hint">Open /camera on another device to start streaming</p>
            </div>
          ) : (
            sortedTracks.map(({ participant, videoTrack, audioTrack }) => (
              <VideoTile
                key={participant.identity}
                participant={participant}
                videoTrack={videoTrack}
                audioTrack={audioTrack}
                isPinned={participant.identity === pinnedParticipant}
                isMuted={mutedParticipants.has(participant.identity)}
                onPin={() => handlePin(participant.identity)}
                onToggleMute={() => handleToggleMute(participant.identity)}
                portraitMode={portraitMode}
              />
            ))
          )}
        </div>

        {/* Sidebar with event feed and settings */}
        {showSidebar && (
          <div className="viewer-sidebar">
            <EventFeed room={room} />
            <DetectionSettings room={room} />
          </div>
        )}
      </div>

      {/* Push-to-talk button */}
      <button
        className={`push-to-talk-btn ${isTalking ? 'talking' : ''}`}
        onMouseDown={startTalking}
        onMouseUp={stopTalking}
        onMouseLeave={stopTalking}
        onTouchStart={(e) => { e.preventDefault(); startTalking(); }}
        onTouchEnd={(e) => { e.preventDefault(); stopTalking(); }}
        onContextMenu={(e) => e.preventDefault()}
        title="Hold to talk"
      >
        <span className="ptt-icon">{isTalking ? '🎙️' : '🎤'}</span>
        <span className="ptt-label">{isTalking ? 'Speaking...' : 'Hold to talk'}</span>
      </button>
    </div>
  );
}
