# Pet Portal

## Project Overview

A React PWA for monitoring your pets remotely. Stream video from up to 4 mobile phone cameras to 1-5 concurrent viewers using LiveKit Cloud SFU.

## Architecture

```
┌─────────────┐     WebRTC      ┌──────────────┐
│  /camera    │ ───────────────→│              │
│  (phone 1)  │   publish       │              │
└─────────────┘                 │   LiveKit    │
      ...                       │    Cloud     │
┌─────────────┐                 │              │
│  /camera    │ ───────────────→│              │
│  (phone 4)  │   publish       │              │
└─────────────┘                 └──────┬───────┘
                                       │ subscribe
                                       ▼
                                ┌─────────────┐
                                │   /viewer   │
                                │  (desktop)  │
                                └─────────────┘
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Routing**: React Router v6
- **WebRTC**: LiveKit Cloud (managed SFU with TURN)
- **LiveKit SDK**: `livekit-client` + `@livekit/components-react`
- **Styling**: CSS Modules or Tailwind CSS

## Environment Variables

```env
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
VITE_LIVEKIT_API_KEY=your-api-key
VITE_LIVEKIT_API_SECRET=your-api-secret
```

**Note**: For MVP, we generate tokens client-side for development. In production, tokens must be generated server-side.

## Routes

| Route | Purpose | Permissions |
|-------|---------|-------------|
| `/` | Landing/home page | - |
| `/camera` | Publish video from device | Publish only |
| `/viewer` | Watch all camera feeds | Subscribe only |

## Room Model

- **Room name**: Shared room code (e.g., `demo-room`)
- **Camera participants**: `cam_<random-id>` with publish permissions
- **Viewer participants**: `viewer_<random-id>` with subscribe permissions

## LiveKit Configuration

### Simulcast (Camera Publisher)

```typescript
{
  simulcast: true,
  videoSimulcastLayers: [
    { width: 320, height: 180, bitrate: 150_000 },   // Low
    { width: 640, height: 360, bitrate: 500_000 },   // Medium
    { width: 1280, height: 720, bitrate: 1_500_000 } // High
  ]
}
```

### Adaptive Stream (Viewer)

```typescript
{
  adaptiveStream: true,
  dynacast: true
}
```

### Video Presets

- **Camera publish**: 720p, 24-30 fps, back camera default
- **Grid tiles**: Receive low/medium layers (~0.25-0.6 Mbps each)
- **Pinned tile**: Receive high layer (~1.5-3 Mbps)

## Bandwidth Estimates

| Scenario | Bandwidth |
|----------|-----------|
| SFU Ingress (4 cams) | ~8 Mbps |
| Per viewer (grid) | ~3-5 Mbps |
| 5 viewers total | ~15-25 Mbps |

## Features

### Camera Page (`/camera`)

- [x] Camera selection (front/back)
- [x] Video preview
- [x] Audio mute toggle
- [x] Connection status indicator
- [x] Reconnection handling
- [ ] Torch/flashlight toggle (future)
- [ ] Wake Lock API (future)

### Viewer Page (`/viewer`)

- [x] 2x2 grid layout
- [x] Click to pin/focus a camera
- [x] Per-tile audio mute
- [x] Online/offline status per camera
- [x] Adaptive quality based on tile size
- [ ] Bitrate indicator (future)
- [ ] TURN relay indicator (future)

## File Structure

```
src/
├── main.tsx                 # App entry
├── App.tsx                  # Router setup
├── components/
│   ├── CameraPage.tsx       # Camera publish UI
│   ├── ViewerPage.tsx       # Viewer grid UI
│   ├── VideoTile.tsx        # Single video tile
│   ├── ConnectionStatus.tsx # Connection indicator
│   └── Controls.tsx         # Mute/camera toggle buttons
├── hooks/
│   ├── useCamera.ts         # Camera device management
│   └── useRoom.ts           # LiveKit room connection
├── lib/
│   ├── livekit.ts           # LiveKit config & helpers
│   └── token.ts             # Token generation (dev only)
├── styles/
│   └── index.css            # Global styles
└── types/
    └── index.ts             # TypeScript types
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Testing Locally

1. Start the dev server
2. Open `/camera` on a mobile device (or use browser with camera)
3. Open `/viewer` on desktop
4. Both should connect to the same LiveKit room

**Note**: For local testing across devices, use a tool like `ngrok` or access via local IP with HTTPS.

## Security Notes

- **MVP**: Uses client-side token generation (NOT for production)
- **Production**: Tokens must be generated server-side with proper auth
- Camera participants should only have publish permissions
- Viewer participants should only have subscribe permissions

## Future Enhancements

1. **Authentication**: User accounts and device binding
2. **QR Pairing**: Scan QR to add camera devices
3. **Backend API**: Proper token minting, device registry
4. **Wake Lock**: Keep screen on while streaming
5. **Recording**: Optional cloud recording
6. **Alerts**: Motion detection notifications


# Context7 MCP

Always use context7 when I need code generation, setup or configuration steps, or library/API documentation. This means you should automatically use the Context7 MCP tools to resolve library id and get library docs without me having to explicitly ask.