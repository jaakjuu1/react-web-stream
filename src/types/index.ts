export type ParticipantRole = 'camera' | 'viewer';

export interface RoomConfig {
  roomName: string;
  participantName: string;
  role: ParticipantRole;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
  facing?: 'user' | 'environment';
}
