# syntax=docker/dockerfile:1

FROM node:24-bookworm AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile

COPY scripts/ scripts/
COPY patches/ patches/
RUN pnpm bootstrap

COPY src/ src/
COPY tsconfig.json ./
COPY frontend/index.html frontend/components.json frontend/tsconfig.json frontend/vite.config.ts frontend/
COPY frontend/src/ frontend/src/
RUN pnpm ui:build

FROM node:24-bookworm-slim AS runtime

RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PROWLARR_DB=/prowlarr/prowlarr.db \
    STATE_DB=/app/data/pt-monitor.db \
    LISTEN=0.0.0.0 \
    PORT=9709 \
    INTERVAL_MINUTES=30

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/src ./src
COPY --from=build /app/frontend/dist ./frontend/dist
COPY pt-monitor-entrypoint.sh ./

EXPOSE 9709
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9709/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["/app/pt-monitor-entrypoint.sh"]
