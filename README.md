# LearnUS Notifier

Sends Telegram notifications for upcoming assignment due dates and online lecture attendance deadlines on [LearnUS](https://ys.learnus.org) (Yonsei University).

Runs as a Docker container on any Linux server with at least 1GB RAM. Chromium (used for scraping) is the main resource constraint — low-memory devices such as entry-level NAS units are not suitable.

---

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts — choose a name and username
3. BotFather will give you a **bot token** that looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz` — save it

### 2. Get Your Telegram Chat ID

1. Start a conversation with your new bot (search for it by username and press **Start**)
2. Send it any message (e.g. "hello")
3. Open this URL in your browser, replacing `YOUR_TOKEN` with your bot token:
   ```
   https://api.telegram.org/botYOUR_TOKEN/getUpdates
   ```
4. Find `"chat":{"id":XXXXXXXXX}` in the response — that number is your **chat ID**

> Tip: if the result is empty, send another message to your bot and try again. Alternatively, send `/start` to **@userinfobot** on Telegram — it replies with your chat ID instantly.

### 3. Provision a Server

Any Linux server with **1GB+ RAM** works. A free option is **Oracle Cloud Free Tier** — the Always Free ARM instance provides 4 OCPUs and 24GB RAM at no cost.

Once you have a server, install Docker:
```bash
curl -fsSL https://get.docker.com | sh
```

### 4. Configure Credentials

> **Security note:** Credentials are stored as plaintext environment variables, visible to anyone with file access to `compose.yaml` or who can run `docker inspect`. Never commit `compose.yaml` with real credentials to a public repository.

Copy `deploy/compose.yaml` to your server and fill in your values:

| Variable | Description |
|---|---|
| `LEARNUS_USERNAME` | Your Yonsei student ID |
| `LEARNUS_PASSWORD` | Your Yonsei portal password |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_CHAT_ID` | Your chat ID from step 2 |
| `NOTIFICATION_LANGUAGE` | `ko` for Korean, `en` for English |
| `POLL_INTERVAL_MINUTES` | How often to check (default: `120`) |

### 5. Deploy

The Docker image is built and pushed to `ghcr.io/stlpine/learnus-notifier:latest` automatically by GitHub Actions on every push to `main`.

**First-time setup on your server:**
```bash
mkdir -p ~/learnus-notifier/data
scp deploy/compose.yaml user@your-server-ip:~/learnus-notifier/

ssh user@your-server-ip
cd ~/learnus-notifier
nano compose.yaml          # fill in your credentials
docker compose up -d
```

No inbound ports need to be opened — the container only makes outbound connections to LearnUS and Telegram.

**Check logs:**
```bash
docker compose logs -f
```

**Update to the latest image:**
```bash
docker compose pull && docker compose up -d
```

---

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Show welcome message |
| `/upcoming` | List all deadlines in the next 7 days |

---

## Notification Schedule

Notifications are sent at three points before each deadline:

| Tier | When |
|---|---|
| 📅 First reminder | 72 hours before |
| ⚠️ Second reminder | 24 hours before |
| 🚨 Final reminder | 3 hours before |

Each reminder fires once. Already submitted assignments and completed lectures are silently skipped.

---

## Design Decisions

### Why Playwright instead of plain fetch?

LearnUS uses Yonsei's SSO portal (`infra.yonsei.ac.kr`) which does multi-domain redirects during login. Plain `fetch` can follow the redirects but the resulting session cookies are bound to the browser context and do not work in a plain Node.js HTTP client. Additionally, the course list page (`/local/ubion/user/index.php`) is rendered by a custom Ubion plugin that requires JavaScript execution — the server returns an empty HTML skeleton to plain HTTP requests. Playwright runs a real Chromium browser, which handles both problems.

### Why a shared BrowserContext across all scrapers?

All scraper functions (`getCourses`, `getAssignments`, `getLectures`) accept a `BrowserContext` instead of managing their own browser sessions. This means a single login produces one shared session reused by all scrapers, with parallel page loads for each course. The session is cached to `data/cookies.json` and reused across cron runs until it expires.

### Why SQLite?

No separate database server is needed — SQLite is a single file that lives in the `data/` volume alongside the session cookies. It is sufficient for one user's worth of assignment and lecture records.

### Why three notification tiers (72h / 24h / 3h)?

A single reminder sent too early is easy to forget; a single reminder sent too late leaves no time to act. Three tiers at different urgency levels cover all cases. Each tier is tracked independently — missing the 72h notification (e.g. because the container was down) does not prevent the 24h or 3h ones from firing.

### Why Turborepo + pnpm workspaces?

The codebase is split into four packages (`scraper`, `db`, `telegram`, `scheduler`) with explicit dependency relationships. Turborepo understands this graph and only rebuilds packages that have changed. pnpm workspaces link the packages together locally so they can import each other like published npm packages.

### Why Biome instead of ESLint + Prettier?

Biome replaces both tools with a single binary. It is significantly faster and requires no plugin configuration. The root `biome.json` defines all rules; each package inherits with `"extends": "//"`.

### Why the official Playwright Docker image as the base?

Chromium requires a specific set of system libraries. The official `mcr.microsoft.com/playwright` image ships with both Chromium and all its dependencies pre-installed, which avoids the fragile pattern of installing OS packages in a builder stage and then trying to carry them into a slim runner stage.

---

## Development

There are two Docker Compose files with different purposes:

| File | Purpose | Image |
|---|---|---|
| `docker-compose.yml` | Local development | Builds from source |
| `deploy/compose.yaml` | Server deployment | Pulls from ghcr.io |

For local development, copy `.env.example` to `.env` and fill in your credentials (`.env` is gitignored and never committed):

```bash
cp .env.example .env
```

Then:

```bash
# Install dependencies
pnpm install

# Install Playwright browser
pnpm --filter @learnus-notifier/scraper exec playwright install chromium

# Build all packages
pnpm build

# Test the scraper end-to-end (requires .env)
pnpm test:crawl

# Run locally without Docker
node apps/scheduler/dist/index.js

# Or run via Docker (builds image from source)
docker compose up --build
```
