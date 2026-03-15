# LearnUS Notifier — Claude Context

## What This Project Does

A Docker-based TypeScript application that scrapes [LearnUS](https://ys.learnus.org) (Yonsei University's Moodle-based LMS) and sends Telegram notifications for upcoming assignment due dates and online lecture attendance deadlines.

Runs on a Synology NAS (DSM 7.2+ with Container Manager).

## Architecture

**Monorepo** managed by Turborepo + pnpm workspaces. Linting/formatting via Biome.

```
apps/
  scheduler/          # Entry point — wires everything, runs cron
packages/
  scraper/            # Playwright login + scraping (shared BrowserContext)
  db/                 # SQLite state store via Drizzle ORM + @libsql/client
  telegram/           # grammY bot — push notifications + /upcoming command
```

**Data flow:** cron fires → `openSession()` creates a shared Playwright BrowserContext (reuses cached cookies) → `getCourses()` / `getAssignments()` / `getLectures()` each open pages within that context → results upserted to SQLite → `getPendingNotifications()` queries items due within 72h → sends Telegram messages → marks notified.

## Key Design Decisions

- **Playwright for all scraping** — LearnUS session cookies only work inside a Playwright BrowserContext (not plain fetch). The course list page also requires JS execution. `openSession()` returns a `BrowserSession` with a shared `BrowserContext` passed to all scraper functions.
- **Cookie caching** — session saved to `data/cookies.json`, reused across cron runs until expired, then re-login automatically.
- **Three notification tiers** per item: 72h, 24h, 3h. Each fires once (tracked via `notifiedAt*` columns). Independent per tier — missing a 72h notification doesn't block 24h/3h.
- **Language** is configurable via `NOTIFICATION_LANGUAGE=ko|en`.

## Scraper Notes (Verified Against Live Pages)

| File | Status |
|---|---|
| `packages/scraper/src/auth.ts` | ✅ Verified — fields: `loginId`, `loginPasswd`, submit: `#loginBtn` |
| `packages/scraper/src/courses.ts` | ✅ Verified — URL: `/local/ubion/user/index.php`, selector: `a[href*="/course/view.php?id="]` |
| `packages/scraper/src/assignments.ts` | ✅ Verified — column layout: [0] Week, [1] Title, [2] Due date (`YYYY-MM-DD HH:MM`), [3] Status |
| `packages/scraper/src/lectures.ts` | ✅ Verified — class: `modtype_vod`, date in `item.textContent`: `YYYY-MM-DD HH:MM:SS ~ YYYY-MM-DD HH:MM:SS`; completion from `/report/ubcompletion/user_progress_a.php?id={courseId}` (O/▲ = completed) |

## Deployment

- **Image registry:** `ghcr.io/stlpine/learnus-notifier:latest`
- **CI:** `.github/workflows/ci.yml` — runs lint then builds and pushes on every push to `main`
- **Deploy file:** `deploy/compose.yaml` — uses `image:` (not `build:`), copied to the server alongside a `data/` directory
- The root `docker-compose.yml` uses `build:` and is for local development only
- **Minimum requirement:** 1GB RAM — Chromium is the bottleneck. Entry-level NAS units (e.g. Synology DS221+ with 512MB RAM) are not sufficient.
- **Recommended free host:** Oracle Cloud Free Tier (Always Free ARM instance: 4 OCPUs, 24GB RAM)

## Package Dependency Graph

```
scheduler → scraper, db, telegram
telegram  → db (for getUpcoming)
```

## Development Commands

```bash
pnpm install                    # Install all deps
pnpm build                      # Build all packages (turbo)
pnpm check                      # Biome lint + format check
pnpm check:fix                  # Auto-fix lint/format issues

# Install Playwright browser (first time only)
pnpm --filter @learnus-notifier/scraper exec playwright install chromium

# Test the scraper end-to-end
pnpm test:crawl

# Run locally (fill in credentials in docker-compose.yml or set env vars)
node apps/scheduler/dist/index.js
```

## Inspect Scripts (for debugging selectors)

Located in `apps/scheduler/scripts/`:

| Script | Purpose |
|---|---|
| `inspect-login.ts` | Dumps login form field names from the portal |
| `inspect-courses.ts` | Tests plain fetch vs Playwright for course listing |
| `inspect-assignments.ts` | Dumps assignment table structure per course |
| `inspect-lectures.ts` | Dumps lecture activity structure per course |

Run with: `pnpm --filter @learnus-notifier/scheduler run <script-name>`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LEARNUS_USERNAME` | ✅ | — | Yonsei student ID |
| `LEARNUS_PASSWORD` | ✅ | — | Yonsei portal password |
| `TELEGRAM_BOT_TOKEN` | ✅ | — | From @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | — | Your Telegram user ID |
| `NOTIFICATION_LANGUAGE` | — | `ko` | `ko` or `en` |
| `POLL_INTERVAL_MINUTES` | — | `120` | Scrape frequency |
| `DB_PATH` | — | `./data/state.db` | SQLite file path |
| `COOKIES_PATH` | — | `./data/cookies.json` | Session cookie cache |

Credentials are set inline in `docker-compose.yml` (no `.env` file needed for Docker).

## Biome Configuration

Root `biome.json` defines base rules. Each package has a minimal `biome.json` with `"extends": "//"` to inherit from root.

## TypeScript

All packages use `"module": "NodeNext"` — import paths must use `.js` extensions even for `.ts` source files. Build output goes to `dist/` in each package. The root `tsconfig.base.json` is extended by each package's own `tsconfig.json`.
