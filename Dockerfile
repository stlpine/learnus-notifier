# Use the official Playwright image — comes with Chromium + all system deps pre-installed.
# The version must match the playwright npm package version (1.58.2).
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS base

RUN corepack enable pnpm

# ── Builder stage ─────────────────────────────────────────────────────────────
FROM base AS builder

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/scheduler/package.json ./apps/scheduler/
COPY packages/scraper/package.json ./packages/scraper/
COPY packages/db/package.json ./packages/db/
COPY packages/telegram/package.json ./packages/telegram/

RUN pnpm install --frozen-lockfile

# Copy source and build all packages
COPY apps/ apps/
COPY packages/ packages/

RUN pnpm turbo build

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Seoul

# Tell Playwright to use the browsers already bundled in this image (/ms-playwright)
# instead of downloading them again.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy compiled output and package manifests for each workspace package.
# Per-package node_modules must also be copied — pnpm creates symlinks there
# that Node.js uses to resolve dependencies (e.g. apps/scheduler/node_modules/node-cron).
COPY --from=builder /app/apps/scheduler/dist ./apps/scheduler/dist
COPY --from=builder /app/apps/scheduler/package.json ./apps/scheduler/
COPY --from=builder /app/apps/scheduler/node_modules ./apps/scheduler/node_modules
COPY --from=builder /app/packages/scraper/dist ./packages/scraper/dist
COPY --from=builder /app/packages/scraper/package.json ./packages/scraper/
COPY --from=builder /app/packages/scraper/node_modules ./packages/scraper/node_modules
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder /app/packages/telegram/dist ./packages/telegram/dist
COPY --from=builder /app/packages/telegram/package.json ./packages/telegram/
COPY --from=builder /app/packages/telegram/node_modules ./packages/telegram/node_modules

# Data directory is mounted as a volume at runtime
RUN mkdir -p /app/data

CMD ["node", "apps/scheduler/dist/index.js"]
