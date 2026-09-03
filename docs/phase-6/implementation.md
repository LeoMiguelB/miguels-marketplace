# Phase 6 Implementation Plan: AI Cover Art Generation & Frontend Animation

## 1. Goal Description

Phase 6 implements an end-to-end generative cover art system for Miguel's Marketplace. As a music producer, Miguel needs the ability to generate captivating, high-aesthetic cover art using natural language directly from his **Admin CLI** or a companion tool, with the output seamlessly integrated into the **Next.js Frontend Catalog & Player Bar**.

The system adopts the proven **1 Static AI Master Frame + React CSS Motion** architecture from the `gify-create` POC, and adopts the visual aesthetic of `~/Downloads/HCITlPCaoAAZDbU` (an angelic anime night scene with an oversized cozy sweater, wet street reflections, and a glowing halo) as its flagship default style.

### Key Deliverables:
1. **Database Schema Migration**: Add `cover_animation` (`jsonb null`) to `playable_audio`.
2. **Cover Generation Engine (`app/src/lib/cover-engine/`)**:
   - Interceptor: Prompt compression, resolution deduction (1:1 standard for cover art), animation species deduction (`kenburns-particles`, `rain`, `halo-pulse`, `drift`).
   - Style Engine: Curated style presets including `lofi-anime-halo` (the flagship style modeled after `HCITlPCaoAAZDbU`), `synthwave`, `dark-trap`, and open custom prompt support.
   - Artist: Imagen 3.0 via `@google/genai` with local high-res and vector fallbacks for zero-failure offline development.
3. **Admin API Endpoint (`POST /api/admin/cover/generate`)**:
   - Authenticated with `X-Admin-Secret`.
   - Generates the visual asset, uploads it directly to MinIO under `cover/<uuid>.jpg`, and returns the public URL with deduced animation parameters.
4. **Admin CLI (.NET 10)**:
   - Expand `create` command with `--generate-cover "<prompt>"` and optional `--cover-style "<style>"`.
   - Add a standalone `cover generate` command for standalone creation and inspection.
   - Update `InsertPlayableAudio` to persist `cover_animation` JSON to Postgres.
5. **Frontend Animated Cover Component (`app/src/app/animated-cover.tsx`)**:
   - Smooth 60 FPS CSS Ken Burns camera drift.
   - Atmospheric vignette and dynamic floating particle layer (stars, embers, fireflies, rain motes).
   - Ethereal halo glow animation when the flagship style or halo elements are present.
   - Synced with music playback state (`isPlaying` activates or enhances motion).
   - Full accessibility (`prefers-reduced-motion`) and GPU acceleration (`will-change: transform`).
   - Integrated into `CatalogGrid` cards and `PlayerBar` master transport.

---

## 2. Architecture & Data Flow

```
                                    ADMIN CLI (.NET 10)
                               ┌─────────────────────────────┐
                               │ dotnet run -- create ...    │
                               │  --generate-cover "prompt"  │
                               └──────────────┬──────────────┘
                                              │ HTTP POST /api/admin/cover/generate
                                              ▼
                               NEXT.JS ADMIN COVER ENDPOINT
                       ┌──────────────────────────────────────────────┐
                       │  app/src/app/api/admin/cover/generate        │
                       └──────────────┬───────────────────────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 ▼                    ▼                    ▼
      ┌──────────────────────┐ ┌──────────────┐ ┌──────────────────────┐
      │   The Interceptor    │ │ Style Presets│ │      The Artist      │
      │ - Strip fluff        │ │ - Flagship:  │ │ - Imagen 3.0 GenAI   │
      │ - Deduce animation   │ │   lofi-anime-│ │ - Aspect ratio: 1:1  │
      │ - Deduce particles   │ │   halo       │ │ - Local SVG fallback │
      └──────────┬───────────┘ └──────┬───────┘ └──────────┬───────────┘
                 │                    │                    │
                 └────────────────────┼────────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   MinIO Object Storage    │
                        │   bucket: music           │
                        │   key: cover/<uuid>.jpg   │
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │    PostgreSQL Database    │
                        │    table: playable_audio  │
                        │    - cover_blob_url       │
                        │    - cover_animation      │
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                         NEXT.JS STOREFRONT (React 19)
         ┌────────────────────────────────────────────────────────┐
         │ CatalogGrid & PlayerBar                                │
         │   <AnimatedCover track={track} isPlaying={isPlaying}/> │
         │   - Zero AI flicker                                    │
         │   - 60 FPS GPU-accelerated CSS                         │
         │   - Dynamic halo pulse & particle drift                │
         └────────────────────────────────────────────────────────┘
```

---

## 3. Data Models & TypeScript Types

### 3.1 Animation Metadata Type (`app/src/lib/cover-engine/types.ts`)

