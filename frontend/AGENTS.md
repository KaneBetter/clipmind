# Frontend Agent Rules

## Next.js 16 Breaking Changes
This version has breaking changes from training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Key differences:
- `params` is a `Promise` in page components — use `const { id } = use(params)`
- App Router only — no pages/ directory
- React 19 — `use()` hook for promises, no `React.FC`

## Code Patterns
- Always `'use client'` for interactive pages
- Use React Query for ALL data fetching — never raw fetch/axios in components
- Tailwind classes inline — no external CSS, no styled-components
- Icons from `lucide-react` only
- Map components must use `dynamic(() => import(...), { ssr: false })`

## Do NOT
- Import from `next/router` (use `next/navigation`)
- Use `getServerSideProps` or `getStaticProps` (App Router)
- Add new CSS files — use Tailwind classes
- Add new UI libraries without discussion
- Create files > 400 lines — extract components
