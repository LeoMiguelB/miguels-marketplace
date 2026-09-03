alter table playable_audio
  add column if not exists bpm integer null,
  add column if not exists key text null;

alter table playable_audio
  add constraint playable_audio_bpm_check
  check (bpm is null or (bpm > 0 and bpm < 1000));
