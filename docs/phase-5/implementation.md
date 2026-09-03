# Phase 5 Implementation Plan: Robust Global Audio System

## 1. Goal Description

Phase 5 delivers a professional-grade, resilient audio playback architecture for Miguel's Marketplace. It transitions the application from a bare-bones `<audio>` element inside a footer to a **Headless Singleton Audio Engine** with a centralized reactive store powered by React 19's native `useSyncExternalStore`.

### Key Objectives:
1. **Multi-Surface Playback Coordination**: Seamlessly synchronize playback state between:
   - **Catalog Track Cards**: Inline play/pause buttons, loading spinners, and playing indicators on cards.
   - **Sticky Master Player Bar**: Complete transport controls (play/pause, prev/next, loop repeat, volume/mute slider, smooth scrubber progress bar, and timestamps).
   - **Install Modal**: Continued background playback while reviewing license terms.
2. **Eliminate Performance Bottlenecks**: Decouple high-frequency progress updates (`currentTime` at 4–60 Hz) from low-frequency playback state (`status`, `activeTrackId`) to prevent re-rendering the 50+ track catalog grid during playback.
3. **Promise-Safe Transport**: Eliminate browser `AbortError` crashes when users rapidly skip or toggle tracks.
4. **Music Producer Essentials**:
   - **Seamless Loop Mode**: Essential for previewing FL Studio loop kits and drum breaks.
   - **Catalog Queue & Auto-Advance**: Auto-playing the next track when looping is off.
   - **Media Session API**: Lock screen, notification tray, and hardware headphone/keyboard key controls.
   - **Keyboard Shortcuts**: Global Spacebar (Play/Pause), Left/Right Arrows (Seek ±5s), and M (Mute).
   - **Volume Persistence**: Storing volume and mute state in `localStorage`.

---

## 2. Architecture Overview

```
                               ┌───────────────────────────────────┐
                               │        AudioEngine (Singleton)    │
                               │  - Holds single HTMLAudioElement  │
                               │  - Safe play() promise queue      │
                               │  - Queue/Loop logic & MediaSession│
                               └─────────────────┬─────────────────┘
                                                 │
                               ┌─────────────────┴─────────────────┐
                               │        Audio Store Manager        │
                               │  - Subscriptions & Listeners      │
                               └────────┬─────────────────┬────────┘
                                        │                 │
                   Low-Frequency Events │                 │ High-Frequency Events
         (track change, status, volume) │                 │ (timeupdate, duration)
                                        ▼                 ▼
                        ┌───────────────────────┐ ┌───────────────────────┐
                        │   useAudioPlayback    │ │   useAudioProgress    │
                        │ (useTrackPlayback(id))│ │ (only scrubber & time)│
                        └───────────┬───────────┘ └───────────┬───────────┘
                                    │                         │
                     ┌──────────────┴──────────────┐          │
                     ▼                             ▼          ▼
            ┌─────────────────┐           ┌────────────────────────┐
            │   CatalogGrid   │           │       PlayerBar        │
            │  (Track Cards)  │           │   (Master Transport)   │
            └─────────────────┘           └────────────────────────┘
```

---

## 3. Data Models & TypeScript Types

Create or update types in `app/src/lib/audio-types.ts` (or `app/src/lib/audio-engine.ts`):

```typescript
import type { CatalogTrack } from "./catalog";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface AudioPlaybackState {
  currentTrack: CatalogTrack | null;
  status: PlaybackStatus;
  isPlaying: boolean;
  isLooping: boolean;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  streamFailed: boolean;
  hasTrack: boolean;
}

export interface AudioProgressState {
  currentTime: number;
  duration: number;
  progressPercent: number;
}
```

---

## 4. Proposed Changes

### Track 1: Core Headless Audio Engine & Reactive Store

#### [NEW] `app/src/lib/audio-engine.ts`
Implement the singleton audio engine:
- Manages an internal `HTMLAudioElement` instance (lazy initialized in browser, SSR safe).
- Tracks `pendingPlayPromise: Promise<void> | null` to catch and ignore `AbortError` when rapid switches occur.
- Manages playlist catalog for previous/next track navigation.
- Dispatches state changes to subscribers via two channels:
  1. `playbackSubscribers`: Fired only when track, playback status, volume, loop, or mute changes.
  2. `progressSubscribers`: Fired on `timeupdate` and `loadedmetadata` for the progress scrubber.
