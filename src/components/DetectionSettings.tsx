import { useState, useCallback, useEffect } from 'react';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';
import { usePushNotifications } from '../hooks/usePushNotifications';

export interface DetectionSettingsData {
  motionEnabled: boolean;
  soundEnabled: boolean;
  motionSensitivity: number;
  soundSensitivity: number;
  cooldownSeconds: number;
}

interface DetectionSettingsProps {
  room: Room | null;
  initialSettings?: Partial<DetectionSettingsData>;
  onSettingsChange?: (settings: DetectionSettingsData) => void;
}

const defaultSettings: DetectionSettingsData = {
  motionEnabled: true,
  soundEnabled: true,
  motionSensitivity: 0.5,
  soundSensitivity: 0.5,
  cooldownSeconds: 30,
};

export function DetectionSettings({
  room,
  initialSettings,
  onSettingsChange,
}: DetectionSettingsProps) {
  const [settings, setSettings] = useState<DetectionSettingsData>({
    ...defaultSettings,
    ...initialSettings,
  });
  const [isExpanded, setIsExpanded] = useState(false);

  const push = usePushNotifications();

  // Listen for settings from camera
  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      participant: { identity: string } | undefined,
      _kind?: DataPacket_Kind,
      topic?: string
    ) => {
      if (topic !== 'detection') return;
      if (!participant?.identity.startsWith('cam_')) return;

      try {
        const decoder = new TextDecoder();
        const message = decoder.decode(payload);
        const data = JSON.parse(message);

        if (data.messageType === 'settings') {
          setSettings((prev) => ({
            ...prev,
            motionEnabled: data.motionEnabled ?? prev.motionEnabled,
            soundEnabled: data.soundEnabled ?? prev.soundEnabled,
            motionSensitivity: data.motionSensitivity ?? prev.motionSensitivity,
            soundSensitivity: data.soundSensitivity ?? prev.soundSensitivity,
            cooldownSeconds: data.cooldownSeconds ?? prev.cooldownSeconds,
          }));
        }
      } catch (err) {
        console.error('[DetectionSettings] Failed to parse settings:', err);
      }
    };

    room.on(RoomEvent.DataReceived, handleData);

    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  // Send settings to camera
  const sendSettings = useCallback(
    async (newSettings: DetectionSettingsData) => {
      if (!room) return;

      const message = JSON.stringify({
        messageType: 'settings',
        ...newSettings,
      });

      const encoder = new TextEncoder();
      const data = encoder.encode(message);

      try {
        await room.localParticipant.publishData(data, {
          reliable: true,
          topic: 'detection',
        });
        console.log('[DetectionSettings] Settings sent to camera');
      } catch (err) {
        console.error('[DetectionSettings] Failed to send settings:', err);
      }
    },
    [room]
  );

  const updateSetting = useCallback(
    <K extends keyof DetectionSettingsData>(key: K, value: DetectionSettingsData[K]) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      sendSettings(newSettings);
      onSettingsChange?.(newSettings);
    },
    [settings, sendSettings, onSettingsChange]
  );

  const sensitivityLabel = (value: number) => {
    if (value < 0.3) return 'Low';
    if (value < 0.7) return 'Medium';
    return 'High';
  };

  return (
    <div className={`detection-settings ${isExpanded ? 'expanded' : ''}`}>
      <button
        className="detection-settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="settings-icon">⚙️</span>
        <span>Detection Settings</span>
        <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
      </button>

      {isExpanded && (
        <div className="detection-settings-content">
          {/* Motion Detection */}
          <div className="setting-group">
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.motionEnabled}
                onChange={(e) => updateSetting('motionEnabled', e.target.checked)}
              />
              <span className="toggle-label">Motion Detection</span>
            </label>

            {settings.motionEnabled && (
              <div className="setting-slider">
                <span className="slider-label">Sensitivity</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={settings.motionSensitivity}
                  onChange={(e) =>
                    updateSetting('motionSensitivity', parseFloat(e.target.value))
                  }
                />
                <span className="slider-value">
                  {sensitivityLabel(settings.motionSensitivity)}
                </span>
              </div>
            )}
          </div>

          {/* Sound Detection */}
          <div className="setting-group">
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => updateSetting('soundEnabled', e.target.checked)}
              />
              <span className="toggle-label">Sound Detection</span>
            </label>

            {settings.soundEnabled && (
              <div className="setting-slider">
                <span className="slider-label">Sensitivity</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={settings.soundSensitivity}
                  onChange={(e) =>
                    updateSetting('soundSensitivity', parseFloat(e.target.value))
                  }
                />
                <span className="slider-value">
                  {sensitivityLabel(settings.soundSensitivity)}
                </span>
              </div>
            )}
          </div>

          {/* Cooldown */}
          <div className="setting-group">
            <div className="setting-select">
              <span className="select-label">Event Cooldown</span>
              <select
                value={settings.cooldownSeconds}
                onChange={(e) =>
                  updateSetting('cooldownSeconds', parseInt(e.target.value))
                }
              >
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="120">2 minutes</option>
                <option value="300">5 minutes</option>
              </select>
            </div>
          </div>

          {/* Push Notifications */}
          <div className="setting-group notifications-group">
            <div className="setting-header">
              <span className="setting-title">Push Notifications</span>
            </div>

            {!push.isSupported ? (
              <div className="notification-status disabled">
                Not supported in this browser
              </div>
            ) : push.error ? (
              <div className="notification-status error">{push.error}</div>
            ) : push.isSubscribed ? (
              <div className="notification-controls">
                <span className="notification-status enabled">Enabled</span>
                <button
                  className="notification-btn"
                  onClick={push.unsubscribe}
                  disabled={push.isLoading}
                >
                  Disable
                </button>
                <button
                  className="notification-btn test"
                  onClick={push.testNotification}
                  disabled={push.isLoading}
                >
                  Test
                </button>
              </div>
            ) : (
              <div className="notification-controls">
                <span className="notification-status disabled">
                  {push.permission === 'denied' ? 'Blocked' : 'Disabled'}
                </span>
                {push.permission !== 'denied' && (
                  <button
                    className="notification-btn enable"
                    onClick={push.subscribe}
                    disabled={push.isLoading}
                  >
                    {push.isLoading ? 'Enabling...' : 'Enable'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
