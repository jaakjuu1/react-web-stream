# launch: Production Readiness & First Paying Customers

**Status**: Proposed
**Created**: 2026-06-10
**Goal**: Ship a product that 10 strangers will pay for, love, and recommend — then scale the loop.

---

## Overview

Pet Portal turns an old phone into a pet camera: live multi-camera streaming (LiveKit),
motion/sound detection with clip recording, push notifications, Clerk auth, and Stripe
subscriptions ($9.99/mo, 7-day trial). The stack is ~85% built. What stands between us
and revenue is **not more features** — it is one critical wiring gap, a first-run
experience, production hardening, and a deliberate go-to-market motion.

**The one-sentence strategy**: *"Don't buy a $200 pet camera — the phone in your drawer
is one. 2-minute setup, alerts when your dog barks, clips you'll actually want to share."*

The wedge against Furbo/Petcube/Eufy is zero hardware cost and instant setup. The
built-in viral loop is the clip itself: every "look what my dog did while I was out"
clip shared to a group chat is an ad.

---

## Current State (verified 2026-06-10)

### Working end-to-end ✅

- Clerk auth + protected routes with subscription gating (`src/components/ProtectedRoute.tsx`)
- Stripe checkout, customer portal, webhook-driven subscription state, 7-day trial
  (`server/src/routes/stripe.ts`, `server/src/services/stripe.service.ts`)
- Server-side LiveKit token minting with room-ownership checks (`server/src/routes/tokens.ts:20-112`)
- Motion + sound detection, pre/post-buffered clip recording, IndexedDB sync queue with
  retry (`src/services/*`), events feed, push notifications (web-push + VAPID)
- Camera UX: wake lock, sleep mode, front/back switch; Viewer UX: 2x2 grid, pin,
  per-tile mute, push-to-talk
- CI: GitHub Actions → GHCR image → Hostinger deploy; Prisma migrations on boot;
  R2-or-local clip storage (`server/src/services/storage.service.ts`)

### The revenue blocker 🔴

**The paid pages still run in demo mode.** `src/components/CameraPage.tsx:26` and
`src/components/ViewerPage.tsx:26` call `getDemoCameraToken()` / `getDemoViewerToken()`,
which hit the **unauthenticated** `/api/tokens/demo/*` endpoints
(`server/src/routes/tokens.ts:114-157`) and put everyone in a single shared
`demo-room`. Consequences if we charged today:

1. Every paying customer sees every other customer's home and pets — total privacy failure.
2. Anyone can hit the demo endpoints directly and stream/watch without paying.
3. Clips/events have no real room/device linkage, so history and alerts are unscoped.

The authenticated per-room flow already exists on the backend (rooms, devices, pairing
codes, ownership-checked tokens). The frontend just never got wired to it.

### Other gaps that block "love it and tell friends"

- **No pairing/onboarding UI**: backend pairing codes exist (`server/src/routes/pairing.ts`)
  but there is no "add your first camera" flow, no device list, no QR code.
- **Not installable**: no web app manifest; `public/sw.js` references icons
  (`/pwa-192x192.png`) that don't exist. "Old phone as camera" depends on
  add-to-home-screen.
- **Clip sync doesn't survive reload**: queued clips orphan in IndexedDB
  (`src/services/syncService.ts` is never re-initialized on page load).
- **Zero observability**: no error tracking, no analytics, no uptime monitoring. We
  cannot see why a trial user churned or that a camera silently died.
- **Zero tests**: not even a happy-path smoke test for token issuance or webhook handling.
- **No legal pages**: no privacy policy or ToS. We stream video from inside people's
  homes — in the EU this is a hard launch blocker (GDPR), and Stripe live mode
  effectively requires both.
- **Default Vite README**, stale `CLAUDE.md`/`.env.example` — minor, but they slow every
  future contributor and session down.

---

## Phase 1 — Make the paid product real (engineering, ~1 week)

> Exit criteria: a stranger can sign up, start a trial, pair their own phone, and watch
> their own private room. Nobody can watch without paying.

### 1.1 Private rooms wiring (the blocker)

- On first subscription (or first visit to `/viewer`), auto-create the user's default
  room via existing `POST /api/rooms` — zero-decision onboarding; "rooms" stay invisible
  to the user until multi-room is a real request.