- Initializes volume and mute preferences from `localStorage` (`miguel_audio_volume`, `miguel_audio_muted`).
- Handles `ended` event:
  - If `isLooping` is true, resets `currentTime = 0` and loops seamlessly.
  - If `isLooping` is false, automatically advances to `nextTrack()`.
- Updates `navigator.mediaSession` metadata and action handlers.

```typescript
// Key methods on AudioEngine:
export class AudioEngine {
  public static getInstance(): AudioEngine;
  
  public setCatalog(tracks: CatalogTrack[]): void;
  public playTrack(track: CatalogTrack): Promise<void>;
  public togglePlay(): Promise<void>;
  public pause(): Promise<void>;
  public resume(): Promise<void>;
  public nextTrack(): Promise<void>;
  public prevTrack(): Promise<void>;
  public seek(seconds: number): void;
  public setVolume(volume: number): void;
  public toggleMute(): void;
  public toggleLoop(): void;
  
  public getPlaybackState(): AudioPlaybackState;
  public getProgressState(): AudioProgressState;
  public subscribePlayback(listener: () => void): () => void;
  public subscribeProgress(listener: () => void): () => void;
}
```

#### [NEW] `app/src/lib/audio-store.ts`
Provide custom React hooks wrapping `useSyncExternalStore`:

```typescript
"use client";

import { useSyncExternalStore } from "react";
import { getAudioEngine } from "./audio-engine";
import type { AudioPlaybackState, AudioProgressState } from "./audio-types";

export function useAudioPlayback(): AudioPlaybackState & {
  playTrack: (track: CatalogTrack) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleLoop: () => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
} {
  const engine = getAudioEngine();
  const state = useSyncExternalStore(
    engine.subscribePlayback,
    engine.getPlaybackState,
    engine.getPlaybackStateServer
  );

  return {
    ...state,
    playTrack: (t) => void engine.playTrack(t),
    togglePlay: () => void engine.togglePlay(),
    pause: () => void engine.pause(),
    resume: () => void engine.resume(),
    nextTrack: () => void engine.nextTrack(),
    prevTrack: () => void engine.prevTrack(),
    toggleLoop: () => engine.toggleLoop(),
    toggleMute: () => engine.toggleMute(),
    setVolume: (v) => engine.setVolume(v),
  };
}

export function useTrackPlayback(trackId: number) {
  const playback = useAudioPlayback();
  const isActive = playback.currentTrack?.id === trackId;
  const isPlaying = isActive && playback.isPlaying;
  const isLoading = isActive && playback.status === "loading";
  const hasError = isActive && playback.streamFailed;

  return {
    isActive,
    isPlaying,
    isLoading,
    hasError,
  };
}

export function useAudioProgress(): AudioProgressState & {
  seek: (seconds: number) => void;
} {
  const engine = getAudioEngine();
  const progress = useSyncExternalStore(
    engine.subscribeProgress,
    engine.getProgressState,
    engine.getProgressStateServer
  );

  return {
    ...progress,
    seek: (seconds) => engine.seek(seconds),
  };
}
```

---

### Track 2: UI Components Integration

#### [MODIFY] `app/src/app/catalog-grid.tsx`
Update track cards in the grid:
1. When hovered or when active (`isActive`), display an interactive play/pause button overlay.
2. If `isLoading`, show a subtle brutalist loading indicator (`...` or rotating glyph).
3. If `isPlaying`, show an animated equalizer bar indicator (`|||`) and high-contrast border.
4. Clicking anywhere on the card toggles playback:
   - If not active: plays that track immediately.
   - If active and playing: pauses.
   - If active and paused: resumes.

```tsx
export function CatalogGrid({
  tracks,
  onPick,
}: {
  tracks: CatalogTrack[];
  onPick: (track: CatalogTrack) => void;
}) {
  // Render grid...
  // Each card uses useTrackPlayback(track.id)
}
```

#### [MODIFY] `app/src/app/player-bar.tsx`
Refactor the sticky player bar:
1. **Remove local `<audio>` element**: Audio is managed centrally in the headless engine.
2. **Master Transport Controls**:
   - **Previous Track (`⏮`)**: Skips to previous track in catalog (or restarts track if > 3 seconds in).
   - **Play/Pause Button (`▶` / `⏸`)**: Prominent brutalist button.
   - **Next Track (`⏭`)**: Skips to next track in catalog.
   - **Loop Button (`[LOOP]`)**: Highlights when active; toggles seamless loop.
