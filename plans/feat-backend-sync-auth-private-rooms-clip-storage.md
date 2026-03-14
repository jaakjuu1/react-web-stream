# feat: Backend Sync, Authentication, Private Rooms & Personal Clip Storage

**Created**: 2025-12-26
**Updated**: 2026-03-14
**Status**: In Progress
**Type**: Enhancement

---

## Overview

Complete backend infrastructure for Pet Portal:

1. **User Authentication** — Clerk (with Capacitor-ready native SDKs) ✅
2. **Stripe Subscriptions** — Checkout, portal, webhook handling ✅
3. **Private Rooms** — User-owned rooms with isolated access ✅
4. **Clip Upload & Storage** — Cloudflare R2 (S3-compatible, free egress) 🔧
5. **Clip Sync Service** — IndexedDB → R2 synchronization ✅ (needs R2 integration)
6. **Clip Management UI** — View, play, download, delete clips ✅ (needs R2 URLs)
7. **App Store Publishing** — Capacitor wrapper for iOS & Android 📋

---

## Architecture Decisions

### Auth: Clerk

Already fully integrated. Clerk released native iOS/Android SDKs (Feb 2026), making it Capacitor-compatible.

- Frontend: `ClerkProvider` + `<SignIn />` / `<SignUp />` components
- Backend: `@clerk/express` middleware with auto user creation
- App Store: Use Clerk headless mode + `@capgo/capacitor-social-login` for native Apple/Google dialogs

### Storage: Cloudflare R2

S3-compatible object storage with **zero egress fees** — critical for video streaming.

| Feature | Value |
|---------|-------|
| Storage cost | $0.015/GB-month |
| Egress | **Free** |
| Write ops | $4.50/million |
| Read ops | $0.36/million |
| Free tier | 10 GB storage, 1M writes, 10M reads |
| Max single upload | 5 GiB |
| Presigned URL expiry | Up to 7 days |

**Estimated cost** (100 clips/day, 5 MB avg): ~$0.23/month storage, $0 egress.

**SDK**: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` pointed at R2 endpoint.

### App Store: Capacitor

Wraps the React PWA in native WebView containers for iOS and Android.

- Reuses existing React + Vite codebase
- Full native API access via plugins (push notifications, camera, biometrics)
- Live Updates possible via Capgo (skip App Store review for JS/CSS changes)
- Apple Guideline 4.2 compliance: native push, offline support, proper splash/icons

---

## Current State (as of 2026-03-14)

### Completed ✅

| Component | Files | Status |
|-----------|-------|--------|
| Clerk Auth (frontend) | `src/main.tsx`, `src/components/AuthPage.tsx`, `src/components/ProtectedRoute.tsx`, `src/stores/authStore.ts` | Done |
| Clerk Auth (backend) | `server/src/middleware/clerk.ts`, `server/src/routes/auth.ts` | Done |
| Stripe Subscriptions | `server/src/services/stripe.service.ts`, `server/src/routes/stripe.ts`, `src/components/PricingPage.tsx` | Done |
| Private Rooms | `server/src/routes/rooms.ts` | Done |
| Clips API Routes | `server/src/routes/clips.ts` | Done (uses local storage) |
| Storage Service | `server/src/services/storage.service.ts` | Local only, R2 scaffolded |
| Client Sync Service | `src/services/syncService.ts`, `src/hooks/useClipSync.ts` | Done |
| Clip UI Components | `src/components/ClipList.tsx`, `src/components/ClipPlayer.tsx` | Done |
| Detection System | `src/hooks/useDetection.ts`, `src/services/soundDetector.ts` | Done |
| Push Notifications | `server/src/routes/push.ts`, `src/hooks/usePushNotifications.ts` | Done |
| Prisma Schema | `server/prisma/schema.prisma` (User, Room, Device, Clip, DetectionEvent, etc.) | Done |

### Remaining 🔧

| Task | Files | Effort |
|------|-------|--------|
| **R2 Storage Integration** | `server/src/services/storage.service.ts` | 2-3 hours |
| **Presigned URLs for clip playback** | `server/src/routes/clips.ts`, `src/components/ClipPlayer.tsx` | 1-2 hours |
| **R2 CORS configuration** | Cloudflare Dashboard / wrangler | 30 min |
| **Direct browser upload via presigned URLs** (optional) | `src/services/syncService.ts`, clips routes | 2-3 hours |
| **Capacitor setup** | New: `capacitor.config.ts`, `ios/`, `android/` | 3-4 hours |
| **Native push notifications** | Replace web-push with `@capacitor/push-notifications` | 2-3 hours |
| **Native social login** | `@capgo/capacitor-social-login` for Apple/Google | 2-3 hours |
| **E2E testing** | Manual testing on devices + API testing | 3-4 hours |

---

## Implementation Plan

### Phase 1: Cloudflare R2 Storage (Priority)

**Goal**: Replace local filesystem storage with Cloudflare R2.

#### 1a. Server-side R2 client

**File**: `server/src/services/storage.service.ts`

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
```

**Upload**: `PutObjectCommand` with Buffer from multer (fine for <50 MB clips)
**Download**: Return presigned GET URL instead of streaming through Express
**Delete**: `DeleteObjectCommand`

