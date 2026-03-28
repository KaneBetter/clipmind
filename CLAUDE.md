# ClipMind Development Guidelines

## Project Overview

ClipMind is a full-stack AI video management tool: FastAPI backend + Next.js 16 frontend, deployed via Docker Compose.

**Architecture**: Claude CLI is the editor (via skills), frontend is read-only display.

## Project Structure

```
.
├── clipmind/          # Python package (FastAPI backend)
│   ├── models/        # SQLAlchemy ORM models
│   ├── routers/       # FastAPI route handlers
│   ├── services/      # Business logic
│   ├── config.py      # Pydantic settings
│   ├── database.py    # SQLAlchemy engine
│   └── main.py        # FastAPI app entry point
├── frontend/          # Next.js 16 frontend
│   └── src/
│       ├── app/       # App Router pages
│       ├── components/ # Reusable components
│       └── lib/       # API client, i18n, theme, utils
├── tests/             # Backend tests
├── docs/              # Architecture docs
├── .claude/skills/    # Claude CLI skills
├── product-video/     # Remotion product demo video
│   ├── scripts/       # Playwright recording scripts
│   ├── src/scenes/    # 12 scene components
│   ├── src/components/ # VideoFrame, TerminalWindow, etc.
│   └── public/recordings/ # Recorded browser WebM files
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
└── start.sh
```

## Running the App

```bash
# Production
docker compose up -d

# Development (frontend hot reload)
docker compose -f docker-compose.dev.yml up -d

# Backend only (local Python)
uvicorn clipmind.main:app --reload --port 8000

# Frontend only (local Node)
cd frontend && npm run dev
```

## Claude CLI Skills

- `/clipmind-ingest` — Import videos, cluster GPS locations, reverse geocode place names
- `/clipmind-timeline` — Create and modify video timelines via API
- `/clipmind-music` — Manage music: scan, upload, analyze beats, select tracks
- `/clipmind-export` — Export timelines to JianYing via CapCut Mate

## Product Video

```bash
cd product-video
npm run record   # Record browser pages (requires frontend running)
npm run render   # Render MP4 via Remotion
npm run preview  # Interactive Remotion Studio
```

## Key Conventions

### Backend (Python/FastAPI)
- **Models**: SQLAlchemy 2.0 declarative in `clipmind/models/`
- **Routers**: FastAPI routers in `clipmind/routers/`, prefix `/api/`
  - `projects`, `videos`, `ingest`, `analysis`, `copywrite`, `export`, `stability`, `music`, `timeline`, `clips`
- **Services**: Business logic in `clipmind/services/`
  - `clip_extraction.py` — combines AI analysis + stability for usable clips
  - `music_analysis.py` — librosa-based beat/onset/section detection
  - `capcut_export.py` — CapCut Mate draft generation from Timeline DB
  - `location_cluster.py` — DBSCAN GPS clustering with haversine distance
  - `ingestion.py` — parallel video import with 8 workers + progress callback
- **Database**: SQLite at `data/clipmind.db`, auto-created on startup
- **Schema migrations**: Lightweight `ALTER TABLE` in `start.sh` for new columns
- **Config**: Environment-based via pydantic-settings in `clipmind/config.py`
- Project has optional `video_dir`, `photo_dir`, `music_dir` paths (all nullable)
- Music scanned from project's `music_dir` or uploaded to `data/music/`
- Ingest runs in background thread with progress polling via `/api/ingest/progress/{id}`
- Docker dev mounts host `/Users` read-only for file browsing and path resolution

### Frontend (Next.js 16 / React 19)
- **App Router**: All pages in `frontend/src/app/`
- **All pages are client components** (`'use client'`)
- **Data fetching**: TanStack React Query v5 with Axios
- **Styling**: Tailwind CSS 4 (inline classes, no CSS modules), dark mode via `dark:`
- **Icons**: Lucide React
- **i18n**: `src/lib/translations.ts` + `useI18n()` context (en/zh)
- **Theme**: `src/lib/theme-context.tsx` + `useTheme()` (light/dark)
- **API client**: `frontend/src/lib/api.ts` (all types, endpoints, helpers)
- **Timeline page**: Read-only multi-timeline viewer (editing via Claude CLI)
- **Skills page**: Shows available Claude CLI skills

### Docker
- `docker-compose.yml` — production (standalone Next.js build)
- `docker-compose.dev.yml` — development (next dev + volume mounts)
- Backend Dockerfile at root, frontend Dockerfile at `frontend/Dockerfile`

## Important Patterns

- Immutable state updates (never mutate objects, always spread)
- Thumbnail URLs: `${API_BASE_URL}/thumbnails/${path}`
- Media streaming: `${API_BASE_URL}/api/media/${videoId}/stream`
- HEIC/HEIF photos auto-converted to JPEG for browser compatibility
- Timeline data persisted in DB (Timeline/TimelineClip/TimelineSubtitle/TimelineMusic)
- Clips extracted by combining AI analysis + stability detection

## Testing

```bash
# Backend
pip install -e ".[dev]"
pytest

# Frontend
cd frontend && npm run lint
cd frontend && npm run build  # type check + build
```

## File Size Limits
- Keep files under 400 lines
- Extract reusable components
- One component per file for UI components

@frontend/AGENTS.md
