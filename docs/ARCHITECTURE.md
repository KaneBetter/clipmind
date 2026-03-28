# Architecture

## System Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Frontend   │────▶│   Backend    │
│              │     │  Next.js 16  │     │   FastAPI    │
│  (read-only) │◀────│  :3000       │◀────│   :8000      │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
┌──────────────┐              ┌──────────────────┼──────────────┐
│  Claude CLI  │──curl──────▶ │                  │              │
│  (editor)    │              ▼                  ▼              ▼
│  /skills     │        ┌──────────┐      ┌──────────┐   ┌──────────┐
└──────────────┘        │  SQLite  │      │  Files   │   │  Gemini  │
                        │   DB     │      │ (media)  │   │   API    │
                        └──────────┘      └──────────┘   └──────────┘
```

**Key principle**: Claude CLI is the editor (creates/modifies timelines via API).
Frontend is read-only display. No interactive editing UI.

## Data Model

```
Project (1) ──▶ (N) Video ──▶ (0..1) Analysis
                  │          ──▶ (0..1) Stability
                  │
                  ├── media_type: "video" | "photo"
                  ├── is_hidden (soft-hide in browser UI)
                  ├── GPS: lat, lon, altitude
                  ├── location_label (clustered)
                  └── thumbnail_path

Project (1) ──▶ (N) Clip (extracted from Analysis + Stability)
           ──▶ (N) Timeline ──▶ (N) TimelineClip
                             ──▶ (N) TimelineSubtitle
                             ──▶ (N) TimelineMusic
           ──▶ (N) Music
           ──▶ (N) Copywrite
           ──▶ (N) Export
```

## Backend Layers

```
Routers (HTTP) → Services (Business Logic) → Models (SQLAlchemy) → SQLite
```

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Routers | `clipmind/routers/*.py` | HTTP endpoints, request validation |
| Services | `clipmind/services/*.py` | Ingestion, analysis, clip extraction, export |
| Models | `clipmind/models/*.py` | Database schema, relationships |
| Config | `clipmind/config.py` | Environment variable loading |

## Frontend Layers

```
Pages (Routes) → Components (UI) → API Client (Axios) → Backend
                                  → React Query (Cache)
```

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Pages | `frontend/src/app/**/*.tsx` | Route handlers, page-level state |
| Components | `frontend/src/components/*.tsx` | Reusable UI |
| API | `frontend/src/lib/api.ts` | Axios client, types |
| Utils | `frontend/src/lib/utils.ts` | Formatters, constants |

## Media Pipeline

```
1. Create Project (name + video_dir)
       ▼
2. Ingest (POST /api/ingest/{projectId})
   - Scan for videos + photos, extract metadata/GPS
   - Generate thumbnails
       ▼
3. AI Analysis (POST /api/analysis/run/{projectId})
   - Gemini → scene, mood, quality, highlights
   - Upload to Gemini File API, analyze, then delete the temporary remote file
   - Persist usage metadata for more accurate cost reporting
       ▼
4. Stability (POST /api/stability/run/{projectId})
   - OpenCV optical flow → stable/shaky segments
       ▼
5. Media Review (/projects/[id]/videos)
   - Hide videos from normal browser results without deleting them
   - Re-open hidden videos through the filter sidebar
       ▼
6. Clip Extraction (POST /api/clips/extract/{projectId})
   - Combine analysis + stability → usable clips per location
       ▼
7. Claude CLI: /clipmind-timeline
   - Read clips + music → create timeline per location
   - User iterates via conversation
       ▼
8. Claude CLI: /clipmind-export
   - Read timeline → CapCut Mate API → JianYing draft
```

## Docker Deployment

### Production (`docker-compose.yml`)
- Backend: Python + FFmpeg + ExifTool + ImageMagick
- Frontend: Next.js standalone build (`node server.js`)
- Images: `clipmind-backend:prod`, `clipmind-frontend:prod`
- Data volume: `./data` → `/app/data` (SQLite + thumbnails)
- Video volume: `$CLIPMIND_VIDEO_DIR` → `/videos` (read-only)

### Development (`docker-compose.dev.yml`)
- Backend: Same as production
- Frontend: `next dev` with source volume mounts for hot reload
- Images: `clipmind-backend:dev`, `clipmind-frontend:dev`
- `WATCHPACK_POLLING=true` for Docker-on-macOS file watching
- Use `./dev.sh` so Docker rebuilds and recreates the dev containers instead of reusing a production-tagged image

## AI Analysis Operations

- Gemini analysis uses the Gemini Developer File API as a temporary upload step.
- `clipmind/services/analysis.py` deletes each uploaded Gemini file in a `finally` block after the analysis attempt completes or fails.
- If background analysis starts failing with `429 RESOURCE_EXHAUSTED` and `file_storage_bytes`, the Gemini project has run out of remote file storage quota.
- Manual recovery: check the Gemini Developer Console to delete stale files.
- `/api/analysis/run-progress/{projectId}` now returns `last_error` so the frontend can show quota failures directly.

## Product Video (`product-video/`)

Remotion 4.0 project that generates a 70-second product demo video.

### Architecture
```
scripts/record-screens.ts  → Playwright records 7 pages as WebM
src/scenes/*.tsx           → 12 Remotion scene components
src/components/            → VideoFrame, TerminalWindow, TypingAnimation, TextOverlay
src/Video.tsx              → TransitionSeries orchestrator (slide + fade)
src/Root.tsx               → Composition entry
```

### Pipeline
```bash
npm run record   # Playwright records browser interactions → public/recordings/*.webm
npm run render   # Remotion renders → out/clipmind-demo.mp4
npm run build    # record + render combined
npm run preview  # Remotion Studio for interactive editing
```

### Scene Structure (12 scenes, ~70s)
1. **Hook** — "100+小时素材，如何变成精彩视频？"
2. **Intro** — ClipMind logo + tagline
3. **Import** — Dashboard recording (scroll)
4. **Map** — GPS map recording (hover markers)
5. **Analysis** — AI analysis recording (scroll to charts)
6. **Stability** — Shake detection recording (scroll to curves)
7. **SmartClips** — Video browser recording (filters)
8. **ClaudeCLI** — Terminal typing animation (core feature demo)
9. **Timeline** — Timeline viewer recording (select + scroll)
10. **Music** — Music library recording (scroll + analyze)
11. **Export** — Pipeline flow animation (ClipMind → CapCut Mate → JianYing)
12. **Outro** — Logo + CTA

### Design
- Apple-style light mode (SF Pro, white bg, subtle shadows)
- Transitions: `@remotion/transitions` slide (screen↔screen) + fade (text↔screen)
- Text overlays: frosted glass gradient backdrop
- Terminal scene: dark body for contrast, light chrome