```typescript
export type AnimationType =
  | "kenburns"
  | "kenburns-particles"
  | "halo-pulse"
  | "rain"
  | "drift";

export type ParticleType =
  | "stars"
  | "fireflies"
  | "embers"
  | "rain"
  | "dust"
  | "neon"
  | "none";

export interface CoverAnimationConfig {
  version: 1;
  preset?: string;
  type: AnimationType;
  particleType: ParticleType;
  intensity: "subtle" | "gentle" | "moderate";
  hasHalo?: boolean;
  aspectRatio: "1:1" | "16:9" | "4:3" | "9:16";
  prompt: string;
  compressedPrompt: string;
}

export interface CoverGenerationRequest {
  prompt: string;
  style?: string;
  aspectRatio?: "1:1" | "16:9" | "4:3" | "9:16";
}

export interface CoverGenerationResult {
  cover_blob_url: string;
  cover_animation: CoverAnimationConfig;
  source: "imagen-api" | "local-asset-library" | "vector-render-fallback";
}
```

### 3.2 Update Catalog Track Type (`app/src/lib/catalog.ts`)

```typescript
import type { CoverAnimationConfig } from "./cover-engine/types";

export type CatalogTrack = {
  id: number;
  title: string;
  stream_blob_url: string;
  cover_blob_url: string;
  cover_animation: CoverAnimationConfig | null;
};
```

---

## 4. Database Schema Migration

Create migration `supabase/migrations/20260903000000_cover_animation.sql`:

```sql
-- Migration: Add cover_animation jsonb to playable_audio
alter table playable_audio
  add column if not exists cover_animation jsonb null;

comment on column playable_audio.cover_animation is 
  'Animation configuration and generative metadata for animated cover art rendering.';
```

---

## 5. Cover Generation Engine Implementation

Directory: `app/src/lib/cover-engine/`

### 5.1 Style Presets (`presets.ts`)
Encapsulate the visual identity of `~/Downloads/HCITlPCaoAAZDbU`:

```typescript
export interface StylePreset {
  id: string;
  name: string;
  description: string;
  promptEnhancer: (userSubject: string) => string;
  defaultAnimation: {
    type: "kenburns-particles" | "halo-pulse" | "rain";
    particleType: "stars" | "dust" | "embers" | "rain";
    intensity: "gentle" | "moderate";
    hasHalo: boolean;
  };
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  "lofi-anime-halo": {
    id: "lofi-anime-halo",
    name: "Lo-Fi Anime Halo (Flagship)",
    description: "Moody midnight lo-fi anime aesthetic with street lights and luminous glowing halo",
    promptEnhancer: (subject: string) =>
      `${subject}, stylized 2D anime illustration, lo-fi aesthetic, luminous glowing white halo floating above head, moody midnight blue atmosphere, overcast sky, street light illumination, wet dark asphalt reflections, cozy oversized cable-knit sweater, soft painterly textures, cinematic lighting, masterpiece, clean line art, trending on pixiv`,
    defaultAnimation: {
      type: "halo-pulse",
      particleType: "dust",
      intensity: "gentle",
      hasHalo: true,
    },
  },
  "synthwave": {
    id: "synthwave",
    name: "Retro Synthwave",
    description: "80s retro-futuristic grid sunset, vibrant neon magenta and cyan",
    promptEnhancer: (subject: string) =>
      `${subject}, 80s synthwave retro-futuristic digital art, wireframe neon grid, magenta and cyan lighting, chrome reflections, vintage sunset aesthetic`,
    defaultAnimation: {
      type: "kenburns-particles",
      particleType: "neon",
      intensity: "moderate",
      hasHalo: false,
    },
  },
  "dark-trap": {
    id: "dark-trap",
    name: "Dark Trap Gothic",
    description: "Moody gothic architecture, deep purple smoke, rising fiery embers",
    promptEnhancer: (subject: string) =>
      `${subject}, dark gothic aesthetic, brooding purple and black atmosphere, volumetric fog, moody rim lighting, album cover art`,
    defaultAnimation: {
      type: "kenburns-particles",
      particleType: "embers",
      intensity: "moderate",
      hasHalo: false,
    },
  },
};
```

### 5.2 The Interceptor (`interceptor.ts`)
- Cleans and compresses raw conversational prompts (saving tokens).
- Deduces aspect ratio (`1:1` default for album artwork).
- Detects whether the user mentioned halo, rain, stars, or embers to select particle effects.
- Uses `gemini-2.0-flash-lite` if `GEMINI_API_KEY` is present, with instantaneous rule-based fallback when offline.

### 5.3 The Artist (`artist.ts`)
- Uses `@google/genai` with `imagen-3.0-generate-002` (or configured model).
- Generates 1:1 square master image (1024x1024).
- Offline fallback: provides a beautifully styled dark SVG cover with glowing moon/halo and typography matching the prompt, guaranteeing 100% test reliability and zero-cost local iteration.

---

## 6. Admin API Endpoint: `POST /api/admin/cover/generate`

