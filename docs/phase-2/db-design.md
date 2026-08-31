# Phase-2 DB additions

`playable_audio` gains one column. Meanings of the original three tables stay in `docs/phase-1/db-design.md`.

| Field | Type | Meaning |
| --- | --- | --- |
| cover_blob_url | text not null default `''` | Public cover image. Player and cards use this. Empty means no art (UI shows an empty square). |

Check `playable_audio_published_cover_check`: a published row must have a non-empty `cover_blob_url`. Unpublished rows may keep `''`.

Objects live under the `cover/` prefix (public `GetObject`), same bucket as `stream/`.
