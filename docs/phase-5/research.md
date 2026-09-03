# Phase 5 Research: Global Audio Player Architecture & Multi-Player State Management

## 1. Executive Summary

In Miguel's Marketplace, the audio playback system is the core interaction point for discovering, previewing, and purchasing loop kits and beat tracks. Currently, the application has a bare-bones implementation: an `<audio>` tag lazily mounted inside a sticky footer (`PlayerBar`), controlled via a simple `useReducer` inside `Store.tsx`.

Moving to a professional music marketplace (comparable to Splice, BeatStars, Tracklib, or Wavs) requires managing audio state across **multiple concurrent UI surfaces**:
1. **Catalog Track Cards** in the grid: Each card requires its own inline play/pause trigger, loading indicator, and active playback status.
2. **Sticky Master Player Bar**: A persistent footer offering full transport controls (play/pause, prev/next, loop repeat, volume/mute slider, scrubber progress bar, and timestamp displays).
3. **Modal & Detail Previews**: Stem previews or track previews inside the download/install modal without tearing down background playback.
4. **Hardware & System Controls**: Spacebar play/pause, keyboard arrow seeking, and the native OS **Media Session API** (lock screen, notification tray, and headphone buttons).

Managing this across React 19 and Next.js App Router introduces severe technical pitfalls if approached naively: multiple `<audio>` tag collisions, iOS Safari autoplay blocking, Promise rejection crashes (`AbortError`), and devastating UI re-render thrashing caused by high-frequency time updates (4–60 Hz).

This document evaluates the problem space, surveys existing industry solutions and open-source libraries, analyzes core complexities, and establishes the architectural decision for Phase 5.

---

## 2. The Problem Space: Why "Multiple Audio Players" Is Hard

### 2.1 The Multi-Audio-Element Anti-Pattern
A frequent mistake in web development is creating an `<audio>` tag inside every track component:
```tsx
// ❌ ANTI-PATTERN: Rendering an audio element per card
function TrackCard({ track }) {
  return (
    <div>
      <button>Play</button>
      <audio src={track.stream_blob_url} />
    </div>
  );
}
```
Rendering multiple `<audio>` DOM elements causes severe issues:
* **Audio Overlapping**: Without complex global coordination, starting one track doesn't reliably stop another, resulting in two or more audio streams playing simultaneously.
* **Resource Exhaustion**: Browsers limit active media decoding pipelines (especially on mobile devices). Holding dozens of `<audio>` DOM nodes degrades performance and drains battery.
* **Mobile Autoplay Restrictions**: Mobile Safari and Chrome require audio playback to be initiated directly by a user gesture on an initialized media element. Dynamically mounting new `<audio>` elements inside React render cycles frequently trips autoplay security gates.
* **Memory Leaks**: Detached DOM nodes with active media buffers fail to garbage-collect properly, causing memory bloat during long browsing sessions.

### 2.2 The React Re-render Bottleneck (High-Frequency vs. Low-Frequency State)
Audio playback generates two very different types of state updates:
1. **Low-Frequency State**:
   * Current track ID (`number | null`)
   * Playback status (`idle` | `loading` | `playing` | `paused` | `error`)
   * Duration (`number`)
   * Loop mode (`boolean`)
   * Volume & Mute (`0..1`, `boolean`)
   * *Frequency*: Changes only on user interactions or discrete track transitions (rare).
2. **High-Frequency State**:
   * Current playback time (`currentTime`)
   * Progress percentage (`0..100%`)
   * Buffered ranges
   * *Frequency*: Fires 4 times per second via HTML5 `timeupdate` events, or up to 60 times per second with `requestAnimationFrame` for buttery-smooth scrubbers.

> [!CAUTION]
> If `currentTime` is placed in a top-level React state or standard React Context Provider, **every single track card in the catalog grid will re-render 4 to 60 times every second** while music is playing. On a catalog with 50+ tracks, this causes severe CPU spikes, dropped frames, and input lag.

### 2.3 The HTML5 Audio `play()` Promise Interruption Bug
Since modern browsers adopted Promise-returning `play()` methods, rapid user interaction triggers a well-known race condition:
```
Uncaught (in promise) DOMException: The play() request was interrupted by a new load request.
Uncaught (in promise) DOMException: The play() request was interrupted by a call to pause().
```
When a user rapidly clicks between tracks or taps play/pause quickly:
1. Track A calls `audio.play()` (returns a pending Promise).
2. Before the Promise resolves, user clicks Track B or pause.
3. Code immediately sets `audio.src = trackB.url` or calls `audio.pause()`.
4. The browser aborts the pending Promise from Track A, throwing an unhandled `AbortError`.

