// Use relative URL - Vite proxy handles /api in dev, same-origin in production
const API_URL = '';

interface TokenResponse {
  token: string;
  livekitUrl: string;
  roomName: string;
  participantId: string;
  deviceId?: string;
}

interface AuthResponse {
  user: { id: string; email: string };
  accessToken: string;
  refreshToken: string;
}

interface Room {
  id: string;
  name: string;
  livekitRoom: string;
  deviceCount?: number;
  createdAt: string;
}

class ApiClient {
  private accessToken: string | null = null;

  constructor() {
    // Load token from localStorage on init
    this.accessToken = localStorage.getItem('accessToken');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async register(email: string, password: string): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setTokens(result.accessToken, result.refreshToken);
    return result;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setTokens(result.accessToken, result.refreshToken);
    return result;
  }

  logout(): void {
    this.accessToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
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
}

export const api = new ApiClient();
export type { TokenResponse, AuthResponse, Room };