3. **Scrubber Progress Bar**:
   - Consumes `useAudioProgress()` to prevent triggering parent component re-renders.
   - Smooth seek bar with elapsed and remaining/total timestamps (`1:24 / 3:45`).
   - Drag/click seeking via range slider or direct track scrubber.
4. **Volume & Mute**:
   - Mute button (`VOL` / `MUTE`).
   - Compact volume slider adjusting gain from 0% to 100%.
5. **Track Info & Install**:
   - Cover art thumbnail, track title, and `INSTALL` action button.
   - If `streamFailed`, display `STREAM_UNAVAILABLE` in red.

#### [MODIFY] `app/src/app/store.tsx`
Streamline `Store.tsx`:
1. Register catalog tracks into `AudioEngine` on mount or when catalog updates: `engine.setCatalog(tracks)`.
2. Attach global keyboard event listeners:
   - `Space`: Prevent page scroll, toggle play/pause (disabled if focused inside an `<input>` or `<textarea>`).
   - `ArrowLeft`: Seek backward 5 seconds.
   - `ArrowRight`: Seek forward 5 seconds.
   - `KeyM`: Toggle mute.
3. Remove redundant reducer and local `audioRef`.

---

## 5. Test Plan & Verification

### Unit Tests
#### [NEW] `app/src/lib/audio-engine.test.ts`
Write comprehensive tests for `AudioEngine`:
1. **Initialization**: Starts with null track, volume at 1.0 (or saved storage), status `idle`.
2. **Track Playback & Switching**:
   - `playTrack(track1)` sets active track and transitions to playing.
   - Switching from `track1` to `track2` resets `currentTime` and updates `currentTrack`.
3. **Promise Safety & Rapid Switching**:
   - Rapidly calling `playTrack` does not throw unhandled `AbortError`.
4. **Catalog Navigation (Next / Prev)**:
   - `nextTrack()` moves to next index; wraps or stops at end of catalog.
   - `prevTrack()` moves to previous track.
5. **Loop Mode vs. Auto-Advance**:
   - When track ends with `isLooping = true`, restarts same track at `0:00`.
   - When track ends with `isLooping = false`, calls `nextTrack()`.
6. **Volume & Mute**:
   - `setVolume(0.5)` updates volume.
   - `toggleMute()` toggles muted state while preserving underlying volume value.
7. **Error State**:
   - Error event triggers `status = 'error'` and `streamFailed = true`.

### Existing Tests Compatibility
Ensure existing tests in `app/src/lib/player-state.test.ts` pass or update them to test the new audio engine/state contracts.

### Manual Verification Checklist
1. **Catalog Click**: Click any track card. Verify:
   - Audio begins playing immediately.
   - Card displays playing state ("ON" + animated equalizer / pause icon).
   - Master bar slides up / renders at bottom with track cover, title, and playing state.
2. **Card Toggle**: Click the active playing card again. Verify audio pauses and icon changes to play. Click again to resume.
3. **Different Card**: Click a different track card. Verify current audio stops cleanly without console errors (`AbortError`) and new track plays from `0:00`.
4. **Master Bar Transport**:
   - Test Play / Pause.
   - Test Next Track (`⏭`) and Previous Track (`⏮`).
   - Test Scrubber: Click and drag to seek through the track. Confirm smooth playback position jump.
   - Test Volume: Drag volume slider; click Mute button; refresh page and confirm volume preference persists.
   - Test Loop: Turn on `[LOOP]`; let track reach end; confirm it repeats seamlessly. Turn off `[LOOP]`; confirm next track plays automatically.
5. **Keyboard Hotkeys**:
   - Press `Space`: toggles play/pause.
   - Press `ArrowLeft` / `ArrowRight`: seeks -5s / +5s.
   - Press `M`: toggles mute.
   - Open Install Modal, type in an input field (email, name), press `Space`: verify it types a space character and does NOT trigger play/pause.
6. **Mobile / Media Session**:
   - Verify lock screen / notification media widget shows track title, artist, and playback controls.