A robust player system **must** manage pending play promises and catch/discard `AbortError` instances gracefully.

---

## 3. Survey of Existing Solutions & Libraries

We investigated the leading open-source libraries and architectural patterns used across modern web applications.

| Library / Pattern | Primary Focus | Pros | Cons | Verdict for Miguel's Marketplace |
| :--- | :--- | :--- | :--- | :--- |
| **Howler.js (`howler`)** | Game audio & cross-browser audio playback | Battle-tested; handles HTML5 audio vs Web Audio fallback; spatial audio. | ~10KB gzipped; legacy codebase; struggles with Next.js SSR / hydration; overkill for single-stream music playback. | ⚠️ **Not Recommended**: Too heavy and outdated for a Next.js 16 / React 19 app. |
| **`react-use-audio-player`** | React hooks for Howler.js | Clean hook API (`useAudioPlayer`, `useAudioPosition`). | Inherits Howler's baggage; scoped to component by default (requires custom Context wrapper); position polling triggers unnecessary re-renders. | ❌ **Rejected**: Unnecessary wrapper over an already heavy library. |
| **WaveSurfer.js (`wavesurfer.js`)** | Audio waveform visualization | Industry standard for waveforms; interactive scrubbing; zoom. | Heavy memory and CPU consumption if rendered per card in a catalog; client-side audio decoding blocks UI unless peaks are precomputed on the server. | ℹ️ **Optional Visual Add-on**: Excellent for visual waveforms, but should NOT be used as the core audio state orchestrator. |
| **`react-h5-audio-player`** | Off-the-shelf UI player | Drop-in ready; customizable CSS. | Monolithic UI component; poor support for multi-surface headless playback (cannot easily connect a grid card play button to the player). | ❌ **Rejected**: Inflexible styling, conflicts with our dark brutalist design system. |
| **Zustand Store + Singleton Audio Engine** | Headless reactive state | Minimal boilerplate (~1.2KB); fine-grained selector subscriptions eliminate re-renders; headless. | Adds 1 external dependency (`zustand`). | ✅ **Viable Alternative**: Very clean, but can also be achieved natively in React 19 without any external dependencies. |
| **Native Singleton Engine + `useSyncExternalStore` (Vanilla TS + React 19)** | Custom Headless Audio Engine | **Zero external dependencies**; 100% type-safe; uses React 19 official external store subscription API; zero unnecessary re-renders; ultimate control. | Requires writing ~150 lines of custom store/engine code (well within our capabilities). | 🏆 **Top Recommendation**: Best fit for this codebase. |

---

## 4. Deep-Dive: Key Architectural Complexities & Solutions

### 4.1 Architecture: The Headless Singleton Audio Engine
To guarantee that **only one track can ever play at a time** and ensure full cross-platform reliability, the system must use a **Singleton Headless Audio Engine**.

```
                           ┌───────────────────────────────┐
                           │    Headless Audio Engine      │
                           │  (Single HTMLAudioElement)    │
                           └───────────────┬───────────────┘
                                           │ Emits events
                                           ▼
                           ┌───────────────────────────────┐
                           │   Reactive Audio Store        │
                           │  (useSyncExternalStore)       │
                           └───────────────┬───────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│  CatalogGrid     │             │  PlayerBar       │             │  MediaSession /  │
│  (Track Cards)   │             │  (Master Bar)    │             │  Keyboard Hotkeys│
│                  │             │                  │             │                  │
│ Subscribes to:   │             │ Subscribes to:   │             │ Subscribes to:   │
│ - activeTrackId  │             │ - activeTrack    │             │ - activeTrack    │
│ - isPlaying      │             │ - isPlaying      │             │ - isPlaying      │
│ - status         │             │ - volume/loop    │             │                  │
│                  │             │ - high-freq time │             │                  │
└──────────────────┘             └──────────────────┘             └──────────────────┘
```

#### Key Rules of the Engine:
1. **Single Media Source**: Exactly one `HTMLAudioElement` instance exists in memory for the entire app.
2. **Headless Separation**: The audio element is decoupled from React's component tree. Unmounting a component or navigating routes never destroys or restarts the audio.
3. **Promise Serialization**: All calls to `.play()` track the active `playPromise`. When switching tracks or pausing, the engine ensures existing promises resolve or catch `AbortError` before the next action executes.