- `ViewerPage.tsx`: replace `getDemoViewerToken()` with room fetch + `POST /api/tokens/viewer`.
- `CameraPage.tsx`: replace `getDemoCameraToken()` with the pairing flow below.
- Gate `/api/tokens/demo/*` behind `NODE_ENV !== 'production'` (or an env flag) and add
  basic rate limiting (`express-rate-limit`) to all token/pairing endpoints.

### 1.2 Pairing flow ("add a camera in under 2 minutes")

- Viewer empty state → "Add a camera" → shows QR code (URL embedding a pairing code from
  `POST /api/pairing/generate`) + the short code as text fallback.
- Phone scans QR with its native camera app → lands on `/camera?code=XYZ` → redeems code
  → gets a camera token bound to the room → starts streaming. No sign-in needed on the
  phone (the pairing code carries authorization; it's already single-use + expiring).
- Device shows up in viewer immediately — this moment is the activation event.
- Device list in viewer settings: rename ("Living room"), remove, online/offline status
  (backend `Device` model already supports all of it).

### 1.3 Reliability & hardening

- Re-initialize `syncService` on app load so queued clips upload after reload/crash.
- Add `manifest.webmanifest` + real icons; verify add-to-home-screen on Android Chrome
  and iOS Safari (iOS PWA push requires the installed app — test it explicitly).
- Sentry (frontend + server) — free tier is plenty.
- Confirm Hostinger volume mount for `/app/data` (SQLite) and `uploads/`; nightly SQLite
  backup (a cron with `sqlite3 .backup` to R2 is enough). Switch to R2 for clips in prod.
- Strip/gate debug `console.log`s (`server/src/index.ts:77-80` request logger,
  CameraPage track-state logs) behind an env/DEV flag.
- Smoke tests for the money paths only: token issuance + ownership check, Stripe webhook
  → subscription state, pairing redeem. Vitest + supertest; run in CI before image build.

### 1.4 Trust & legal (launch blockers, not polish)

- Privacy policy + ToS pages (footer links). Plain-language summary up top: video is
  end-to-end through LiveKit, clips stored encrypted at rest, delete account = delete
  everything.
- Account deletion path: Clerk webhook → cascade delete (schema already cascades) +
  R2 object cleanup.
- Stripe live mode checklist: business details, statement descriptor ("PETPORTAL"),
  customer emails on.

---

## Phase 2 — Make them love it (onboarding & polish, ~1 week)

> Exit criteria: time from signup → seeing your own pet live < 5 minutes, unassisted.
> We can watch the funnel and see where people drop.

- **First-run wizard** on `/viewer`: 1) install/open → 2) start trial → 3) scan QR with
  old phone → 4) "You're live". Empty states everywhere a list can be empty.
- **Analytics funnel** (PostHog, free tier): signup → trial start → camera paired →
  first live view → first clip → D1/D7 return. These six events are the whole business.
- **Notification quality**: detection defaults tuned so the first night isn't 40 false
  alarms (sensible cooldowns exist — verify defaults), notification deep-links to the
  event clip, "mark as false alarm" feeds threshold suggestions.
- **Clip sharing** (the viral loop): "Share" on a clip → short-lived public link
  (presigned R2 URL behind a `/c/:id` page with OG tags so it unfurls in WhatsApp/iMessage
  with a poster frame + "Watched live with Pet Portal — free trial"). This is the single
  highest-leverage growth feature and it's ~1 day of work on existing storage code.
- **Homepage**: 30-second real demo video (your own pet), explicit comparison row
  ("Furbo: $210 + subscription. Pet Portal: the phone you already own"), FAQ
  (battery? data usage? is it private?).
- Update `CLAUDE.md`, `README.md`, `.env.example` to reflect reality (cheap, prevents
  every future mistake from starting with stale docs).

---

## Phase 3 — First 10 paying customers (weeks 3-4)

> Exit criteria: ≥10 strangers on paid (post-trial) plans, ≥1 organic referral,
> qualitative "would be very disappointed without it" signal.

**Beachhead niche**: dog owners dealing with **separation anxiety** (and new puppy
owners). They have an urgent, daily, emotional problem; they already film their dogs;
they congregate in identifiable places; trainers tell them to "set up a camera" as
step one of every protocol.

