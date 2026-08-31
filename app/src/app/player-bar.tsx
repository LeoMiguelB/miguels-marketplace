import type { Ref } from "react";
import type { CatalogTrack } from "@/lib/catalog";

export function PlayerBar({
  track,
  playing,
  streamFailed,
  audioRef,
  onToggle,
  onInstall,
  onError,
  onCanPlay,
}: {
  track: CatalogTrack;
  playing: boolean;
  streamFailed: boolean;
  audioRef: Ref<HTMLAudioElement>;
  onToggle: () => void;
  onInstall: () => void;
  onError: () => void;
  onCanPlay: () => void;
}) {
  return (
    <footer className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-bg px-4 py-2.5">
      <div className="h-10 w-10 shrink-0 border border-line bg-bg">
        {track.cover_blob_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.cover_blob_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold">{track.title}</div>
        {streamFailed ? (
          <div className="mt-1 text-[10px] text-on">STREAM_UNAVAILABLE</div>
        ) : (
          <audio
            ref={audioRef}
            className="mt-1 w-full"
            controls
            src={track.stream_blob_url}
            onError={onError}
            onCanPlay={onCanPlay}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={streamFailed}
        className="border border-fg px-2 py-1 text-sm disabled:border-line disabled:text-on"
      >
        {playing ? "⏸" : "▶"}
      </button>
      <button type="button" onClick={onInstall} className="border border-fg px-3 py-1 text-xs">
        INSTALL
      </button>
    </footer>
  );
}
