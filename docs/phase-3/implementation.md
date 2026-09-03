## Goal Description
Phase 3 focuses on completing the missing core features of the MVP to achieve a fully functional marketplace. Specifically, this phase will implement the secure file download flow in the Next.js storefront and complete the catalog management capabilities (`list`, `update`, `delete`, and `analytics` commands) in the .NET Admin CLI. 

To enable parallelization for multiple builder agents, the work is strictly divided into two independent tracks:
1. **Track 1: Storefront Download Flow** (Next.js & Supabase)
2. **Track 2: Admin CLI Completion** (.NET C# & Supabase)

## User Review Required
> [!IMPORTANT]  
> - **S3 Presigned URLs:** For the download flow, we will use `@aws-sdk/s3-request-presigner` to generate temporary, secure URLs for the private MinIO `download/` objects. This requires installing the package via `npm install @aws-sdk/s3-request-presigner`.
> - **CLI Delete Cascade:** Deleting a track via the CLI (`delete` command) will cascade and delete the corresponding rows in the `installs` table due to the existing DB constraints. The actual file object in MinIO will **not** be deleted in this phase to reduce scope, unless you specifically want the S3 cleanup logic added to the CLI.

## Open Questions
> [!CAUTION]  
> 1. Should we add the `run_command` logic to delete the actual MinIO S3 objects when a track is deleted from the CLI, or is leaving the orphaned files in MinIO acceptable for Phase 3?
I think we can just do a soft delete for now. If the admin wnats to bypass this, they can provide a force delet flag.
> 2. When a user downloads the *same* track multiple times with the same email, the current database schema suggests we should increment the `count` column in the `installs` table. Is this the preferred behavior?
I think it's more important to capture unique downloads per user. If I were someone curious on the actvitivity around some playable stream i'm more interested in how many unique people have downloaded this. I still think it'd be cool to capture the count though, it's just be a different interpretation where we are saying "i'm interested in how many clicks a playable stream got".

So all that to say, i'm board with incrementing the count.

---

## Proposed Changes

### Track 1: Storefront Download Flow (Next.js)

#### [MODIFY] app/package.json
Install the S3 request presigner to generate secure download links.
```json
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1121.0",
    "@aws-sdk/s3-request-presigner": "^3.1121.0",
    // ...
  }
```

#### [NEW] app/src/app/api/install/route.ts
Create a new API route to handle the install form submission. This endpoint will:
1. Parse the contact fields and the requested `trackId`.
2. Upsert the user into the `contacts` table (conflict on `email`).
3. Upsert the install record into the `installs` table (conflict on `(contact_id, playable_audio_id)` to increment `count`).
4. Fetch the `download_blob_url` for the track.
5. Generate and return a presigned S3 URL.

```typescript
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, bucket } from "@/lib/s3";
import { sql } from "@/lib/db";
// ... Route handler implementation with Postgres and S3 clients ...
```

#### [MODIFY] app/src/lib/install-form.ts
Update the stubbed `submitDownload` function to be async, accept the payload (email, name, role, instagram, x, trackId), and perform a `POST /api/install`.

```typescript
export async function submitDownload(
  payload: InstallFields & { trackId: number }
): Promise<{ status: "DOWNLOAD_SUCCESS", url: string } | { status: "DOWNLOAD_FAILED" }> {
  // fetch("/api/install", ...)
}
```

#### [MODIFY] app/src/app/install-modal.tsx
Update the modal to accept the `track.id`, pass it to `submitDownload`, handle loading states, and automatically trigger the download (via `window.location.href` or a hidden `<a>` tag) once the presigned URL is received.

---

### Track 2: Admin CLI Completion (.NET)

#### [MODIFY] app/cli/Program.cs
Replace the hardcoded `not implemented` commands with real `System.CommandLine.Command` definitions that wire up to execution methods.

```csharp
root.Subcommands.Add(ListPlayableAudioCommand.Create());
root.Subcommands.Add(UpdatePlayableAudioCommand.Create());
root.Subcommands.Add(DeletePlayableAudioCommand.Create());
root.Subcommands.Add(AnalyticsCommand.Create());
```

#### [NEW] app/cli/ListPlayableAudio.cs
Query the `playable_audio` table and print the catalog in a formatted console table.
```csharp
// SELECT id, title, published, created_at FROM playable_audio ORDER BY created_at DESC
```

#### [NEW] app/cli/UpdatePlayableAudio.cs
Accept `--id`, `--title`, and `--published` arguments to execute an `UPDATE` statement via `Npgsql`.

#### [NEW] app/cli/DeletePlayableAudio.cs
Accept `--id` and execute a `DELETE FROM playable_audio WHERE id = @id`.

#### [NEW] app/cli/AnalyticsCommand.cs
Accept an optional `--id` parameter.
- If no ID is provided, query the `installs` table grouped by `playable_audio_id` to show total downloads per track.
- If an ID is provided, `JOIN` with the `contacts` table to list the emails, roles, and socials of everyone who downloaded the specific track.

---

## Verification Plan

### Automated Tests
Multiple agents can run the following tests in their respective tracks:
```bash
# Next.js Track
cd app && npm run test

# .NET CLI Track
cd app/cli && dotnet build
# (Note: There are no unit tests currently enabled in PersonalMusicStore.Cli.Tests per the csproj configuration, but we will ensure it compiles successfully)
```

### Manual Verification
1. **Admin CLI:** 
   - Run `dotnet run -- list` to view tracks.
   - Run `dotnet run -- update --id <ID> --published true` and verify it reflects on the storefront.
   - Run `dotnet run -- delete --id <ID>` and verify the track disappears from the frontend.
2. **Download Flow:** 
   - Visit `http://127.0.0.1:3000`.
   - Click a track, open the INSTALL modal, and scroll through the T&C.
   - Submit a test email and verify the browser downloads the actual `.wav` or `.mp3` file.
3. **Analytics:**
   - Run `dotnet run -- analytics` and verify your recent test download is logged.
