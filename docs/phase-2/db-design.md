# Phase-2 DB additions

`playable_audio` gains one column. Meanings of the original three tables stay in `docs/phase-1/db-design.md`.

| Field | Type | Meaning |
| --- | --- | --- |
| cover_blob_url | text not null default `''` | Public cover image. Player and cards use this. Empty means no art (UI shows a `#2a2a2a` square). |

Published rows may have `cover_blob_url = ''`. There is no check requiring cover art to publish.

Objects live under the `cover/` prefix (public `GetObject`), same bucket as `stream/`.
