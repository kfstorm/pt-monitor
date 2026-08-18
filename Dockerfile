FROM node:24-bookworm

RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pnpm install && pnpm bootstrap

EXPOSE 9709
CMD ["pnpm", "cli", "serve", "--db", "/prowlarr/prowlarr.db", "--listen", "0.0.0.0"]
