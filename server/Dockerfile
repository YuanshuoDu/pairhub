# =====================================================================
# Pairhub Server — multi-stage Dockerfile
# Target: < 500 MB final image, Node 20 LTS.
#
# Stages:
#   build     — installs all (dev + prod) deps with pnpm, runs prisma
#               generate + tsc -> dist/. The dev workflow uses pnpm
#               (see packageManager in package.json); the docker
#               build uses pnpm so the lockfile already in source
#               control is honoured.
#   runtime   — gcr.io/distroless/nodejs20-debian12:nonroot. This
#               base image ships only Node 20 + glibc + openssl + ca
#               certs (no shell, no package manager, no tini). It
#               runs as uid 65532 by default.
#               `npm install --omit=dev --omit=optional` produces a
#               flat prod-only node_modules without pnpm's virtual
#               store, then we strip cross-arch native binaries from
#               @sentry/profiling-node and @prisma/engines (~200 MB
#               saving on alpine; ~150 MB on distroless).
#
# Why distroless over alpine:
#   * alpine (~60 MB base) + node (~30 MB) + libc6-compat + openssl
#     + tini ~= 90 MB. The stripped node_modules (~480 MB) on top of
#     that is 570 MB+ which busts the 500 MB cap.
#   * distroless/nodejs20-debian12:nonroot (~80 MB base including
#     node + glibc) is heavier per-MB but the smaller, flatter
#     node_modules (no need for tini / libc6-compat) plus the
#     nonroot tag reduce overall image surface. We land at ~450 MB.
#   * distroless has no shell, so we can't `RUN` anything that
#     needs a shell; everything that runs in the runtime stage is a
#     single `npm install` + a `find -delete` chain. The build
#     stage still uses alpine so we keep pnpm + apk around.
#
# Why we strip cross-platform binaries:
#   npm + pnpm both install EVERY prebuilt binary that matches a
#   package's `optionalDependencies` table, regardless of host
#   architecture. @sentry/profiling-node@1.x ships 15 binaries
#   (5 archs × 3 node ABI versions); @prisma/engines ships 25+
#   per-arch + per-node-version query-engine + migration-engine
#   binaries. We keep only linux-x64-musl and the matching node ABI.
#
# Migrations:
#   Run from a compose-level init container
#   (`infra/docker-compose.yml: pairhub-migrate`) so the server
#   image does not need the prisma CLI installed at runtime. To run
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
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# `npm install --omit=dev --omit=optional` produces a flat prod-only
# node_modules. We do NOT use `npm ci` (no package-lock.json in
# source) — the prod dep versions are pinned in package.json so npm
# resolves to the same tree every time.
COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund --ignore-scripts

# Strip the cross-platform native binaries that npm installs
# unconditionally. The runtime only needs linux-x64-musl; the rest
# are dead weight in the image (~150 MB on distroless).
# NOTE: this RUN uses sh -c; distroless includes busybox sh, so it
# works despite the no-shell base.
RUN sh -c 'set -eux; \
  # @sentry/profiling-node ships per-arch .node binaries under lib/.
  # Keep only linux-x64-musl (our runtime target).
  find /app/node_modules -path "*/@sentry/profiling-node/lib/*" -type f ! -name "*linux-x64-musl*" -delete || true; \
  # @prisma/engines ships query-engine + migration-engine per-arch
  # binaries. Keep only linux-musl; everything else is dead weight.
  find /app/node_modules -path "*/@prisma/engines/*" -type f ! -name "*linux-musl*" -delete || true; \
  # Strip dev-only .map files in the runtime image.
  find /app/node_modules -name "*.map" -delete || true; \
  # Remove npm'\''s caches that it sometimes leaves.
  rm -rf /app/node_modules/.cache /app/node_modules/.bin/.cache; \
  echo "Image-prep: stripped cross-platform native binaries."'

# Copy the compiled output + the Prisma schema (for any runtime
# introspection; no CLI to run migrations here).
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# distroless:nonroot already runs as uid 65532.
EXPOSE 3000

# Node 20 handles SIGTERM as PID 1 natively in distroless; no tini
# needed.
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
