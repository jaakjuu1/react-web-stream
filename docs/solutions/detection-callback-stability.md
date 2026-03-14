---
title: Detection Services Restart Loop Due to Unstable Callbacks
date: 2025-12-26
tags: [react, hooks, useCallback, useRef, detection, clips]
files:
  - src/components/CameraPage.tsx
  - src/hooks/useDetection.ts
---

# Detection Services Restart Loop Due to Unstable Callbacks

## Problem

Motion and sound detection stopped working after integrating clip sync functionality. The detection status bars in the camera page showed no activity, and logs revealed a continuous loop:

```
ClipRecorder Started buffering
ClipRecorder Stopped buffering
ClipRecorder Started buffering
ClipRecorder Stopped buffering
...
```

The detection services (MotionDetector, SoundDetector, ClipRecorder, EventManager) were being created, destroyed, and recreated in a rapid loop, preventing any actual detection from occurring.

## Root Cause

The `handleClipCaptured` callback in `CameraPage.tsx` had an unstable dependency on `clipSync`:

```typescript
// Broken code
const handleClipCaptured = useCallback(
  (clip) => {
    if (clipSync.isInitialized) {
      clipSync.queueClip(clip);
    }
  },
  [clipSync]  // Problem: clipSync includes stats that change frequently
);
```

The `clipSync` object returned from `useClipSync` hook includes a `stats` property that updates whenever sync statistics change. This caused a cascade of re-renders:

1. `clipSync.stats` changes (e.g., queue count updates)
2. `handleClipCaptured` is recreated due to `[clipSync]` dependency
3. `onClipCaptured` prop passed to `useDetection` changes
4. `handleEvent` callback in `useDetection` is recreated
5. The useEffect that initializes detection services runs its cleanup
6. Cleanup stops buffering and destroys services
7. New services are created and start buffering
8. Loop repeats

## Solution

Use refs to keep callbacks stable across renders.

### CameraPage.tsx

```typescript
// Store clipSync in a ref, update it on every render
const clipSyncRef = useRef(clipSync);
clipSyncRef.current = clipSync;

// Callback has no dependencies, uses ref for current value
const handleClipCaptured = useCallback(
  (clip: CapturedClip) => {
    if (clipSyncRef.current.isInitialized) {
      clipSyncRef.current.queueClip(clip);
    }
  },
  []  // Stable - empty dependency array
);
```

### useDetection.ts

```typescript
// Store callback in ref
const onClipCapturedRef = useRef(onClipCaptured);
onClipCapturedRef.current = onClipCaptured;

// In handleEvent, use ref instead of direct callback
const handleEvent = useCallback((event: DetectionEvent) => {
  // ... clip capture logic ...
  if (clip && clip.videoBlob && onClipCapturedRef.current) {
    onClipCapturedRef.current({
      eventId: event.id,
      videoBlob: clip.videoBlob,
      // ...
    });
  }
}, [room]);  // Removed onClipCaptured from dependencies

// useEffect no longer depends on onClipCaptured
useEffect(() => {
  // Initialize services...
}, [room, videoElement]);  // Removed onClipCaptured
```

## Prevention Guidelines

1. **Avoid object dependencies in useCallback**: When a hook returns an object containing both functions and state (like `{ queueClip, stats }`), don't use the entire object as a dependency. Extract only what you need or use refs.

2. **Use refs for callbacks passed through multiple layers**: When callbacks are passed through multiple hook layers, use refs to break the dependency chain.

3. **Watch for "object return" patterns**: Hooks that return objects like `const result = useSomething()` where `result` includes changing values are dangerous to use directly in dependency arrays.

4. **Pattern for stable callbacks with changing dependencies**:
   ```typescript
   const valueRef = useRef(value);
   valueRef.current = value;

   const stableCallback = useCallback(() => {
     // Use valueRef.current instead of value
     doSomething(valueRef.current);
   }, []);  // Empty deps = stable reference
   ```

## Related

- [React useCallback documentation](https://react.dev/reference/react/useCallback)
- [React useRef documentation](https://react.dev/reference/react/useRef)
- [When to use refs vs state](https://react.dev/learn/referencing-values-with-refs)
