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

export const initialPlaybackState: AudioPlaybackState = {
  currentTrack: null,
  status: "idle",
  isPlaying: false,
  isLooping: false,
  volume: 1.0,
  isMuted: false,
  streamFailed: false,
  hasTrack: false,
};

export const initialProgressState: AudioProgressState = {
  currentTime: 0,
  duration: 0,
  progressPercent: 0,
};
