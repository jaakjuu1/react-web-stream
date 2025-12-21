With **4 cameras** and **1–5 concurrent viewers**, an **SFU-based WebRTC** setup is still the right design. The good news: at this scale you can keep infrastructure simple and costs/bandwidth sane—*if* you use simulcast + adaptive streaming (otherwise egress grows linearly and gets wasteful).

## What changes with “up to 5 viewers”

### The naive bandwidth math (worst-case, no optimizations)

Assume each camera publishes **720p ~2 Mbps**:

* SFU ingress: `4 cams × 2 Mbps = ~8 Mbps`
* SFU egress per viewer: `4 × 2 Mbps = ~8 Mbps`
* SFU egress at 5 viewers: `5 × 8 Mbps = ~40 Mbps` (plus overhead)

That works technically, but it’s unnecessarily heavy.

### The correct bandwidth approach (simulcast + adaptive stream)

Use:

* **Simulcast** (publish multiple encodings: e.g., 180p/360p/720p)
* **Adaptive stream** (viewer automatically receives the layer that matches tile size/visibility)
* **Dynacast** (stop publishing unused layers to save uplink) ([LiveKit docs][1])

Practical outcome in a 2×2 grid:

* Each viewer gets **low/medium** layers for the 4 small tiles
* Only the **pinned/active** camera gets **high** layer

A realistic per-viewer target becomes roughly:

* Grid: `4 × (0.25–0.6 Mbps) = ~1–2.4 Mbps`
* Pinned high: `~1.5–3 Mbps`
* Total per viewer: **~3–5 Mbps**
* At 5 viewers: **~15–25 Mbps egress**

This is the difference between “fine for a hobby” and “fine in production”.

## TURN: still required (internet-wide)

Even if cameras are on Wi-Fi, once you go internet-wide you will hit NAT/firewall scenarios where direct connectivity is not possible; a **TURN server relays traffic** when needed. ([WebRTC][2])
Plan for TURN from day one, and include UDP + TCP/TLS fallback (common corporate networks block UDP).

## Recommended topology (simple, scalable to your numbers)

### Components

1. **React PWA**

* `/camera`: publish UI (back camera default, mic toggle, torch toggle where available)
* `/viewer`: dashboard (2×2 grid, pin, per-tile mute, connection indicator)

2. **LiveKit SFU**

* JS client uses a **WebSocket signaling channel** and up to **two PeerConnections** (publish/subscribe) to the SFU. ([LiveKit docs][3])

3. **Backend API**

* Auth (any method)
* Device registry (camera devices)
* Pairing codes (QR)
* Token minting (short-lived room tokens)

4. **TURN (coturn or managed)**

* Provided in `iceServers` config for the LiveKit client connections

### Room model (clean and secure)

* One room per account: `user_<userId>`
* Cameras join as `cam_<deviceId>` with **publish-only** permissions
* Viewers join with **subscribe-only** (and optionally admin controls)

## UX you should implement (MVP but “real”)

### Pairing

* Viewer clicks **Add Camera** → QR with one-time code (TTL 60–120s)
* Phone opens `/camera` → scans QR → binds device to account → starts publishing

### Viewer dashboard

* 2×2 grid (default all tiles muted)
* Pin a tile (that one upgrades to high layer)
* Show status: Online/Offline, bitrate, “TURN relayed” indicator (optional but very useful in support)

## Phone “camera mode” reliability (Android)

Phones will try to sleep/dim; for a camera device this is a usability killer. Use the **Screen Wake Lock API** (when supported) to keep the screen on while streaming. ([MDN Web Docs][4])
Still assume the user keeps the app in foreground; background capture is not something the web can reliably guarantee across devices.

## Deployment recommendation for your usage (1–5 viewers)

**Default choice: Managed SFU (fastest, least ops).**
At your scale, the operational complexity of self-hosting (UDP/TURN/TLS/monitoring) is rarely worth it unless you have a strong reason.

If you *do* self-host later, you can migrate without changing the React app much (the client just points to a different LiveKit endpoint).

## Concrete build checklist (what I would implement first)

1. Backend

* `POST /pairing-codes` → `{code, qrPayload, expiresAt}`
* `POST /pair` (phone submits code) → binds device
* `POST /lk-token` → returns short-lived LiveKit token for either camera/viewer role

2. Frontend

* LiveKit room connection wrapper
* Publish page: camera selection + audio toggle + reconnect
* Viewer page: grid + pin + adaptive stream enabled + per-tile mute

3. Media optimizations (non-negotiable)

* Enable simulcast publishing
* Enable adaptive stream
* Enable dynacast ([LiveKit docs][1])

If you want, I can now write the **exact API contract** (request/response bodies), the **React route/component breakdown**, and the **LiveKit room configuration** (simulcast presets, bitrates, reconnection logic) tailored to “4 cams / up to 5 viewers / Wi-Fi uplinks”.

[1]: https://docs.livekit.io/home/client/tracks/advanced/?utm_source=chatgpt.com "Codecs and more | LiveKit docs"
[2]: https://webrtc.org/getting-started/turn-server?utm_source=chatgpt.com "TURN server  |  WebRTC"
[3]: https://docs.livekit.io/reference/internals/client-protocol/?utm_source=chatgpt.com "Client Protocol | LiveKit docs"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/WakeLock?utm_source=chatgpt.com "WakeLock - Web APIs | MDN"
