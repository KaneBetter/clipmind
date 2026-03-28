# Frontend Development Guidelines

## Stack
- Next.js 16.2.1, React 19, TypeScript, Tailwind CSS 4, React Query 5, Axios, Lucide icons

## Commands
```bash
npm run dev      # Dev server on :3000
npm run build    # Production build (type check included)
npm run lint     # ESLint
```

## Architecture
- All pages use `'use client'` — no server components
- Data fetching via React Query (`useQuery`, `useMutation`) — never `fetch()` in components
- API client centralized in `src/lib/api.ts` — all types and endpoints defined there
- Styling: Tailwind inline classes only, no CSS modules, no component libraries. Use `dark:` prefix for dark mode
- i18n: `src/lib/translations.ts` with `useI18n()` hook — all user-facing text via `t('key')`
- Theme: `src/lib/theme-context.tsx` with `useTheme()` hook — light/dark toggle

## Key Files
- `src/lib/api.ts` — Axios instance, endpoint functions, TypeScript interfaces
- `src/lib/utils.ts` — Formatters (`formatDuration`, `qualityColor`, `moodEmoji`, `sceneCategoryEmoji`), constants (`SCENE_CATEGORIES`, `MOODS`)
- `src/lib/translations.ts` — i18n strings (en/zh) for all pages
- `src/lib/i18n-context.tsx` — i18n React context and `useI18n()` hook
- `src/lib/theme-context.tsx` — Dark/light theme context and `useTheme()` hook
- `src/lib/providers.tsx` — React Query provider (30s stale time, 1 retry)
- `src/components/` — Reusable components (sidebar, filter-panel, video-card, active-filters, pagination, location-map)

## Pages
- `/projects/[id]` — Dashboard
- `/projects/[id]/videos` — Media browser with filters
- `/projects/[id]/analysis` — AI scene/mood/quality analysis
- `/projects/[id]/stability` — Video shake detection
- `/projects/[id]/map` — GPS location visualization
- `/projects/[id]/copywrite` — AI narration generation (supports custom prompts)
- `/projects/[id]/music` — Music management + AI beat detection (auto-scan on load)
- `/projects/[id]/timeline` — Read-only multi-timeline viewer (editing via Claude CLI)
- `/projects/[id]/skills` — Claude CLI skills reference

## Conventions
- Immutable state updates only
- `useCallback` for event handlers passed as props
- Filter state as single `VideoFilters` object, page reset to 1 on filter change
- `thumbnailUrl(path)` and `mediaStreamUrl(videoId)` helpers for media URLs
- Responsive: sm/md/lg/xl/2xl breakpoints

@AGENTS.md
