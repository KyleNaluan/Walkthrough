# Walkthrough

ASWE Group 2 (Health Coders), Fall 2026. A mobile-first web app where food and beverage inspectors record findings and store owners submit fixes.

**Stack:** TypeScript · React (Vite) with Mantine UI · Node/Express · PostgreSQL on Supabase · hosted on Vercel.
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

## UI style

The client looks like an official inspection record. Build every page from Mantine components and these shared pieces instead of writing CSS.

- **Theme** (`client/src/theme.ts`):
  - **Colors:** civic navy (`navy`) is the main color; pages are paper grey, cards are white.
  - **Shape:** corners are only slightly rounded.
  - **Fonts:** Public Sans for text, IBM Plex Mono (`ff="monospace"`) for record numbers and dates.
  - **Sizes:** inputs and buttons are 42px tall so they are easy to tap.
- **Status and severity** (`client/src/status.ts`): each ticket status and severity has one label and one colour. `recordNumber('T', 7)` gives `T-0007`.

  | Status                  | Colour | Severity | Colour          |
  | ----------------------- | ------ | -------- | --------------- |
  | Open                    | orange | Low      | yellow, outline |
  | Pending review          | navy   | Medium   | orange, outline |
  | Changes requested       | red    | High     | red, filled     |
  | Re-inspection scheduled | grape  | Overdue  | red, filled     |
  | Resolved                | green  |          |                 |

- **Components** (`client/src/components/ui/`):
  - `PageHeader` puts a small mono line (record number, store) above the page title, with actions on the right.
  - `Section` is a labelled card, like a section of a paper form.
  - `StatusBadge`, `SeverityBadge` and `OverdueBadge` show the colours above.
  - `Emblem` is the app's mark.
- **Icons:** `@tabler/icons-react`.

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
| `SEED_PASSWORD`            | `npm run seed` only. Password for every seed account, shared privately     |

- **Local:** `server/.env`. `server/src/config/env.ts` validates it on startup and lists anything missing.
- **Production:** set them in Vercel > Project > Settings > Environment Variables.
- **CI:** tests run without secrets. Supabase vars are optional when `NODE_ENV=test`.
- Anything the browser needs must be prefixed `VITE_` and is public. Only the Supabase URL and publishable key are ever safe there.

## Database and seed data

The schema lives in `database/`, as numbered scripts that each run **once** in the Supabase SQL editor, in order:

- `001_schema.sql`: tables, value lists and access settings. It has already run on the shared project.
- `002_status_functions.sql`: the `submit_fix` and `review_fix` functions that change a ticket's status. Run it once, after `001`.

A later change to the database gets its own new script (`003_...`). Never edit a script that has already run.

To load the test data, put `SEED_PASSWORD` in `server/.env`, then run:

```sh
npm run seed -w server -- --yes     # bash, Git Bash, macOS
npm run seed -w server '--' --yes   # PowerShell, which drops a bare --
```

> **Warning:** the seed **deletes every row in the shared database** and every `@walkthrough.test` account, then recreates them. Only one person runs it at a time, and they announce it in the group chat first.

It creates these accounts, all with the password in `SEED_PASSWORD`:

| Email                         | Role        | Stores |
| ----------------------------- | ----------- | ------ |
| `inspector1@walkthrough.test` | Inspector   | All    |
| `inspector2@walkthrough.test` | Inspector   | All    |
| `owner1@walkthrough.test`     | Store owner | 2      |
| `owner2@walkthrough.test`     | Store owner | 1      |
| `owner3@walkthrough.test`     | Store owner | 2      |

The seed also adds inspections, and tickets in every status, including an overdue ticket. One store has no inspections.

The free Supabase project pauses after about a week without use. If the app can't reach the database, resume the project from the Supabase dashboard. Check it before a demo.

## Deployment

Vercel is connected through the GitHub app. Every merge to `main` deploys to the `.vercel.app` site, and PRs get preview deploys.

```sh
npm ci && npm run build   # same install + build commands Vercel runs
```

## Contributing

See the Group GitHub Rules: branch as `<firstname>/short-description`, open a PR with at least one review, use merge commits (not squash), and keep CI green.
