/**
 * Paired-device credentials for camera phones.
 *
 * Stored in localStorage at pairing time so a dedicated camera device can
 * re-authenticate (fresh LiveKit tokens, event posts, clip uploads) without
 * a signed-in user session. Deleting the device from the viewer revokes
 * these credentials server-side.
 */

export interface DeviceCredentials {
  deviceId: string;
  deviceSecret: string;
  roomId: string;
  roomDisplayName: string;
  participantId: string;
  deviceName: string;
}

const STORAGE_KEY = 'petportal_device';

export function getDeviceCredentials(): DeviceCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceCredentials;
    if (!parsed.deviceId || !parsed.deviceSecret) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDeviceCredentials(credentials: DeviceCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

export function clearDeviceCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function deviceAuthHeader(): string | null {
  const credentials = getDeviceCredentials();
  if (!credentials) return null;
  return `Device ${credentials.deviceId}.${credentials.deviceSecret}`;
}