### 4.2 Eliminating React Re-render Bottlenecks
To allow the sticky master bar to display live progress (timestamps, scrubber fill) without re-rendering the 50+ track cards in `CatalogGrid`:
* We decouple the store into two subscription tiers:
  1. `useAudioPlayback()`: Returns `{ activeTrack, status, isPlaying, isLooping, volume, isMuted }`.
     * Consumed by: Track cards, play/pause buttons, loop buttons.
     * Re-renders: Only when track changes or play/pause/buffer state transitions.
  2. `useAudioProgress()`: Returns `{ currentTime, duration, progressPercent }`.
     * Consumed **strictly** by the scrubber progress bar and timestamp labels in `PlayerBar`.
     * Does **not** cause `CatalogGrid` or track cards to re-render.
  3. `useTrackIsPlaying(trackId)`: Fine-grained selector that returns `{ isActive: boolean, isPlaying: boolean, isLoading: boolean }`. Track card #5 will never re-render when Track #1 starts or stops.

### 4.3 Handling the `play()` Promise & Race Conditions
The audio engine wraps native playback in safe async execution:

```typescript
class AudioEngine {
  private audio: HTMLAudioElement;
  private pendingPlayPromise: Promise<void> | null = null;

  async playTrack(track: CatalogTrack) {
    // If switching track, update src
    if (this.currentTrack?.id !== track.id) {
      this.currentTrack = track;
      this.audio.src = track.stream_blob_url;
      this.audio.currentTime = 0;
    }

    try {
      this.pendingPlayPromise = this.audio.play();
      await this.pendingPlayPromise;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // Ignored: expected when switching tracks rapidly or calling pause
        return;
      }
      this.notifyError();
    } finally {
      this.pendingPlayPromise = null;
    }
  }

  async pause() {
    if (this.pendingPlayPromise) {
      try {
        await this.pendingPlayPromise;
      } catch {
        // Suppress aborts
      }
    }
    this.audio.pause();
  }
}
```

### 4.4 Autoplay Policies & iOS Mobile Unlock
On iOS Safari, media playback requires user interaction. Because our audio engine holds a persistent `HTMLAudioElement`, the very first card tap unlocks the media element. Subsequent tracks can be swapped seamlessly by simply changing `audio.src` and calling `.play()` on the already-unlocked element.

### 4.5 Beat Marketplace Essentials: Seamless Looping & Next/Prev
Because Miguel's Marketplace specializes in music production assets (loop kits, melody loops, drum loops), looping is not just a nice-to-have—it is an essential producer workflow.
* **Loop Toggle**: When enabled, the current beat repeats indefinitely (`audio.loop = true`), allowing producers to audition how the loop grooves.
* **Auto-advance (Playlist Queue)**: When looping is disabled, when a track finishes (`ended` event), the player automatically advances to the next track in the catalog, providing a continuous listening experience.
* **Next / Previous Navigation**: The master bar provides fast skip buttons to audition through the catalog without scrolling.

### 4.6 Media Session API Integration
The `navigator.mediaSession` standard connects browser audio to the operating system's native media controls:
* **Metadata**: Displays track title, artist ("Miguel B"), album ("miguelbbeats.store"), and cover artwork on the macOS lock screen, Windows notification panel, Android/iOS lock screen, and Apple Watch / Bluetooth controls.
* **Action Handlers**: Binds `play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward`, `seekforward`.
* **Hardware Media Keys**: Users can hit the play/pause key on their keyboard or Bluetooth headphones to control the stream.

### 4.7 Volume & Mute with Local Persistence
* Store volume (`0..1`) and muted state in `localStorage` under `miguel_audio_volume` and `miguel_audio_muted`.
* When returning to the site, restore user preference automatically.

---

## 5. Decision Matrix & Selected Strategy

### Decision: Custom Singleton Audio Engine with React 19 `useSyncExternalStore`
We will implement a custom, zero-dependency Headless Audio Engine and Store:

1. **Zero External Bloat**: No need to add Howler, Zustand, or bulky UI packages. React 19's native `useSyncExternalStore` provides tear-free, fine-grained state subscriptions out of the box.
2. **Absolute Reliability**: Complete control over `HTMLAudioElement` event handlers (`play`, `pause`, `waiting`, `canplay`, `timeupdate`, `ended`, `error`).
3. **Surgical Re-renders**: Track cards only re-render when their individual active status changes. The progress bar updates independently.
4. **Brutalist Aesthetic Alignment**: Keeps the application's clean, minimalist, high-contrast monospace design intact without wrestling third-party CSS.

This architecture forms the foundation for the Phase 5 implementation plan in `docs/phase-5/implementation.md`.