1. **White-glove 10**: recruit from friends-of-friends + local dog owner groups. Onboard
   personally (15-min call or chat). Watch them fumble — every fumble is a backlog item.
   They pay real money (discount code via Stripe's `allow_promotion_codes`, already on).
2. **Communities**: r/Dogtraining, r/SeparationAnxiety, r/puppy101, Finnish/EU dog
   Facebook groups — as a helpful member ("here's how I monitor my dog with an old
   phone"), not as ads. One honest "I built this" post once 10 users are happy.
3. **Trainer channel**: 5-10 separation-anxiety trainers / dog daycares get free accounts
   + a referral code. Trainers prescribing the tool is the highest-trust channel that
   exists in this niche.
4. **Pet content flywheel**: post real detection clips (with permission) as TikTok/Reels/
   Shorts. Pet clips are the most shareable content category on the internet and we
   manufacture them as a side effect of the product working.
5. **Weekly cadence**: ship fixes weekly; email every trial user personally on day 2
   ("did you get your camera paired? reply and I'll help"). At this scale, support *is*
   marketing.

**Pricing at launch**: keep $9.99/mo + 7-day trial. Add annual ($79/yr) once ≥10 paid —
annual prepay is the cheapest churn insurance and a commitment signal worth measuring.

---

## Phase 4 — Make them tell their friends (week 5+)

- **Referral**: "Give a month, get a month" — Stripe coupons + a referral code per user.
  Trigger the ask at the happiest moment: right after a user shares or favorites a clip.
- **Household sharing**: invite partner/family as viewer to your room (room model is
  single-owner today; this is the most-requested feature we should expect, and every
  invited viewer is a warm lead with the app already open).
- **Product Hunt / HN "Show HN"** launch once activation is smooth and one channel shows
  organic pull — launches amplify working products, they don't fix broken funnels.
- **SEO seeds**: "use old phone as pet camera", "dog separation anxiety camera setup",
  "Furbo alternatives" — high-intent, low-competition queries; 5 honest articles.

---

## Metrics that matter (in order)

| Metric | Target | Why |
|--------|--------|-----|
| Activation: signup → own pet live | >60% within 24h | The product moment; everything upstream of love |
| Time-to-live | <5 min median | Setup friction is the #1 churn cause for camera products |
| Trial → paid conversion | >40% | With a 7-day trial and an emotional use case this is achievable |
| D7 viewer opens | >3 sessions | Are they actually checking on the pet? |
| Clips shared / user / month | >1 | The viral loop's pulse |
| Referred signups | >15% of new signups by month 2 | "Tell all their friends" made measurable |

Camera uptime per device (heartbeats exist via `lastSeen`) is the leading indicator of
churn: a camera that's been offline for 3 days is a cancellation in progress — alert us,
then email them.

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| iOS Safari kills backgrounded camera pages | Product framing: dedicated/old phone, plugged in, screen on (wake lock already implemented). Document explicitly; Capacitor wrapper later if needed (plan exists) |
| LiveKit Cloud cost per always-on camera (~8h/day streaming) | Stream only while a viewer is connected or detection is armed (dynacast already on); monitor per-user minutes from day 1; raise price or add usage tiers before it hurts |
| False-positive alert fatigue → churn | Conservative defaults, per-event "false alarm" feedback, cooldowns (already built) |
| Single VPS + SQLite | Fine to ~1000 users; nightly backups now, Postgres migration is a known, boring path later |
| Furbo et al. are entrenched | We don't out-hardware them; we out-cheap and out-speed them. Stay the "no hardware" option |

## Out of scope (explicitly, for focus)

- Native app / Capacitor (planned separately in
  `plans/feat-backend-sync-auth-private-rooms-clip-storage.md`) — PWA first
- ML bark detection (YAMNet) — current detection is good enough to validate demand
- Cloud recording via LiveKit Egress, motion zones, two-way treat tossing — post-PMF
- Multi-room UI — auto-created single room until users ask

## Sequence summary

```
Week 1   Phase 1: private rooms + pairing + hardening + legal   ← revenue blocker
Week 2   Phase 2: onboarding wizard, funnel analytics, clip sharing, homepage
Week 3-4 Phase 3: white-glove 10 paying customers, weekly ship cadence
Week 5+  Phase 4: referral loop, household sharing, public launch
```

The discipline that makes this work: **no new detection/streaming features until 10
strangers pay**. Every engineering hour either removes a reason not to pay or adds a
reason to share.
