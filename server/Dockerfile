# =====================================================================
# Pairhub Server — multi-stage Dockerfile
# Target: < 500 MB final image, Node 20 LTS.
#
# Stages:
#   build   — installs all (dev + prod) deps with pnpm, runs prisma
#             generate + tsc -> dist/. The dev workflow uses pnpm
#             (see packageManager in package.json); the docker build
#             uses pnpm for the build so the lockfile already in
#             source control is honoured.
#   runtime — node:20-alpine + libc6-compat + openssl + tini. Uses
#             `npm install --omit=dev` (no lockfile; pin by exact
#             version via `package.json`) so we get a flat prod
#             node_modules without pnpm's .pnpm virtual store. Then
#             strips cross-platform native binaries from
#             @sentry/profiling-node + @prisma/engines.
#
# Why this is the lowest-size, lowest-friction layout:
#   * pnpm `prune --prod` doesn't drop the .pnpm virtual store, so
#     the runtime node_modules still has 100+ MB of devDep transitives.
#   * `pnpm deploy` requires a workspace (server isn't one).
#   * `npm install --omit=dev` without a lockfile is good enough
#     here: prod-dep versions are pinned in package.json (no caret
#     ranges) so npm resolves to the same tree every time. We strip
#     cross-platform native binaries after install (~200 MB saving).
#   * `pino-pretty` is in prod (we use it in the dev env, so leaving
#     it in for one-line log formatting in dev). In a strict prod
#     image it could be devDep; the saving would be ~5 MB.
#
# Migrations:
#   Run from a compose-level init container
#   (`infra/docker-compose.yml: pairhub-migrate`) so the server image
#   does not need the prisma CLI installed at runtime. To run
#   migrations out-of-band: `docker run --rm --network pairhub_pairhub \
#   <image> npx prisma migrate deploy`.
# =====================================================================

# ---- 1. build ----
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN apk add --no-cache libc6-compat openssl

# Install ALL deps (dev + prod) so we can run prisma generate + tsc.
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate \
 && pnpm build

# ---- 2. runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Runtime libs: libc6-compat (for Prisma engine), openssl (for sentry),
# tini (PID 1 to forward SIGTERM).
RUN apk add --no-cache libc6-compat openssl tini

# Run as non-root.
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# `npm install --omit=dev` produces a flat prod-only node_modules
# without pnpm's virtual store. We deliberately do NOT use
# `npm ci` (no package-lock.json in source) — the prod dep versions
# are pinned in package.json so the resolution is deterministic.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

# Strip the cross-platform native binaries that npm installs
# unconditionally. The runtime only needs linux-x64-musl; the rest
# are dead weight in the image (~200 MB).
RUN set -eux; \
  # @sentry/profiling-node ships per-arch .node binaries; keep only
  # linux-x64-musl (our runtime target).
  find /app/node_modules/@sentry -type f \( \
      -name '*-darwin-*' -o \
      -name '*-linux-arm64-*' -o \
      -name '*-linux-arm-*' -o \
      -name '*-win32-*' \
    \) -delete 2>/dev/null || true; \
  # @prisma/engines ships query-engine + migration-engine per-arch
  # binaries. Keep only linux-musl; everything else is dead weight.
  find /app/node_modules/@prisma -type f \( \
      -name '*darwin*' -o \
      -name '*debian-openssl*' -o \
      -name '*linux-arm64*' -o \
      -name '*rhel-openssl*' -o \
      -name '*windows*' \
    \) -delete 2>/dev/null || true; \
  # Strip dev-only .map files in the runtime image.
  find /app/node_modules -name '*.map' -delete 2>/dev/null || true; \
  # Remove npm's caches that it sometimes leaves.
  rm -rf /app/node_modules/.cache /app/node_modules/.bin/.cache; \
  echo "Image-prep: stripped cross-platform native binaries."

# Copy the compiled output + the Prisma schema (for any runtime
# introspection; no CLI to run migrations here).
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma

USER nodejs
EXPOSE 3000

# tini = proper PID 1, forwards SIGTERM to node for graceful shutdown.
ENTRYPOINT ["/sbin/tini", "--"]

# See header for the migrations story.
CMD ["node", "dist/server.js"]
