# ClipMind

AI-powered video management and editing assistant for travel footage.

Ingest a folder of videos, run AI analysis (scene, mood, quality, camera stability), extract usable clips grouped by GPS location, create multi-location timelines via Claude CLI, and export directly to JianYing (剪映) / CapCut via the CapCut Mate API.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + SQLAlchemy + SQLite |
| Frontend | Next.js 16 + React 19 + Tailwind CSS + React Query |
| AI | Google Gemini (scene analysis), OpenCV (stability), Librosa (beat detection) |
| Editing | Claude CLI skills (timeline, music, export) |
| Export | CapCut Mate API → JianYing / CapCut |
| Containers | Docker Compose |

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/your-username/clipmind.git
cd clipmind
cp .env.example .env
# Edit .env — set CLIPMIND_GEMINI_API_KEY and CLIPMIND_VIDEO_DIR

# 2. Start with Docker Compose
docker compose up -d

# 3. Open the app
open http://localhost:3000
```

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in your values.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLIPMIND_GEMINI_API_KEY` | Yes | — | Google Gemini API key ([get one](https://aistudio.google.com/)) |
| `CLIPMIND_VIDEO_DIR` | Yes | — | Absolute path to your video directory on the host |
| `CLIPMIND_PHOTO_DIR` | No | — | Absolute path to your photo directory |
| `CLIPMIND_MUSIC_DIR` | No | — | Absolute path to your music library |
| `CLIPMIND_GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model for analysis |
| `CLIPMIND_CAPCUT_MATE_URL` | No | `http://localhost:30000/...` | CapCut Mate API URL |
| `CLIPMIND_FILE_SERVER_ROOT` | No | — | Host path root for CapCut Mate file server |
| `CLIPMIND_CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |

## Development Mode

```bash
# Build and start with hot reload
./dev.sh

# Equivalent Docker command
docker compose -f docker-compose.dev.yml up -d --build --force-recreate

# Backend only (local Python, requires uv)
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
uvicorn clipmind.main:app --reload --port 8000

# Frontend only
cd frontend && npm install && npm run dev
```

```bash
# Dev helpers
./dev.sh logs
./dev.sh ps
./dev.sh down
./dev.sh restart
```

## Workflow

1. **Create a project** — give it a name and point it at your video directory
2. **Ingest** — scan the directory, extract metadata + GPS, generate thumbnails
3. **AI Analysis** — Gemini analyzes each clip: scene type, mood, quality score, highlights; files are deleted from Gemini after analysis
4. **Stability** — OpenCV detects camera shake, classifies stable/shaky segments
5. **Review** — browse media with filters; hide unwanted clips without deleting them
6. **Clip Extraction** — combines analysis + stability → usable clips per GPS location
7. **Timeline** — Claude CLI reads clips and creates a timeline per location
8. **Edit** — chat with Claude to reorder clips, change music, update subtitles
9. **Export** — Claude CLI exports to CapCut Mate → JianYing / CapCut project

## Claude CLI Skills

Timeline editing is done through Claude CLI, not the frontend.

| Skill | Purpose |
|-------|---------|
| `/clipmind-ingest` | Import videos, cluster GPS locations, reverse-geocode place names |
| `/clipmind-timeline` | Create and modify video timelines via API |
| `/clipmind-music` | Manage music: scan, upload, analyze beats, select tracks |
| `/clipmind-export` | Export timelines to JianYing via CapCut Mate |

## Project Structure

```
.
├── clipmind/              # Python package (FastAPI backend)
│   ├── main.py            # App entry, CORS, routers
│   ├── config.py          # Pydantic settings (all from env vars)
│   ├── database.py        # SQLAlchemy engine + session
│   ├── models/            # ORM models (project, video, analysis, clip, timeline, music…)
│   ├── routers/           # API endpoints
│   └── services/          # Business logic (ingestion, analysis, stability, export…)
├── frontend/              # Next.js 16 frontend
│   └── src/
│       ├── app/           # App Router pages
│       ├── components/    # Reusable UI components
│       └── lib/           # API client, i18n (en/zh), theme (light/dark)
├── tests/                 # Backend pytest tests
├── docs/                  # Architecture and database docs
├── product-video/         # Remotion demo video source
├── docker-compose.yml     # Production
├── docker-compose.dev.yml # Development (hot reload)
├── Dockerfile             # Backend container
├── pyproject.toml         # Python dependencies
└── start.sh               # DB init + uvicorn startup
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET/POST | List / create projects |
| `/api/videos` | GET | List with filters, pagination, sort |
| `/api/ingest/{projectId}` | POST | Scan + import media |
| `/api/analysis/run/{projectId}` | POST | Run AI analysis (Gemini) |
| `/api/stability/run/{projectId}` | POST | Batch shake detection |
| `/api/clips/extract/{projectId}` | POST | Extract usable clips |
| `/api/clips/{projectId}` | GET | List clips (filter by location) |
| `/api/clips/{projectId}/summary` | GET | Clips grouped by location |
| `/api/timelines/{projectId}` | GET/POST | List / create timelines |
| `/api/timelines/{timelineId}` | PUT/DELETE | Update / delete timeline |
| `/api/music/project/{projectId}` | GET | List music |
| `/api/music/{musicId}/analyze` | POST | Beat analysis (librosa) |
| `/api/copywrite/{projectId}` | POST | Generate AI narration |
| `/api/export/{projectId}` | POST | Export timeline to CapCut Mate |
| `/api/media/{videoId}/stream` | GET | Stream video / photo |

## Running Tests

```bash
# Backend
pytest

# Frontend
cd frontend && npm run lint
cd frontend && npm run build  # type check + build
```

## AI Analysis Notes

- Gemini video analysis uploads each source video to the Gemini File API before prompting, and deletes it after each run to avoid hitting storage quotas.
- If you see `429 RESOURCE_EXHAUSTED` with `file_storage_bytes`, the Gemini project has run out of remote file storage quota. Check the Gemini Developer Console to manually delete stale files.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
