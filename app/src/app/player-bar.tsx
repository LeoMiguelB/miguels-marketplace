"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import type { CatalogTrack } from "@/lib/catalog";
import { getTrackColor } from "@/lib/colors";
import { getAudioEngine } from "@/lib/audio-engine";
import { useAudioPlayback, useAudioProgress } from "@/lib/audio-store";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Scrubber({
  streamFailed,
  isLoading,
  isPlaying,
  trackId,
}: {
  streamFailed: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  trackId: number;
}) {
  const { duration, seek } = useAudioProgress();
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);

  // Reset progress bar on track change
  useEffect(() => {
    if (fillRef.current) fillRef.current.style.width = "0%";
    if (timeRef.current) timeRef.current.textContent = "0:00";
    if (inputRef.current) inputRef.current.value = "0";
  }, [trackId]);

  // High-performance 60 FPS requestAnimationFrame loop for ultra-smooth progress
  useEffect(() => {
    let rafId: number;
    const engine = getAudioEngine();

    const updateFrame = () => {
      if (!isDraggingRef.current) {
        const audio = engine.audio;
        const cur = audio.currentTime || 0;
        const dur = audio.duration || duration || 0;

        if (fillRef.current && dur > 0) {
          const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
          fillRef.current.style.width = `${pct}%`;
        }

        if (inputRef.current && dur > 0) {
          inputRef.current.value = String(cur);
        }

        if (timeRef.current && !streamFailed && !isLoading) {
          timeRef.current.textContent = formatTime(cur);
        }
      }

      if (isPlaying) {
        rafId = requestAnimationFrame(updateFrame);
      }
    };

    if (isPlaying) {
      rafId = requestAnimationFrame(updateFrame);
    } else {
      // Sync frame once when paused
      updateFrame();
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, duration, streamFailed, isLoading]);

  const handleStartDrag = () => {
    isDraggingRef.current = true;
  };

  const handleEndDrag = () => {
    isDraggingRef.current = false;
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const dur = duration || 100;
    if (fillRef.current && dur > 0) {
      const pct = Math.min(100, Math.max(0, (time / dur) * 100));
      fillRef.current.style.width = `${pct}%`;
    }
    if (timeRef.current) {
      timeRef.current.textContent = formatTime(time);
    }
    seek(time);
  };

  return (
    <div className="flex w-full flex-col gap-1 select-none">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <div>
          {streamFailed ? (
            <span className="text-red-500 font-bold">STREAM_UNAVAILABLE</span>
          ) : isLoading ? (
            <span className="text-on animate-pulse">BUFFERING...</span>
          ) : (
            <span ref={timeRef} className="text-on">
              {formatTime(0)}
            </span>
          )}
        </div>
        <div className="text-on">{formatTime(duration)}</div>
      </div>

      <div className="group relative flex h-4 w-full items-center cursor-pointer">
        <input
          ref={inputRef}
          type="range"
          min={0}
          max={duration || 100}
          step={0.05}
          defaultValue={0}
          onMouseDown={handleStartDrag}
          onTouchStart={handleStartDrag}
          onMouseUp={handleEndDrag}
          onTouchEnd={handleEndDrag}
          onChange={handleSeek}
          disabled={streamFailed}
          aria-label="Seek track position"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        {/* Track background */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          {/* Smooth fill bar without discrete CSS transition stutter */}
          <div
            ref={fillRef}
            className="h-full bg-fg will-change-[width] group-hover:bg-white"
            style={{ width: "0%" }}
          />
        </div>
      </div>
    </div>
  );
}

export function PlayerBar({
  onInstall,
  track: propTrack,
}: {
  onInstall: () => void;
  track?: CatalogTrack | null;
}) {
  const playback = useAudioPlayback();
  const track = propTrack ?? playback.currentTrack;

  if (!track) return null;

  const {
    isPlaying,
    isLooping,
    status,
    streamFailed,
    volume,
    isMuted,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleLoop,
    toggleMute,
    setVolume,
  } = playback;

  const isLoading = status === "loading";

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line bg-bg/95 backdrop-blur-sm px-4 py-2.5 text-fg shadow-2xl">
      {/* Left: Track Info & Artwork */}
      <div className="flex w-full sm:w-1/4 min-w-0 items-center gap-3">
        <div
          className="h-12 w-12 shrink-0 border border-line overflow-hidden"
          style={{
            backgroundColor: track.cover_blob_url ? undefined : getTrackColor(track.id),
          }}
        >
          {track.cover_blob_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.cover_blob_url} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold leading-tight">{track.title}</div>
          <div className="truncate text-[10px] text-on mt-0.5 flex items-center gap-1.5">
            {track.bpm ? <span>{track.bpm} BPM</span> : null}
            {track.bpm && track.key ? <span>•</span> : null}
            {track.key ? <span>{track.key}</span> : null}
            {!track.bpm && !track.key ? <span>miguelbbeats.store</span> : null}
          </div>
        </div>
      </div>

      {/* Center: Transport Controls & Scrubber */}
      <div className="flex w-full sm:flex-1 max-w-xl flex-col items-center gap-1.5">
        <div className="flex items-center gap-3">
          {/* Loop Toggle */}
          <button
            type="button"
            onClick={toggleLoop}
            title={isLooping ? "Loop Enabled" : "Loop Disabled"}
            aria-label="Toggle loop"
            className={`flex h-7 px-2 items-center justify-center text-[10px] font-mono border rounded transition-colors cursor-pointer ${
              isLooping
                ? "border-fg bg-fg text-bg font-bold"
                : "border-line text-on hover:border-fg hover:text-fg"
            }`}
          >
            LOOP
          </button>

          {/* Previous Track */}
          <button
            type="button"
            onClick={prevTrack}
            title="Previous Track (or Restart)"
            aria-label="Previous track"
            className="flex h-7 w-7 items-center justify-center text-on hover:text-fg transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="2" width="2.5" height="12" />
              <polygon points="14,2 6,8 14,14" />
            </svg>
          </button>

          {/* Master Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={streamFailed}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-transform hover:scale-105 disabled:bg-line disabled:text-on cursor-pointer"
          >
            {isLoading ? (
              <span className="text-xs font-mono animate-spin">◓</span>
            ) : isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="3" height="8" />
                <rect x="7" y="2" width="3" height="8" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="ml-0.5">
                <polygon points="3,2 10,6 3,10" />
              </svg>
            )}
          </button>

          {/* Next Track */}
          <button
            type="button"
            onClick={nextTrack}
            title="Next Track"
            aria-label="Next track"
            className="flex h-7 w-7 items-center justify-center text-on hover:text-fg transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="2,2 10,8 2,14" />
              <rect x="11.5" y="2" width="2.5" height="12" />
            </svg>
          </button>
        </div>

        {/* Scrubber & Time */}
        <div className="w-full">
          <Scrubber
            streamFailed={streamFailed}
            isLoading={isLoading}
            isPlaying={isPlaying}
            trackId={track.id}
          />
        </div>
      </div>

      {/* Right: Volume & Install */}
      <div className="flex w-full sm:w-1/4 items-center justify-end gap-3">
        {/* Volume & Mute */}
        <div className="hidden md:flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
            className="text-on hover:text-fg transition-colors text-xs p-1 cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 5v6h3l4 4V1L5 5H2z" />
                <line x1="11" y1="5" x2="15" y2="11" stroke="currentColor" strokeWidth="1.5" />
                <line x1="15" y1="5" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 5v6h3l4 4V1L5 5H2z" />
                <path d="M12 4a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volume slider"
            className="h-1 w-16 cursor-pointer accent-fg bg-line rounded"
          />
        </div>

        <button
          type="button"
          onClick={onInstall}
          className="h-8 rounded border border-line bg-transparent px-4 text-xs font-bold text-fg transition-colors hover:border-fg cursor-pointer"
        >
          INSTALL
        </button>
      </div>
    </footer>
  );
}
