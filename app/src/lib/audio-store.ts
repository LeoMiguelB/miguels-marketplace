"use client";

import { useSyncExternalStore } from "react";
import { getAudioEngine } from "./audio-engine";
import type { CatalogTrack } from "./catalog";
import type { AudioPlaybackState, AudioProgressState } from "./audio-types";

export interface AudioPlaybackActions {
  playTrack: (track: CatalogTrack) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleLoop: () => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  seek: (seconds: number) => void;
}

export type UseAudioPlaybackResult = AudioPlaybackState & AudioPlaybackActions;

export function useAudioPlayback(): UseAudioPlaybackResult {
  const engine = getAudioEngine();
  const state = useSyncExternalStore(
    engine.subscribePlayback,
    engine.getPlaybackSnapshot,
    engine.getServerPlaybackSnapshot,
  );

  return {
    ...state,
    playTrack: (track: CatalogTrack) => void engine.playTrack(track),
    togglePlay: () => void engine.togglePlay(),
    pause: () => void engine.pause(),
    resume: () => void engine.resume(),
    nextTrack: () => void engine.nextTrack(),
    prevTrack: () => void engine.prevTrack(),
    toggleLoop: () => engine.toggleLoop(),
    toggleMute: () => engine.toggleMute(),
    setVolume: (v: number) => engine.setVolume(v),
    seek: (s: number) => engine.seek(s),
  };
}

export function useTrackPlayback(track: CatalogTrack) {
  const playback = useAudioPlayback();
  const isActive = playback.currentTrack?.id === track.id;
  const isPlaying = isActive && playback.isPlaying;
  const isLoading = isActive && playback.status === "loading";
  const hasError = isActive && playback.streamFailed;

  const toggle = () => {
    if (isActive) {
      if (isPlaying) {
        playback.pause();
      } else {
        playback.resume();
      }
    } else {
      playback.playTrack(track);
    }
  };

  return {
    isActive,
    isPlaying,
    isLoading,
    hasError,
    toggle,
  };
}

export interface UseAudioProgressResult extends AudioProgressState {
  seek: (seconds: number) => void;
}

export function useAudioProgress(): UseAudioProgressResult {
  const engine = getAudioEngine();
  const progress = useSyncExternalStore(
    engine.subscribeProgress,
    engine.getProgressSnapshot,
    engine.getServerProgressSnapshot,
  );

  return {
    ...progress,
    seek: (seconds: number) => engine.seek(seconds),
  };
}
