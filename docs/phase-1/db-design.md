# DB design

Three tables. Terms and conditions are global in the app, not stored here.

How they connect: a contact installs a playable audio file. That event is one row in `installs`. The same person (same email) installing the same file again does not create a new row; `count` goes up.

The files themselves live in object storage. The database only stores metadata and URLs pointing at those objects.

## playable_audio

The catalog. One row per piece of audio the store can show, stream, or hand out as a download.

| Field | Type | Meaning |
| --- | --- | --- |
| id | integer | Stable identity for this audio. Other tables point here. |
| title | string | Name shown in the UI and in the CLI. |
| published | bool | If true, consumers can see and stream it. If false, it exists for admin/CLI only. |
| stream_blob_url | string | Public preview. The player uses this. Not the file they take home. |
| download_blob_url | string | Full file. Only used after they submit the install form. |
| created_at | datetime | When this row was first created. |
| updated_at | datetime | When title, published, or blob URLs last changed. |

There is no download counter on this table. How many people installed it is the number of `installs` rows for this `id`. How many times they clicked is `SUM(count)` on those rows.

## contacts

A person who has installed at least one file. One row per email.

| Field | Type | Meaning |
| --- | --- | --- |
| id | integer | Stable identity for this person. `installs` points here. |
| email | string | Required. Unique. How we recognize the same person on a later install. |
| name | string | Optional. Display name if they gave one. |
| role | producer \| artist \| other | Optional. How they relate to the music. Empty if they skipped it. |
| instagram | string | Optional. Handle or profile if they gave one. |
| x_handle | string | Optional. X/Twitter handle if they gave one. |
| created_at | datetime | When we first saw this email. |
| updated_at | datetime | When name, role, or socials last changed. |

A later install of a *different* file reuses this row. We do not insert a second contact for the same email. Optional fields can be filled in the first time they are provided; we do not require them.

## installs

The join. Who took which file, first time, last time, and how many times they hit download.

| Field | Type | Meaning |
| --- | --- | --- |
| id | integer | Stable identity for this install record. |
| contact_id | integer | The person. Points at `contacts.id`. |
| playable_audio_id | integer | The file they installed. Points at `playable_audio.id`. |
| count | integer | How many times this person downloaded this file. Starts at 1. Each later download of the same pair increments this. |
| created_at | datetime | First time they installed this file. |
| updated_at | datetime | Last time they downloaded this file (when `count` last went up). |

`(contact_id, playable_audio_id)` is unique. One row per person per file.