Create `app/src/app/api/admin/cover/generate/route.ts`:
1. Authenticates using `X-Admin-Secret` via `assertAdminSecret(request)`.
2. Parses JSON body: `{ prompt, style, aspectRatio }`.
3. Invokes the Cover Engine pipeline to obtain image buffer and animation metadata.
4. Generates unique key: `cover/${crypto.randomUUID()}.jpg`.
5. Uploads buffer to MinIO bucket `music` using `@aws-sdk/client-s3`.
6. Returns JSON:
   ```json
   {
     "cover_blob_url": "http://127.0.0.1:9000/music/cover/4f3a...jpg",
     "cover_animation": {
       "version": 1,
       "preset": "lofi-anime-halo",
       "type": "halo-pulse",
       "particleType": "dust",
       "intensity": "gentle",
       "hasHalo": true,
       "aspectRatio": "1:1",
       "prompt": "...",
       "compressedPrompt": "..."
     },
     "source": "imagen-api"
   }
   ```

---

## 7. Admin CLI (.NET 10) Enhancements

Files in `app/cli/`:
1. **`Program.cs`**:
   - Add options to `create`:
     - `--generate-cover <prompt>`: Prompt to generate cover art automatically.
     - `--cover-style <style>`: Optional preset (defaults to `lofi-anime-halo`).
   - Add standalone `cover` command:
     - `dotnet run -- cover generate -p "<prompt>" [--style "<style>"] [--out "<path>"]`
2. **`CreatePlayableAudio.cs`**:
   - If `--generate-cover` is specified:
     - Calls `POST /api/admin/cover/generate` with `X-Admin-Secret`.
     - Receives `cover_blob_url` and `cover_animation` JSON.
     - Passes both into `insert(...)`.
3. **`InsertPlayableAudio.cs`**:
   - Update SQL insert to include `cover_animation`:
     ```csharp
     const string sql = @"
       insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url, cover_animation)
       values (@title, @published, @stream_blob_url, @download_blob_url, @cover_blob_url, @cover_animation::jsonb)
       returning id;";
     ```

---

## 8. Frontend Integration: Animated Cover Component

### 8.1 `app/src/app/animated-cover.tsx`
A client React component that renders:
1. **Visual Layer**: Background image with subtle Ken Burns drift:
   ```css
   @keyframes coverKenBurns {
     0% { transform: scale(1) translate(0%, 0%); }
     50% { transform: scale(1.06) translate(-1.5%, -1%); }
     100% { transform: scale(1.02) translate(1%, -1.5%); }
   }
   ```
2. **Halo Glow Layer**:
   If `hasHalo: true`, renders a radial glow filter at the top-center with rhythmic pulse:
   ```css
   @keyframes haloPulse {
     0%, 100% { opacity: 0.6; transform: scale(1); filter: drop-shadow(0 0 8px rgba(255,255,255,0.8)); }
     50% { opacity: 0.95; transform: scale(1.08); filter: drop-shadow(0 0 16px rgba(254,240,138,0.9)); }
   }
   ```
3. **Particle Layer**:
   Emits 8 lightweight floating dots (dust, stars, fireflies) that drift gently upward. When `isPlaying` is true, particle opacity and drift speed subtly increase.
4. **Reduced Motion**:
   Wrapped in `@media (prefers-reduced-motion: reduce)` to disable animations when requested by OS settings.

### 8.2 Integration into `CatalogGrid` & `PlayerBar`
- In `catalog-grid.tsx`: Replace static `<img>` with `<AnimatedCover track={track} isPlaying={isActive && isPlaying} />`.
- In `player-bar.tsx`: Mini thumbnail shows the cover with smooth visual styling.

---

## 9. Verification & Testing Plan

### 9.1 Unit & Integration Tests (`app/`)
- `src/lib/cover-engine/interceptor.test.ts`: Verify fluff stripping, aspect ratio deduction, token savings calculation.
- `src/lib/cover-engine/presets.test.ts`: Verify flagship preset prompt generation matching `HCITlPCaoAAZDbU`.
- `src/lib/cover-engine/artist.test.ts`: Verify fallback SVG generation when no API key is provided.
- `src/app/api/admin/cover/generate/route.test.ts`: Verify `401 Unauthorized` without secret, `200 OK` with valid secret, MinIO upload call.
- Run `npm test` in `app/` to ensure all 62+ tests pass with 0 regressions.

### 9.2 CLI Tests (`app/cli/`)
- Test `CreatePlayableAudio` with `--generate-cover`: verify correct payload dispatch and Postgres JSON insertion.
- Run `dotnet test` in `app/cli/PersonalMusicStore.Cli.Tests` to verify all tests pass.

### 9.3 End-to-End Smoke Test
1. Run `dotnet run -- cover generate -p "anime girl dancing under street light with halo"`.
2. Verify output URL in MinIO and valid animation config.
3. Run `dotnet run -- create -t "Midnight Halo Beat" -p true -f sample.wav --generate-cover "anime girl in oversized sweater on dark street"`.
4. Open store at `http://127.0.0.1:3000` and confirm:
   - Card displays the cover with 100% flicker-free Ken Burns drift.
   - Street light and halo pulse smoothly.
   - Playing the track activates enhanced animation dynamics.