**Key organization**:
```
clips/{userId}/{roomId}/{YYYY-MM-DD}/{uuid}.webm
```

#### 1b. Update clips routes for presigned URLs

**File**: `server/src/routes/clips.ts`

Replace the file streaming endpoint with a presigned URL endpoint:

```typescript
// GET /api/clips/:id/url — returns presigned R2 URL
router.get('/:id/url', clerkAuth(), async (req, res) => {
  const clip = await prisma.clip.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!clip) return res.status(404).json({ error: 'Clip not found' });

  const url = await storage.getPresignedUrl(clip.storagePath, 3600);
  res.json({ url });
});
```

#### 1c. Update ClipPlayer to use presigned URLs

**File**: `src/components/ClipPlayer.tsx`

Fetch presigned URL before playing instead of hitting Express streaming endpoint.

#### 1d. Environment variables

```env
# Add to server/.env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=pet-portal-clips
STORAGE_TYPE=r2   # switch from 'local' to 'r2'
```

#### 1e. R2 bucket setup

```bash
# Create bucket
npx wrangler r2 bucket create pet-portal-clips

# Set CORS policy
npx wrangler r2 bucket cors set pet-portal-clips --file r2-cors.json
```

**r2-cors.json**:
```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://your-domain.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length", "x-amz-content-sha256"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

**NPM dependencies** (server):
```bash
cd server && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

### Phase 2: Capacitor Setup

**Goal**: Wrap the PWA for iOS and Android app stores.

#### 2a. Install Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Pet Portal" "com.petportal.app" --web-dir dist
npx cap add ios
npx cap add android
```

#### 2b. Native push notifications

Replace web-push with `@capacitor/push-notifications`:

```bash
npm install @capacitor/push-notifications
```

- Register for APNs (iOS) / FCM (Android)
- Send device token to server instead of web push subscription
- Update server push service to send via APNs/FCM

#### 2c. Native social login

```bash
npm install @capgo/capacitor-social-login
```

- Configure Sign in with Apple (required for App Store if offering social login)
- Configure Google Sign-In
- Use Clerk headless mode: get native token → exchange with Clerk

#### 2d. App Store compliance

- Proper app icons and splash screens (`@capacitor/splash-screen`)
- Status bar integration (`@capacitor/status-bar`)
- Safe area handling for notched devices
- Deep link configuration for auth callbacks
- Offline mode support (already have IndexedDB)

---

### Phase 3: Polish & Edge Cases

| Task | Details |
|------|---------|
| Token refresh during upload | Check Clerk token expiry before each upload, refresh if needed |
| Infinite scroll for clip list | Pagination with offset-based loading |
| Storage quota warnings | Query R2 usage, warn at configurable threshold |
| Retry all failed button | Already in sync service, add UI button |
| Error toast notifications | Global toast system for upload/sync errors |
| Loading skeletons | Clip list and player loading states |

---

## Acceptance Criteria

### Functional Requirements

- [x] **Authentication**: Clerk sign-in/sign-up with protected routes
- [x] **Subscriptions**: Stripe checkout, portal, webhook handling
- [x] **Private Rooms**: User-owned rooms with isolated access
- [ ] **R2 Upload**: Camera uploads clips to Cloudflare R2 after detection
- [ ] **R2 Playback**: Viewer plays clips via presigned R2 URLs
- [ ] **R2 Delete**: User can delete clips from R2
- [x] **Offline Queue**: Clips queue locally when offline, sync when online
- [x] **Retry Logic**: Failed uploads retry with exponential backoff
- [x] **Sync Status**: Camera shows sync status indicator
- [x] **Authorization**: Clips accessible only by room owner
- [ ] **iOS App**: Capacitor build passes App Store review
- [ ] **Android App**: Capacitor build published to Play Store

### Quality Gates

- [ ] R2 upload/download works with 50 MB clip
- [ ] Presigned URLs expire correctly (no stale access)
- [ ] Offline queue processes after reconnection
- [ ] Authorization tested (cannot access other user's clips)
- [ ] Capacitor build tested on physical iOS and Android devices
- [ ] Sign in with Apple works in Capacitor build

---

## Environment Variables

### Server

```env
# Clerk
CLERK_SECRET_KEY=sk_...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=pet-portal-clips
STORAGE_TYPE=r2

# App
DATABASE_URL=file:./dev.db
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### Frontend

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_LIVEKIT_URL=wss://...
VITE_API_URL=http://localhost:3001
```

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R2 presigned URL caching issues | Medium | Low | Short expiry (1h), cache-busting query params |
| Clerk WebView redirect on iOS | Medium | High | Test early in Capacitor, use headless mode fallback |
| Apple rejects as "repackaged website" | Medium | High | Add native push, offline support, proper splash/icons |
| Large clips timeout on mobile upload | Medium | Medium | Presigned URLs for direct R2 upload (bypass server) |
| R2 CORS misconfiguration | Low | Medium | Test with browser dev tools, explicit header list |

---

## NPM Dependencies to Add

### Server
```
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
```

### Frontend (for Capacitor)
```
@capacitor/core
@capacitor/cli
@capacitor/push-notifications
@capacitor/splash-screen
@capacitor/status-bar
@capgo/capacitor-social-login
```
