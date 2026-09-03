"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogResult } from "@/lib/catalog";
import { catalogView } from "@/lib/catalog-view";
import { getAudioEngine } from "@/lib/audio-engine";
import { useAudioPlayback } from "@/lib/audio-store";
import { CatalogGrid } from "./catalog-grid";
import { InstallModal } from "./install-modal";
import { PlayerBar } from "./player-bar";

export function Store({ catalog }: { catalog: CatalogResult }) {
  const view = catalogView(catalog);
  const playback = useAudioPlayback();
  const [installOpen, setInstallOpen] = useState(false);

  const tracks = useMemo(() => (view.kind === "grid" ? view.tracks : []), [view]);

  // Register tracks in the audio engine for queue/next/prev
  useEffect(() => {
    if (tracks.length > 0) {
      getAudioEngine().setCatalog(tracks);
    }
  }, [tracks]);

  // Global keyboard shortcuts: Space (play/pause), Arrows (seek ±5s), M (mute)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (isInputFocused) return;

      if (e.code === "Space") {
        e.preventDefault();
        playback.togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const current = getAudioEngine().getProgressSnapshot().currentTime;
        getAudioEngine().seek(current - 5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const current = getAudioEngine().getProgressSnapshot().currentTime;
        getAudioEngine().seek(current + 5);
      } else if (e.code === "KeyM") {
        e.preventDefault();
        playback.toggleMute();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [playback]);

  const current = playback.currentTrack;

  return (
    <div className="flex min-h-full flex-col bg-bg text-fg">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <span className="font-bold tracking-wide">miguelbbeats.store</span>
        <span className="text-xs text-on">catalog</span>
      </header>

      <main className={`flex-1 flex flex-col ${current ? "pb-28 sm:pb-24" : "pb-8"}`}>
        {view.kind === "error" ? (
          <p className="flex flex-1 items-center justify-center text-on py-24">
            CATALOG_UNAVAILABLE
          </p>
        ) : null}

        {view.kind === "empty" ? (
          <p className="flex flex-1 items-center justify-center text-on py-24">
            NO_PUBLISHED_TRACKS
          </p>
        ) : null}

        {view.kind === "grid" ? (
          <CatalogGrid tracks={view.tracks} />
        ) : null}
      </main>

      {installOpen && current ? (
        <InstallModal
          trackId={current.id}
          title={current.title}
          onClose={() => setInstallOpen(false)}
        />
      ) : null}

      {current ? (
        <PlayerBar onInstall={() => setInstallOpen(true)} />
      ) : null}
    </div>
  );
}
