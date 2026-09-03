import type { CatalogTrack } from "./catalog";
import {
  type AudioPlaybackState,
  type AudioProgressState,
  initialPlaybackState,
  initialProgressState,
} from "./audio-types";

export interface AudioElementLike {
  src: string;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(event: string, listener: (e: Event) => void): void;
  removeEventListener(event: string, listener: (e: Event) => void): void;
}

export class MockAudioElement implements AudioElementLike {
  public src = "";
  public currentTime = 0;
  public duration = 0;
  public volume = 1;
  public muted = false;
  public loop = false;
  public paused = true;

  private listeners = new Map<string, Set<(e: Event) => void>>();

  public addEventListener(event: string, listener: (e: Event) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  public removeEventListener(event: string, listener: (e: Event) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  public emit(event: string, e: Event = new Event(event)): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(e);
      }
    }
  }

  public async play(): Promise<void> {
    this.paused = false;
    this.emit("playing");
  }

  public pause(): void {
    this.paused = true;
    this.emit("pause");
  }
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  public readonly audio: AudioElementLike;
  private catalog: CatalogTrack[] = [];
  private pendingPlayPromise: Promise<void> | null = null;

  private playbackState: AudioPlaybackState = { ...initialPlaybackState };
  private progressState: AudioProgressState = { ...initialProgressState };

  private playbackListeners = new Set<() => void>();
  private progressListeners = new Set<() => void>();

  public constructor(customAudio?: AudioElementLike) {
    if (customAudio) {
      this.audio = customAudio;
    } else if (typeof window !== "undefined" && typeof Audio !== "undefined") {
      this.audio = new Audio();
    } else {
      this.audio = new MockAudioElement();
    }

    this.initStoragePreferences();
    this.setupEventListeners();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public static setInstanceForTesting(engine: AudioEngine | null): void {
    AudioEngine.instance = engine;
  }

  private initStoragePreferences(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const savedVolume = localStorage.getItem("miguel_audio_volume");
        if (savedVolume !== null) {
          const v = parseFloat(savedVolume);
          if (!isNaN(v) && v >= 0 && v <= 1) {
            this.audio.volume = v;
            this.playbackState.volume = v;
          }
        }
        const savedMuted = localStorage.getItem("miguel_audio_muted");
        if (savedMuted !== null) {
          const m = savedMuted === "true";
          this.audio.muted = m;
          this.playbackState.isMuted = m;
        }
      } catch {
        // LocalStorage access might be blocked in strict sandboxes
      }
    }
  }

  private setupEventListeners(): void {
    this.audio.addEventListener("playing", () => {
      this.playbackState = {
        ...this.playbackState,
        status: "playing",
        isPlaying: true,
        streamFailed: false,
      };
      this.notifyPlayback();
      this.syncMediaSession();
    });

    this.audio.addEventListener("pause", () => {
      if (this.playbackState.status !== "error") {
        this.playbackState = {
          ...this.playbackState,
          status: "paused",
          isPlaying: false,
        };
        this.notifyPlayback();
        this.syncMediaSession();
      }
    });

    this.audio.addEventListener("waiting", () => {
      this.playbackState = {
        ...this.playbackState,
        status: "loading",
      };
      this.notifyPlayback();
    });

    this.audio.addEventListener("timeupdate", () => {
      const currentTime = this.audio.currentTime || 0;
      const duration = this.audio.duration || this.progressState.duration || 0;
      this.progressState = {
        currentTime,
        duration,
        progressPercent: duration > 0 ? (currentTime / duration) * 100 : 0,
      };
      this.notifyProgress();
    });

    this.audio.addEventListener("loadedmetadata", () => {
      const duration = this.audio.duration || 0;
      const currentTime = this.audio.currentTime || 0;
      this.progressState = {
        currentTime,
        duration,
        progressPercent: duration > 0 ? (currentTime / duration) * 100 : 0,
      };
      this.notifyProgress();
    });

    this.audio.addEventListener("durationchange", () => {
      const duration = this.audio.duration || 0;
      const currentTime = this.audio.currentTime || 0;
      this.progressState = {
        currentTime,
        duration,
        progressPercent: duration > 0 ? (currentTime / duration) * 100 : 0,
      };
      this.notifyProgress();
    });

    this.audio.addEventListener("ended", () => {
      void this.handleTrackEnded();
    });

    this.audio.addEventListener("error", () => {
      this.playbackState = {
        ...this.playbackState,
        status: "error",
        isPlaying: false,
        streamFailed: true,
      };
      this.notifyPlayback();
      this.syncMediaSession();
    });
  }

  public setCatalog(tracks: CatalogTrack[]): void {
    this.catalog = tracks;
  }

  public getCatalog(): CatalogTrack[] {
    return this.catalog;
  }

  public async handleTrackEnded(): Promise<void> {
    if (this.playbackState.isLooping) {
      this.seek(0);
      await this.resume();
      return;
    }

    if (this.catalog.length === 0 || !this.playbackState.currentTrack) {
      await this.pause();
      this.seek(0);
      return;
    }

    const idx = this.catalog.findIndex((t) => t.id === this.playbackState.currentTrack?.id);
    if (idx !== -1 && idx + 1 < this.catalog.length) {
      await this.playTrack(this.catalog[idx + 1]);
    } else {
      // Reached the end of the catalog and loop is disabled: stop playback
      await this.pause();
      this.seek(0);
    }
  }

  public async playTrack(track: CatalogTrack): Promise<void> {
    const isSameTrack = this.playbackState.currentTrack?.id === track.id;
    if (isSameTrack) {
      if (this.playbackState.isPlaying) {
        return;
      }
      return this.resume();
    }

    this.playbackState = {
      ...this.playbackState,
      currentTrack: track,
      hasTrack: true,
      status: "loading",
      streamFailed: false,
      isPlaying: true,
    };
    this.notifyPlayback();

    this.progressState = {
      currentTime: 0,
      duration: 0,
      progressPercent: 0,
    };
    this.notifyProgress();

    this.audio.src = track.stream_blob_url;
    this.audio.currentTime = 0;
    this.audio.loop = this.playbackState.isLooping;

    await this.safePlay();
    this.syncMediaSession();
  }

  public async togglePlay(): Promise<void> {
    if (!this.playbackState.currentTrack) {
      if (this.catalog.length > 0) {
        return this.playTrack(this.catalog[0]);
      }
      return;
    }
    if (this.playbackState.isPlaying) {
      return this.pause();
    } else {
      return this.resume();
    }
  }

  public async pause(): Promise<void> {
    if (this.pendingPlayPromise) {
      try {
        await this.pendingPlayPromise;
      } catch {
        // Ignore interrupted play promise
      }
    }
    this.audio.pause();
    this.playbackState = {
      ...this.playbackState,
      status: "paused",
      isPlaying: false,
    };
    this.notifyPlayback();
    this.syncMediaSession();
  }

  public async resume(): Promise<void> {
    if (!this.playbackState.currentTrack || this.playbackState.streamFailed) {
      return;
    }
    this.playbackState = {
      ...this.playbackState,
      status: "playing",
      isPlaying: true,
    };
    this.notifyPlayback();
    await this.safePlay();
    this.syncMediaSession();
  }

  public async nextTrack(): Promise<void> {
    if (this.catalog.length === 0) return;
    if (!this.playbackState.currentTrack) {
      return this.playTrack(this.catalog[0]);
    }
    const idx = this.catalog.findIndex((t) => t.id === this.playbackState.currentTrack?.id);
    if (idx === -1) {
      return this.playTrack(this.catalog[0]);
    }
    const nextIdx = (idx + 1) % this.catalog.length;
    return this.playTrack(this.catalog[nextIdx]);
  }

  public async prevTrack(): Promise<void> {
    if (this.catalog.length === 0) return;
    if (!this.playbackState.currentTrack) {
      return this.playTrack(this.catalog[0]);
    }
    // If playing for more than 3 seconds, restart from beginning
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    const idx = this.catalog.findIndex((t) => t.id === this.playbackState.currentTrack?.id);
    if (idx === -1) {
      return this.playTrack(this.catalog[0]);
    }
    const prevIdx = (idx - 1 + this.catalog.length) % this.catalog.length;
    return this.playTrack(this.catalog[prevIdx]);
  }

  public seek(seconds: number): void {
    const duration = this.audio.duration || this.progressState.duration || 0;
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : Math.max(0, seconds));
    this.audio.currentTime = target;
    this.progressState = {
      ...this.progressState,
      currentTime: target,
      progressPercent: duration > 0 ? (target / duration) * 100 : 0,
    };
    this.notifyProgress();
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.audio.volume = clamped;
    if (this.audio.muted && clamped > 0) {
      this.audio.muted = false;
    }
    this.playbackState = {
      ...this.playbackState,
      volume: clamped,
      isMuted: this.audio.muted,
    };
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem("miguel_audio_volume", clamped.toString());
        localStorage.setItem("miguel_audio_muted", this.audio.muted ? "true" : "false");
      } catch {
        // ignore
      }
    }
    this.notifyPlayback();
  }

  public toggleMute(): void {
    const newMuted = !this.playbackState.isMuted;
    this.audio.muted = newMuted;
    this.playbackState = {
      ...this.playbackState,
      isMuted: newMuted,
    };
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem("miguel_audio_muted", newMuted ? "true" : "false");
      } catch {
        // ignore
      }
    }
    this.notifyPlayback();
  }

  public toggleLoop(): void {
    const newLoop = !this.playbackState.isLooping;
    this.audio.loop = newLoop;
    this.playbackState = {
      ...this.playbackState,
      isLooping: newLoop,
    };
    this.notifyPlayback();
  }

  private async safePlay(): Promise<void> {
    try {
      const promise = this.audio.play();
      this.pendingPlayPromise = promise;
      await promise;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      this.playbackState = {
        ...this.playbackState,
        status: "error",
        isPlaying: false,
        streamFailed: true,
      };
      this.notifyPlayback();
    } finally {
      this.pendingPlayPromise = null;
    }
  }

  private syncMediaSession(): void {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !navigator.mediaSession
    ) {
      return;
    }
    const track = this.playbackState.currentTrack;
    if (!track) {
      navigator.mediaSession.playbackState = "none";
      return;
    }

    try {
      if (typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: "Miguel B",
          album: "miguelbbeats.store",
          artwork: track.cover_blob_url
            ? [{ src: track.cover_blob_url, sizes: "512x512", type: "image/jpeg" }]
            : [],
        });
      }
      navigator.mediaSession.playbackState = this.playbackState.isPlaying ? "playing" : "paused";

      navigator.mediaSession.setActionHandler("play", () => void this.resume());
      navigator.mediaSession.setActionHandler("pause", () => void this.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => void this.prevTrack());
      navigator.mediaSession.setActionHandler("nexttrack", () => void this.nextTrack());
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      });
    } catch {
      // mediaSession operations may throw in unsupported browser contexts
    }
  }

  // React useSyncExternalStore integrations
  public getPlaybackSnapshot = (): AudioPlaybackState => {
    return this.playbackState;
  };

  public getServerPlaybackSnapshot = (): AudioPlaybackState => {
    return initialPlaybackState;
  };

  public getProgressSnapshot = (): AudioProgressState => {
    return this.progressState;
  };

  public getServerProgressSnapshot = (): AudioProgressState => {
    return initialProgressState;
  };

  public subscribePlayback = (listener: () => void): (() => void) => {
    this.playbackListeners.add(listener);
    return () => {
      this.playbackListeners.delete(listener);
    };
  };

  public subscribeProgress = (listener: () => void): (() => void) => {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  };

  private notifyPlayback(): void {
    for (const listener of this.playbackListeners) {
      listener();
    }
  }

  private notifyProgress(): void {
    for (const listener of this.progressListeners) {
      listener();
    }
  }
}

export function getAudioEngine(): AudioEngine {
  return AudioEngine.getInstance();
}
