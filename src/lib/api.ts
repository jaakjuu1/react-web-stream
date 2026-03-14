// Use relative URL - Vite proxy handles /api in dev, same-origin in production
const API_URL = '';

interface SubscriptionStatus {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none';
  planId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface TokenResponse {
  token: string;
  livekitUrl: string;
  roomName: string;
  participantId: string;
  deviceId?: string;
}

interface Room {
  id: string;
  name: string;
  livekitRoom: string;
  deviceCount?: number;
  createdAt: string;
}

interface DetectionEvent {
  id: string;
  type: 'motion' | 'sound';
  timestamp: string;
  deviceId: string;
  confidence: number | null;
  thumbnailPath: string | null;
  notificationSent: boolean;
  markedFalsePositive: boolean;
  room?: {
    id: string;
    name: string;
  };
}

interface EventsListResponse {
  events: DetectionEvent[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface EventsListParams {
  roomId?: string;
  type?: 'motion' | 'sound';
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface EventStats {
  total: number;
  last24h: number;
  last7d: number;
  byType: Record<string, number>;
  byDevice: Record<string, number>;
}

interface Clip {
  id: string;
  filename: string;
  storagePath: string;
  storageType: string;
  mimeType: string;
  fileSize: number;
  duration: number | null;
  detectionType: 'motion' | 'sound';
  confidence: number;
  deviceId: string;
  roomId: string;
  room?: { id: string; name: string };
  recordedAt: string;
  createdAt: string;
}

interface ClipsListParams {
  roomId?: string;
  deviceId?: string;
  type?: 'motion' | 'sound';
  limit?: number;
  offset?: number;
}

interface ClipsListResponse {
  clips: Clip[];
  total: number;
  limit: number;
  offset: number;
}

// Token getter function - set by Clerk's useAuth hook
type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;

export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

class ApiClient {
  private async getToken(): Promise<string | null> {
    if (!tokenGetter) return null;
    return tokenGetter();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = await this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Demo tokens (no auth required)
  async getDemoCameraToken(): Promise<TokenResponse> {
    return this.request<TokenResponse>('/api/tokens/demo/camera', {
      method: 'POST',
    });
  }

  async getDemoViewerToken(): Promise<TokenResponse> {
    return this.request<TokenResponse>('/api/tokens/demo/viewer', {
      method: 'POST',
    });
  }

  // Authenticated tokens
  async getCameraToken(roomId: string, deviceName?: string): Promise<TokenResponse> {
    return this.request<TokenResponse>('/api/tokens/camera', {
      method: 'POST',
      body: JSON.stringify({ roomId, deviceName }),
    });
  }

  async getViewerToken(roomId: string): Promise<TokenResponse> {
    return this.request<TokenResponse>('/api/tokens/viewer', {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    });
  }

  // Rooms
  async getRooms(): Promise<{ rooms: Room[] }> {
    return this.request<{ rooms: Room[] }>('/api/rooms');
  }

  async createRoom(name: string): Promise<{ room: Room }> {
    return this.request<{ room: Room }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteRoom(id: string): Promise<void> {
    await this.request(`/api/rooms/${id}`, { method: 'DELETE' });
  }

  // Pairing
  async generatePairingCode(roomId: string): Promise<{
    code: string;
    qrCode: string;
    expiresAt: string;
    roomName: string;
  }> {
    return this.request('/api/pairing/generate', {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    });
  }

  async completePairing(code: string, deviceName?: string): Promise<TokenResponse & {
    success: boolean;
    roomDisplayName: string;
  }> {
    return this.request('/api/pairing/complete', {
      method: 'POST',
      body: JSON.stringify({ code, deviceName }),
    });
  }

  // Detection Events
  async getEvents(params: EventsListParams = {}): Promise<EventsListResponse> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
    const query = searchParams.toString();
    return this.request<EventsListResponse>(`/api/events${query ? `?${query}` : ''}`);
  }

  async getEvent(id: string): Promise<{ event: DetectionEvent }> {
    return this.request<{ event: DetectionEvent }>(`/api/events/${id}`);
  }

  async createEvent(data: {
    roomId: string;
    type: 'motion' | 'sound';
    deviceId: string;
    confidence?: number;
    thumbnailPath?: string;
  }): Promise<{ event: DetectionEvent }> {
    return this.request<{ event: DetectionEvent }>('/api/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEvent(
    id: string,
    data: { markedFalsePositive?: boolean; notificationSent?: boolean }
  ): Promise<{ event: DetectionEvent }> {
    return this.request<{ event: DetectionEvent }>(`/api/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/events/${id}`, {
      method: 'DELETE',
    });
  }

  async getEventStats(roomId: string): Promise<{ stats: EventStats }> {
    return this.request<{ stats: EventStats }>(`/api/events/stats/${roomId}`);
  }

  // Push Notifications
  async subscribePush(subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }): Promise<{ success: boolean; subscriptionId: string }> {
    return this.request('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
  }

  async unsubscribePush(endpoint: string): Promise<{ success: boolean }> {
    return this.request('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  }

  async getPushSubscriptions(): Promise<{
    subscriptions: Array<{ id: string; endpoint: string; createdAt: string }>;
  }> {
    return this.request('/api/push/subscriptions');
  }

  async testPushNotification(): Promise<{ success: boolean; sent: number; failed: number }> {
    return this.request('/api/push/test', { method: 'POST' });
  }

  // Clips
  async uploadClip(formData: FormData): Promise<{ clip: Clip }> {
    const headers: Record<string, string> = {};
    const token = await this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Don't set Content-Type - let browser set it with boundary for multipart

    const response = await fetch(`${API_URL}/api/clips`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }

  async getClips(params: ClipsListParams = {}): Promise<ClipsListResponse> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
    const query = searchParams.toString();
    return this.request<ClipsListResponse>(`/api/clips${query ? `?${query}` : ''}`);
  }

  async getClip(id: string): Promise<{ clip: Clip }> {
    return this.request<{ clip: Clip }>(`/api/clips/${id}`);
  }

  async deleteClip(clipId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/clips/${clipId}`, {
      method: 'DELETE',
    });
  }

  async getClipPlaybackUrl(clipId: string): Promise<string> {
    const data = await this.request<{ url: string; expiresIn: number | null }>(
      `/api/clips/${clipId}/url`
    );
    return data.url;
  }

  // Stripe / Billing
  async createCheckoutSession(): Promise<{ url: string }> {
    return this.request<{ url: string }>('/api/stripe/create-checkout-session', {
      method: 'POST',
    });
  }

  async createPortalSession(): Promise<{ url: string }> {
    return this.request<{ url: string }>('/api/stripe/create-portal-session', {
      method: 'POST',
    });
  }

  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.request<SubscriptionStatus>('/api/stripe/subscription');
  }
}

export const api = new ApiClient();
export type {
  TokenResponse,
  Room,
  DetectionEvent,
  EventsListResponse,
  EventsListParams,
  EventStats,
  Clip,
  ClipsListParams,
  ClipsListResponse,
};
