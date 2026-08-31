import { describe, expect, test } from "vitest";
import {
  initialPlayerState,
  playerReducer,
  selectedTrack,
} from "./player-state";

const tracks = [
  {
    id: 1,
    title: "A",
    stream_blob_url: "http://s/a",
    cover_blob_url: "http://c/a",
  },
  {
    id: 2,
    title: "B",
    stream_blob_url: "http://s/b",
    cover_blob_url: "http://c/b",
  },
];

describe("playerReducer", () => {
  test("first pick starts playing", () => {
    expect(playerReducer(initialPlayerState, { type: "pick", id: 1 })).toEqual({
      selectedId: 1,
      playing: true,
      streamFailed: false,
    });
  });

  test("same id toggles pause then resume", () => {
    const playing = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    const paused = playerReducer(playing, { type: "pick", id: 1 });
    expect(paused).toEqual({
      selectedId: 1,
      playing: false,
      streamFailed: false,
    });
    expect(playerReducer(paused, { type: "pick", id: 1 })).toEqual({
      selectedId: 1,
      playing: true,
      streamFailed: false,
    });
  });

  test("other id switches and plays from a fresh success state", () => {
    const a = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    const failed = playerReducer(a, { type: "error" });
    expect(playerReducer(failed, { type: "pick", id: 2 })).toEqual({
      selectedId: 2,
      playing: true,
      streamFailed: false,
    });
  });

  test("toggle on bar matches card toggle when selected", () => {
    const playing = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    expect(playerReducer(playing, { type: "toggle" })).toEqual({
      selectedId: 1,
      playing: false,
      streamFailed: false,
    });
  });

  test("toggle with nothing selected is a no-op", () => {
    expect(playerReducer(initialPlayerState, { type: "toggle" })).toEqual(
      initialPlayerState,
    );
  });

  test("error keeps selection and stops transport", () => {
    const playing = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    expect(playerReducer(playing, { type: "error" })).toEqual({
      selectedId: 1,
      playing: false,
      streamFailed: true,
    });
  });
});

describe("selectedTrack", () => {
  test("undefined when none", () => {
    expect(selectedTrack(tracks, null)).toBeUndefined();
  });

  test("finds row", () => {
    expect(selectedTrack(tracks, 2)?.stream_blob_url).toBe("http://s/b");
  });
});
