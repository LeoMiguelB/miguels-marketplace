import type { CatalogTrack } from "./catalog";

export type PlayerState = {
  selectedId: number | null;
  playing: boolean;
  streamFailed: boolean;
};

export const initialPlayerState: PlayerState = {
  selectedId: null,
  playing: false,
  streamFailed: false,
};

export type PlayerAction =
  | { type: "pick"; id: number }
  | { type: "toggle" }
  | { type: "error" }
  | { type: "ready" };

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "pick":
      if (state.selectedId === action.id) {
        return { ...state, playing: !state.playing, streamFailed: false };
      }
      return { selectedId: action.id, playing: true, streamFailed: false };
    case "toggle":
      if (state.selectedId === null) return state;
      return { ...state, playing: !state.playing };
    case "error":
      return { ...state, playing: false, streamFailed: true };
    case "ready":
      return { ...state, streamFailed: false };
    default:
      return state;
  }
}

export function selectedTrack(
  tracks: CatalogTrack[],
  selectedId: number | null,
): CatalogTrack | undefined {
  if (selectedId === null) return undefined;
  return tracks.find((track) => track.id === selectedId);
}
