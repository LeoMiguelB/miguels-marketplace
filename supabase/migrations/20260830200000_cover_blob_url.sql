alter table playable_audio
  add column cover_blob_url text not null default '';

alter table playable_audio
  add constraint playable_audio_published_cover_check
  check (published = false or cover_blob_url <> '');
