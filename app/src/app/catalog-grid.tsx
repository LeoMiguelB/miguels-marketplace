"use client";

import type { CatalogTrack } from "@/lib/catalog";
import { getTrackColor } from "@/lib/colors";
import { useTrackPlayback } from "@/lib/audio-store";

function formatPublishedDate(isoString?: string | null): string | null {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  } catch {
    return null;
  }
}

function TrackCard({
  track,
  onPick,
}: {
  track: CatalogTrack;
  onPick?: (track: CatalogTrack) => void;
}) {
  const { isActive, isPlaying, isLoading, toggle } = useTrackPlayback(track);

  const handleClick = () => {
    toggle();
    if (onPick) {
      onPick(track);
    }
  };

  const formattedDate = formatPublishedDate(track.created_at);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${isPlaying ? "Pause" : "Play"} ${track.title}`}
      className={`group relative text-left border ${
        isActive ? "border-on" : "border-line hover:border-on"
      } bg-bg transition-colors cursor-pointer flex flex-col`}
    >
      <div
        className="relative aspect-square w-full border-b border-line overflow-hidden"
        style={{
          backgroundColor: track.cover_blob_url ? undefined : getTrackColor(track.id),
        }}
      >
        {track.cover_blob_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.cover_blob_url}
            alt=""
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : null}

        {/* Hover / Active Play-Pause Overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-150 ${
            isActive || isLoading
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-bg/90 border border-line text-xs font-mono text-fg animate-spin">
              ◓
            </div>
          ) : isPlaying ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg shadow-md transform group-hover:scale-110 transition-transform">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="3" height="8" />
                <rect x="7" y="2" width="3" height="8" />
              </svg>
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg shadow-md transform group-hover:scale-110 transition-transform">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="ml-0.5">
                <polygon points="3,2 10,6 3,10" />
              </svg>
            </div>
          )}
        </div>

        {/* Status badges */}
        {isActive ? (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 border border-on bg-bg/95 px-1.5 py-0.5 text-[10px] text-fg">
            <span>ON</span>
            {isPlaying ? (
              <span className="flex items-end gap-0.5 h-2.5 ml-0.5">
                <span className="w-0.5 h-full bg-fg animate-pulse" />
                <span className="w-0.5 h-1.5 bg-fg animate-pulse [animation-delay:150ms]" />
                <span className="w-0.5 h-2 bg-fg animate-pulse [animation-delay:300ms]" />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="p-2 flex flex-col gap-1 w-full overflow-hidden">
        <div className={`text-xs truncate font-medium ${isActive ? "text-fg font-bold" : "text-fg"}`}>
          {track.title}
        </div>

        <div className="flex items-center justify-between text-[10px] text-on font-mono pt-0.5">
          <div className="flex items-center gap-1.5 truncate">
            {track.bpm ? (
              <span className="border border-line px-1 py-0.2 bg-line/20 rounded-xs text-fg">
                {track.bpm} <span className="text-on text-[9px]">BPM</span>
              </span>
            ) : null}
            {track.key ? (
              <span className="border border-line px-1 py-0.2 bg-line/20 rounded-xs text-fg">
                {track.key}
              </span>
            ) : null}
            {!track.bpm && !track.key ? (
              <span className="text-on/50">--</span>
            ) : null}
          </div>

          {formattedDate ? (
            <span className="text-on text-[10px] shrink-0 ml-1">
              {formattedDate}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function CatalogGrid({
  tracks,
  onPick,
}: {
  tracks: CatalogTrack[];
  selectedId?: number | null;
  onPick?: (track: CatalogTrack) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 p-4">
      {tracks.map((track) => (
        <TrackCard key={track.id} track={track} onPick={onPick} />
      ))}
    </div>
  );
}
