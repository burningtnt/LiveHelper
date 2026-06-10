# AGENTS.md

Project-level instructions for AI coding agents working on **LiveHelper-Frontend**.
Keep this file short, accurate, and current. If you add a new convention, document it here.

---

## 1. Project Overview

LiveHelper (直播助手) is the web frontend for **LiveHelper** — a mod that facilitates
Minecraft in-game live shows. 

- Setup multiple in-game cameras and dispatch rendered textures with [Spout2](https://github.com/leadedge/Spout2), without using a real window + OBS Game Capture
- Control cameras with user scripts (AssemblyScript)

**Stack** (see `package.json` for exact versions):

- React 19 + React Router v7 (SPA mode, `ssr: false`)
- TypeScript 5 strict, Vite 8
- Material UI v7 + `@mui/x-data-grid` for layout / inputs / tables
- Tailwind CSS v4 (with explicit `@layer` ordering against MUI) + `tw-animate-css`
- TanStack Query v5 for all server state
- Monaco Editor for displaying AssemblyScript codes.
- React Hook Form + Zod for forms and validation
- Axios for HTTP, Sonner for toasts, Day.js for dates, lodash-es for helpers
- pnpm as the package manager (see `Dockerfile` and `pnpm-lock.yaml`)

The backend is a separate service. In dev, Vite proxies `/api` to
`http://host.docker.internal:8000/api` (see `vite.config.ts`); never check in
production URLs that differ from this.

---

## 2. Build, Run & Test Commands

Always use **pnpm** — the lockfile is `pnpm-lock.yaml` and CI runs
`pnpm install --frozen-lockfile`

| Command           | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `pnpm install`    | NEVER USE. If you wish new dependencies, stop and ask user!            |
| `pnpm dev`        | NEVER USE. A pre-started server has already launched at localhost:5173 |
| `pnpm build`      | Production build. Output goes to `build/client`.                       |
| `pnpm typecheck`  | `react-router typegen && tsc` — run this before declaring work "done". |
| `pnpm start`      | NEVER USE.                                                             |

There is **no separate lint script**; lint runs in-editor via ESLint with
`source.fixAll.eslint` on save (see `.vscode/settings.json`). To lint manually,
run `pnpm exec eslint .` (no script alias exists yet).

**Always run `pnpm typecheck` after non-trivial changes.** It generates the
typed route helpers under `.react-router/types` that components import as
`import type { Route } from "./+types/route"`. If those types look stale, rerun.

---

## 3. Project Layout

```
app/
  api/                # axios client + TS schemas
    api.ts            # all backend endpoints （may not exist, create them based
                      # on `README_API.yaml` file )
    schema.ts         # request/response interfaces, enums (ReviewStatus, etc.)
    util.ts           # request() helper; auto camelCase↔snake_case conversion
  components/         # cross-route shared components (Header, Empty, Markdown…)
  icons/              # custom SVG icons (Create Programer Art icons if you need)
  routes/             # route components (one folder per non-trivial route)
    home.tsx
    program/route.tsx
    ...
  routes.ts           # central RouteConfig (config-based routing)
  root.tsx            # HTML shell, providers (QueryClient, Theme, Toaster)
  app.css             # Tailwind theme + @layer ordering
  utils.ts            # cn(), parseError()
public/               # static assets served verbatim (currently empty)
```

Path alias: `~/*` → `app/*` (see `tsconfig.json` and `vite.config.ts`'s
`tsconfigPaths`). **Never** use deep relative imports like `../../api/api`;
use `~/api/api`.

---

## 4. Code Style Guidelines

Linting is `@antfu/eslint-config` with `react: true` plus `better-tailwindcss`
and Prettier (see `eslint.config.js`). Editor formats via ESLint, not Prettier
directly (`prettier.enable: false`). Before committing, your editor should have
auto-fixed style; otherwise run ESLint manually.

### General TypeScript / React

- Strict TS — no `any` unless interacting with the API layer's
  `Record<string, any>` payload contract; prefer the shapes in `app/api/schema.ts`.
- Functional components only. Default-export the route component
  (`export default function FooRoute()` …) so React Router can pick it up.
- Use **`type` imports** (`import type { … }`); `verbatimModuleSyntax: true`
  enforces this.
- Use 2-space indent, double quotes, semicolons, trailing commas — Antfu config
  + Prettier handle this.
- Co-locate route-specific subcomponents inside the route folder, e.g.
  `app/routes/team.$id/BasicInfo.tsx`. Promote a component to `app/components/`
  only when used by ≥2 routes.

### Data fetching (TanStack Query)

- All network calls go through `app/api/api.ts` (which uses `app/api/util.ts`).
  **Don't call `axios` directly from components**.
- Wrap shared queries in a hook under `app/hooks/`. Pattern:

```ts
export const fooQueryKey = ["foo"] as const;

const defaultQueryOptions = queryOptions({
  queryKey: fooQueryKey,
  queryFn: getFoo,
  staleTime: 5 * 60 * 1000,
});

export function useFoo(options?: Omit<typeof defaultQueryOptions, "queryKey" | "queryFn">) {
  return useQuery({ ...defaultQueryOptions, ...options });
}
```

- For mutations, invalidate the relevant `queryKey` in `onSuccess`. Use
  `useQueryClient` + `invalidateQueries`.
- Use `skipToken` (not `enabled: false`) when a query depends on data that may
  be `undefined` — see `app/routes/home.tsx`.

### Forms

- Always use ZOD, don't define your own validators.
- React Hook Form + `@hookform/resolvers/zod`, with the schema defined next to
  the form (see `app/routes/admin.contests/constants.ts` for shared schemas).
- Show validation errors via the field's `helperText` / `error` props, not via
  toast.
- Trim string inputs in the Zod schema (`z.string().trim()`).

### Styling

- **MUI for structure & inputs, Tailwind for spacing/colors/typography
  utilities.** Combine via `className`. Use `cn()` from `~/utils` to merge
  conditional classes.
- Layer order is fixed in `app/app.css`:
  `@layer theme, base, mui, components, utilities;`. Don't reorder.
- Prefer the project's design tokens: `bg-primary`, `text-muted-foreground`,
  `border-border`, `bg-background`. The palette is emerald-based.
- **Avoid arbitrary class strings** that the `better-tailwindcss` plugin can't
  validate. Use multiline class strings with the `\`...\`` template literal
  pattern visible across the codebase when classes get long.
- For MUI breakpoints we use **rem** (not px) — see `AppTheme.tsx`.
- Locale defaults to `zh-Hans-CN` (dayjs `zh-cn`, MUI `zhCN`, DataGrid `zhCN`).
  All user-facing strings should be in **Simplified Chinese**.

### API conventions

- Backend uses `snake_case`; the request layer auto-converts to/from `camelCase`
  (see `formatRequest` / `formatResponse` in `app/api/util.ts`). Always use
  camelCase in TS code.
- Booleans/strings/numbers/arrays pass through unchanged. Don't send `Date`
  objects — convert to ISO strings or unix timestamps as the backend expects.
- HTTP timeout is 10s globally. For long uploads, use a per-call axios config.
- No login required, since the server only listen on 127.0.0.1, ensuring no
  external applications can access the backend.
- All apis are documented in `README_API.yaml` in openapi 3 format. If you
  detect any inconsistent between api declaration and backend implementation,
  stop **IMMEDIATELY** and notify user to check whether implementation is wrong.
  DO NOT modify api declaration or implement playgrounds in frontend!

### Comments

- Comments explain **why**, not what. The codebase already follows this.
- Use the `// Workaround:` prefix for any non-obvious MUI / Tailwind interop
  fix; see `AppTheme.tsx` and `Toaster.tsx` for examples.

---

## 5. Adding a New Route

1. Create `app/routes/<segment>/route.tsx` (or a flat `app/routes/<segment>.tsx`
   for simple routes).
2. Register it in `app/routes.ts` using `index()` / `route()` from
   `@react-router/dev/routes`. **Routes are not auto-discovered** — file-based
   convention is opt-in only. The central config is the source of truth.
3. Default-export the route component. For typed `loader` / `action` /
   `params`, import `import type { Route } from "./+types/route"` and run
   `pnpm typecheck` so the typegen picks up the new file.

---

## 6. Testing Instructions

There is **no test framework configured** in this repo — no Vitest, no Jest,
no Playwright. Do not add one without discussing with maintainers; pick the
toolchain that fits the existing stack (Vitest is the natural choice for Vite
projects).

Until tests exist, the bar for "tested" is:

1. `pnpm typecheck` passes cleanly (zero TS errors).
2. ESLint reports no errors on the changed files (your editor will surface
   these; otherwise `pnpm exec eslint <files>`).
3. `pnpm dev` boots without console errors and the affected page renders.
4. For changes touching API calls, exercise both the success path and at least
   one failure path (e.g., temporarily edit the request to force a 4xx) and
   verify the toast / `Empty` state shows the right message via `parseError`.

When adding a new exported helper to `app/utils.ts` or `app/api/util.ts`,
prefer pure functions so they can be unit-tested cheaply once a test runner
lands.

---

## 7. Security Considerations

- **Avoid `dangerouslySetInnerHTML`.** Markdown rendering goes through the
  `Markdown` component in `app/components/Markdown.tsx`, which uses
  `streamdown` in `static` mode and forces all `<a>` through MUI's `Link`.
  Reuse it instead of rolling your own renderer.
- **External links.** When opening user-supplied URLs (e.g., dependency `url`
  on `Dependency`), open in a new tab with `rel="noopener noreferrer"`. The
  existing `DependencyTable` does this — follow that pattern.
- **File uploads.** Only `changeTeamLogo` currently uploads. Use
  `multipart/form-data`, validate the file type/size client-side, and let the
  backend re-validate.
- **`.env` is git-ignored.** Don't commit one. The frontend doesn't currently
  read any env vars at build time; if you need to, prefix with `VITE_`.
- **Don't bypass the API client.** `app/api/util.ts` enforces the camelCase /
  snake_case contract and a 10s timeout. Bypassing it (raw `fetch` / `axios`)
  risks subtly broken payloads.
- **CORS / CSRF.** The Vite proxy and the backend handle this; do not add
  `Access-Control-*` headers from the frontend, and do not enable
  `withCredentials: false` on axios — sessions depend on cookies.

---

## 8. Build & Deploy Notes

- Because we ship as SPA (`ssr: false` in `react-router.config.ts`), all
  routes must work via client-side hydration. Don't add `loader` calls that
  assume server execution.

---

## 9. Common Pitfalls

- Forgetting to add a new file to `app/routes.ts` → the route 404s silently.
- Mixing MUI `sx` and Tailwind classes for the same property → MUI's CSS layer
  loses to Tailwind (intentional). Pick one per element; prefer Tailwind for
  spacing/color, `sx` only for theme-driven values like `color: "text.secondary"`.
- Calling `axios` directly without `formatRequest` → backend rejects camelCase
  payload.
- Using `enabled: false` on a query whose `queryFn` references a possibly-`undefined`
  value → TanStack Query types still complain. Use `skipToken`.
- Forgetting `pnpm typecheck` after changing route files → typed route props
  (`Route.ComponentProps`, `Route.ErrorBoundaryProps`) go stale.