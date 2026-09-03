import { describe, expect, test, beforeEach } from "vitest";
import { AudioEngine, MockAudioElement } from "./audio-engine";
import type { CatalogTrack } from "./catalog";

const track1: CatalogTrack = {
  id: 1,
  title: "Tape Loop A",
  stream_blob_url: "http://storage/track1.mp3",
  cover_blob_url: "http://storage/track1.jpg",
};

const track2: CatalogTrack = {
  id: 2,
  title: "Drum Break B",
  stream_blob_url: "http://storage/track2.mp3",
  cover_blob_url: "http://storage/track2.jpg",
};

const track3: CatalogTrack = {
  id: 3,
  title: "Synth Pad C",
  stream_blob_url: "http://storage/track3.mp3",
  cover_blob_url: "http://storage/track3.jpg",
};

describe("AudioEngine", () => {
  let mockAudio: MockAudioElement;
  let engine: AudioEngine;

  beforeEach(() => {
    mockAudio = new MockAudioElement();
    engine = new AudioEngine(mockAudio);
    engine.setCatalog([track1, track2, track3]);
  });

  test("initial state is idle with no track", () => {
    const state = engine.getPlaybackSnapshot();
    expect(state.currentTrack).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.isPlaying).toBe(false);
    expect(state.isLooping).toBe(false);
    expect(state.streamFailed).toBe(false);
    expect(state.volume).toBe(1);
    expect(state.isMuted).toBe(false);
  });

  test("playTrack sets track, updates src and starts playback", async () => {
    await engine.playTrack(track1);

    expect(mockAudio.src).toBe(track1.stream_blob_url);
    const state = engine.getPlaybackSnapshot();
    expect(state.currentTrack).toEqual(track1);
    expect(state.status).toBe("playing");
    expect(state.isPlaying).toBe(true);
    expect(state.streamFailed).toBe(false);
  });

  test("pause and resume toggle playback state", async () => {
    await engine.playTrack(track1);
    await engine.pause();

    let state = engine.getPlaybackSnapshot();
    expect(state.isPlaying).toBe(false);
    expect(state.status).toBe("paused");
    expect(mockAudio.paused).toBe(true);

    await engine.resume();
    state = engine.getPlaybackSnapshot();
    expect(state.isPlaying).toBe(true);
    expect(state.status).toBe("playing");
  });

  test("togglePlay toggles active track playback", async () => {
    await engine.playTrack(track1);
    expect(engine.getPlaybackSnapshot().isPlaying).toBe(true);

    await engine.togglePlay();
    expect(engine.getPlaybackSnapshot().isPlaying).toBe(false);

    await engine.togglePlay();
    expect(engine.getPlaybackSnapshot().isPlaying).toBe(true);
  });

  test("togglePlay on empty selection starts playing first track in catalog", async () => {
    await engine.togglePlay();
    expect(engine.getPlaybackSnapshot().currentTrack).toEqual(track1);
    expect(engine.getPlaybackSnapshot().isPlaying).toBe(true);
  });

  test("switching tracks updates src and resets playback position", async () => {
    await engine.playTrack(track1);
    mockAudio.currentTime = 45;

    await engine.playTrack(track2);
    expect(engine.getPlaybackSnapshot().currentTrack).toEqual(track2);
    expect(mockAudio.src).toBe(track2.stream_blob_url);
    expect(mockAudio.currentTime).toBe(0);
    expect(engine.getProgressSnapshot().currentTime).toBe(0);
  });

  test("nextTrack advances sequentially and wraps to beginning", async () => {
    await engine.playTrack(track1);
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(1);

    await engine.nextTrack();
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(2);

    await engine.nextTrack();
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(3);

    await engine.nextTrack();
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(1);
  });

  test("prevTrack restarts track if played > 3 seconds, otherwise moves to previous", async () => {
    await engine.playTrack(track2);
    mockAudio.currentTime = 10;

    // > 3s: restarts track 2
    await engine.prevTrack();
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(2);
    expect(mockAudio.currentTime).toBe(0);

    // <= 3s: goes to track 1
    mockAudio.currentTime = 1;
    await engine.prevTrack();
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(1);

    // prev from track 1 wraps to end of catalog (track 3)
    mockAudio.currentTime = 0;
    await engine.prevTrack();
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(3);
  });

  test("loop mode: toggleLoop updates loop flag", () => {
    expect(engine.getPlaybackSnapshot().isLooping).toBe(false);
    engine.toggleLoop();
    expect(engine.getPlaybackSnapshot().isLooping).toBe(true);
    expect(mockAudio.loop).toBe(true);

    engine.toggleLoop();
    expect(engine.getPlaybackSnapshot().isLooping).toBe(false);
    expect(mockAudio.loop).toBe(false);
  });

  test("track ended event: auto-advances when loop is disabled", async () => {
    await engine.playTrack(track1);
    expect(engine.getPlaybackSnapshot().isLooping).toBe(false);

    mockAudio.emit("ended");
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(2);
  });

  test("track ended event: stops playback at end of catalog when loop is disabled", async () => {
    await engine.playTrack(track3);
    expect(engine.getPlaybackSnapshot().isLooping).toBe(false);

    mockAudio.emit("ended");
    expect(engine.getPlaybackSnapshot().isPlaying).toBe(false);
    expect(engine.getPlaybackSnapshot().status).toBe("paused");
    expect(mockAudio.currentTime).toBe(0);
  });

  test("track ended event: stops playback on single-track catalog when loop is disabled", async () => {
    engine.setCatalog([track1]);
    await engine.playTrack(track1);
    expect(engine.getPlaybackSnapshot().isLooping).toBe(false);

    mockAudio.emit("ended");
    expect(engine.getPlaybackSnapshot().isPlaying).toBe(false);
    expect(engine.getPlaybackSnapshot().status).toBe("paused");
    expect(mockAudio.currentTime).toBe(0);
  });

  test("track ended event: repeats track when loop is enabled", async () => {
    await engine.playTrack(track1);
    engine.toggleLoop();
    mockAudio.currentTime = 120;

    mockAudio.emit("ended");
    expect(engine.getPlaybackSnapshot().currentTrack?.id).toBe(1);
    expect(mockAudio.currentTime).toBe(0);
    expect(engine.getPlaybackSnapshot().isPlaying).toBe(true);
  });

  test("playTrack preserves loop setting on audio element", async () => {
    engine.toggleLoop();
    expect(engine.getPlaybackSnapshot().isLooping).toBe(true);
    await engine.playTrack(track2);
    expect(mockAudio.loop).toBe(true);
  });

  test("volume control clamps and mute preserves volume", () => {
    engine.setVolume(0.7);
    expect(engine.getPlaybackSnapshot().volume).toBe(0.7);
    expect(mockAudio.volume).toBe(0.7);

    // Clamp over 1
    engine.setVolume(1.5);
    expect(engine.getPlaybackSnapshot().volume).toBe(1.0);

    // Clamp under 0
    engine.setVolume(-0.5);
    expect(engine.getPlaybackSnapshot().volume).toBe(0);

    // Toggle mute
    engine.setVolume(0.8);
    engine.toggleMute();
    expect(engine.getPlaybackSnapshot().isMuted).toBe(true);
    expect(mockAudio.muted).toBe(true);

    engine.toggleMute();
    expect(engine.getPlaybackSnapshot().isMuted).toBe(false);
    expect(mockAudio.muted).toBe(false);
  });

  test("seeking clamps to duration and updates progress", () => {
    mockAudio.duration = 100;
    engine.seek(40);
    expect(mockAudio.currentTime).toBe(40);
    expect(engine.getProgressSnapshot().currentTime).toBe(40);
    expect(engine.getProgressSnapshot().progressPercent).toBe(40);

    // Seek beyond duration clamps to duration
    engine.seek(150);
    expect(mockAudio.currentTime).toBe(100);
  });

  test("audio error transitions to error and sets streamFailed", async () => {
    await engine.playTrack(track1);
    mockAudio.emit("error");

    const state = engine.getPlaybackSnapshot();
    expect(state.status).toBe("error");
    expect(state.isPlaying).toBe(false);
    expect(state.streamFailed).toBe(true);
  });

  test("subscribers receive notifications on state and progress changes", async () => {
    let playbackNotified = 0;
    let progressNotified = 0;

    const unsubPlayback = engine.subscribePlayback(() => {
      playbackNotified++;
    });
    const unsubProgress = engine.subscribeProgress(() => {
      progressNotified++;
    });

    await engine.playTrack(track1);
    expect(playbackNotified).toBeGreaterThan(0);

    mockAudio.currentTime = 5;
    mockAudio.duration = 60;
    mockAudio.emit("timeupdate");
    expect(progressNotified).toBeGreaterThan(0);

    // Test unsubscribe
    const currentPlaybackCount = playbackNotified;
    unsubPlayback();
    await engine.pause();
    expect(playbackNotified).toBe(currentPlaybackCount);

    const currentProgressCount = progressNotified;
    unsubProgress();
    mockAudio.emit("timeupdate");
    expect(progressNotified).toBe(currentProgressCount);
  });
});
