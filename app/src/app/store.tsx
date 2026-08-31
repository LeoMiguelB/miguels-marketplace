"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { CatalogResult } from "@/lib/catalog";
import { catalogView } from "@/lib/catalog-view";
import {
  initialPlayerState,
  playerReducer,
  selectedTrack,
} from "@/lib/player-state";
import { CatalogGrid } from "./catalog-grid";
import { InstallModal } from "./install-modal";
import { PlayerBar } from "./player-bar";

export function Store({ catalog }: { catalog: CatalogResult }) {
  const view = catalogView(catalog);
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [installOpen, setInstallOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const prevIdRef = useRef<number | null>(null);

  const tracks = view.kind === "grid" ? view.tracks : [];
  const current = selectedTrack(tracks, state.selectedId);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || state.selectedId === null) return;
    if (state.streamFailed) {
      audio.pause();
      return;
    }
    if (state.playing) {
      if (prevIdRef.current !== state.selectedId) {
        audio.currentTime = 0;
      }
      void audio.play();
    } else {
      audio.pause();
    }
    prevIdRef.current = state.selectedId;
  }, [state.selectedId, state.playing, state.streamFailed]);

  return (
    <div className="flex min-h-full flex-col bg-bg text-fg">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <span className="font-bold tracking-wide">miguel.store</span>
        <span className="text-xs text-on">catalog</span>
      </header>
      {view.kind === "error" ? (
        <p className="flex flex-1 items-center justify-center text-on">
          CATALOG_UNAVAILABLE
        </p>
      ) : null}
      {view.kind === "empty" ? (
        <p className="flex flex-1 items-center justify-center text-on">
          NO_PUBLISHED_TRACKS
        </p>
      ) : null}
      {view.kind === "grid" ? (
        <CatalogGrid
          tracks={view.tracks}
          selectedId={state.selectedId}
          onPick={(id) => dispatch({ type: "pick", id })}
        />
      ) : null}
      {installOpen && current ? (
        <InstallModal title={current.title} onClose={() => setInstallOpen(false)} />
      ) : null}
      {current ? (
        <PlayerBar
          track={current}
          playing={state.playing}
          streamFailed={state.streamFailed}
          audioRef={audioRef}
          onToggle={() => dispatch({ type: "toggle" })}
          onInstall={() => setInstallOpen(true)}
          onError={() => dispatch({ type: "error" })}
          onCanPlay={() => dispatch({ type: "ready" })}
        />
      ) : null}
    </div>
  );
}
