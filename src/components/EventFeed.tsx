import { useState, useEffect, useCallback } from 'react';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';
import type { DetectionEvent } from '../lib/api';

interface LiveDetectionEvent {
  id: string;
  type: 'motion' | 'sound';
  timestamp: string;
  deviceId: string;
  confidence: number;
  isLive: true;
}

type FeedEvent = (DetectionEvent & { isLive?: false }) | LiveDetectionEvent;

interface EventFeedProps {
  room: Room | null;
  maxEvents?: number;
}

export function EventFeed({ room, maxEvents = 20 }: EventFeedProps) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Listen for live detection events via LiveKit data channel
  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      participant: { identity: string } | undefined,
      _kind?: DataPacket_Kind,
      topic?: string
    ) => {
      if (topic !== 'detection') return;
      // Only listen to camera participants (not other viewers)
      if (!participant?.identity.startsWith('cam_')) return;

      try {
        const decoder = new TextDecoder();
        const message = decoder.decode(payload);
        const data = JSON.parse(message);

        // Only handle event messages
        if (data.messageType !== 'event') return;

        const newEvent: LiveDetectionEvent = {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: data.type,
          timestamp: data.timestamp,
          deviceId: data.deviceId,
          confidence: data.confidence,
          isLive: true,
        };

        setEvents((prev) => {
          const updated = [newEvent, ...prev];
          return updated.slice(0, maxEvents);
        });
      } catch (err) {
        console.error('[EventFeed] Failed to parse event:', err);
      }
    };

    room.on(RoomEvent.DataReceived, handleData);

    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, maxEvents]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatConfidence = (confidence: number | null) => {
    if (confidence === null) return '';
    return `${Math.round(confidence * 100)}%`;
  };

  const getEventIcon = (type: 'motion' | 'sound') => {
    return type === 'motion' ? '🏃' : '🔊';
  };

  const getEventLabel = (type: 'motion' | 'sound') => {
    return type === 'motion' ? 'Motion' : 'Sound';
  };

  if (events.length === 0) {
    return (
      <div className="event-feed event-feed-empty">
        <div className="event-feed-header">
          <span className="event-feed-title">Events</span>
        </div>
        <div className="event-feed-empty-message">
          No detection events yet
        </div>
      </div>
    );
  }

  const displayEvents = isExpanded ? events : events.slice(0, 3);

  return (
    <div className={`event-feed ${isExpanded ? 'expanded' : ''}`}>
      <div className="event-feed-header">
        <span className="event-feed-title">
          Events
          <span className="event-count">{events.length}</span>
        </span>
        <div className="event-feed-actions">
          {events.length > 3 && (
            <button
              className="event-feed-toggle"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Show less' : `Show all (${events.length})`}
            </button>
          )}
          <button className="event-feed-clear" onClick={clearEvents} title="Clear events">
            Clear
          </button>
        </div>
      </div>

      <div className="event-feed-list">
        {displayEvents.map((event) => (
          <div
            key={event.id}
            className={`event-item ${event.type} ${event.isLive ? 'live' : ''}`}
          >
            <span className="event-icon">{getEventIcon(event.type)}</span>
            <div className="event-details">
              <span className="event-type">{getEventLabel(event.type)}</span>
              {event.confidence !== null && (
                <span className="event-confidence">
                  {formatConfidence(event.confidence)}
                </span>
              )}
            </div>
            <span className="event-time">{formatTime(event.timestamp)}</span>
            {event.isLive && <span className="event-live-badge">LIVE</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
