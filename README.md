# Walkthrough

ASWE Group 2 (Health Coders), Fall 2026. A mobile-first web app where food and beverage inspectors record findings and store owners submit fixes.

**Stack:** TypeScript · React (Vite) · Node/Express · PostgreSQL on Supabase · hosted on Vercel.
**Tests:** Vitest, SuperTest (API), React Testing Library (UI). **Style:** Google TypeScript Style Guide (ESLint + Prettier).

## Layout

| Path                       | What lives there                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `client/`                  | React app (Vite). `npm run dev` serves it on http://localhost:5173                   |
| `server/`                  | Express API. `src/app.ts` builds the app, `src/index.ts` runs it locally on :3001    |
| `api/index.ts`             | Vercel serverless entry. It re-exports the Express app                               |
| `vercel.json`              | Vercel build and routing: `/api/*` goes to Express, everything else to the React app |
| `.github/workflows/ci.yml` | Runs format check, lint, typecheck, tests and build on every PR                      |

In development, Vite proxies `/api` to the Express server. In production both run on the same Vercel domain, so no CORS setup is needed.

## Setup

Requires Node 22 (see `.nvmrc`).

```sh
npm ci                               # install all workspaces from the lockfile
cp server/.env.example server/.env   # then fill in the Supabase values
npm run dev                          # client :5173 + API :3001
```

## Scripts (run from the repo root)

| Command                              | Does                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| `npm run dev`                        | Client and API with hot reload                                      |
| `npm test`                           | Server tests (Vitest + SuperTest), then client tests (Vitest + RTL) |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc` across client, server and api                        |
| `npm run format`                     | Prettier write (CI runs `format:check`)                             |
| `npm run build`                      | Production build of the client into `client/dist`                   |

Add a dependency to one workspace with `npm i <pkg> -w client` (or `-w server`). If npm 10 fails with `Cannot read properties of null (reading 'edgesOut')`, run the same command with `npx npm@11`.

## Environment variables and secrets

Never commit real values. `.env` files are git-ignored. Only `server/.env.example` is tracked.

| Variable                   | Where it's used                                                            |
| -------------------------- | -------------------------------------------------------------------------- |
| `SUPABASE_URL`             | Server                                                                     |
| `SUPABASE_PUBLISHABLE_KEY` | Server                                                                     |
| `SUPABASE_SECRET_KEY`      | Server only. Bypasses row-level security, so never expose it to the client |
| `PORT`                     | Local dev only (default 3001)                                              |

- **Local:** `server/.env`. `server/src/config/env.ts` validates it on startup and lists anything missing.
- **Production:** set them in Vercel > Project > Settings > Environment Variables (Kyle has access).
- **CI:** tests run without secrets. Supabase vars are optional when `NODE_ENV=test`.
- Anything the browser needs must be prefixed `VITE_` and is public. Only the Supabase URL and publishable key are ever safe there.

## Deployment

Vercel is connected through the GitHub app. Every merge to `main` deploys to the `.vercel.app` site, and PRs get preview deploys. Only Kyle can see Vercel logs, so reproduce failures locally:

```sh
npm ci && npm run build   # same install + build commands Vercel runs
```

## Contributing

See the Group GitHub Rules: branch as `<firstname>/short-description`, open a PR with at least one review, use merge commits (not squash), and keep CI green.
