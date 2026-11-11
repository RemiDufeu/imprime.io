# syntax=docker/dockerfile:1
#
# Imprime in one image: the API, serving the built editor on the same origin.
# Published by .github/workflows/docker.yml; deployed with docker-compose.yml.

# BUILD — on the build machine's own platform, whatever the target: what it
# makes (JavaScript, CSS) is the same on every platform, and making it under
# emulation, for arm64 on an amd64 runner, would take many times longer.
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/common/package*.json ./packages/common/
COPY packages/sdk/package*.json ./packages/sdk/
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/backend/package*.json ./packages/backend/

RUN npm ci

COPY packages/common ./packages/common
COPY packages/sdk ./packages/sdk
COPY packages/frontend ./packages/frontend
COPY packages/backend ./packages/backend

# The frontend's build typechecks it first (tsc -b), past Node's default heap
# on a large program: a crash, not a type error.
ENV NODE_OPTIONS=--max-old-space-size=6144
RUN npm run build:common \
 && npm run build:sdk \
 && npm run build:frontend \
 && npm run build:backend

# RUN — on the target platform: the production dependencies include native
# binaries (@napi-rs/canvas), installed for it.
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3023

# Every workspace's manifest, so that `npm ci` finds the lockfile in step with
# them; only the backend's and common's dependencies are installed.
COPY package*.json ./
COPY packages/common/package*.json ./packages/common/
COPY packages/sdk/package*.json ./packages/sdk/
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/backend/package*.json ./packages/backend/

RUN npm ci --omit=dev --workspace=@imprime/backend --workspace=@imprime/common \
 && npm cache clean --force

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist
COPY --from=builder /app/packages/common/src/assets/fonts ./packages/common/src/assets/fonts

EXPOSE 3023

# The admin commands run through npm (`docker compose exec app npm run …`): its
# notice of a newer npm would only clutter what they print.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

# Node itself as the container's main process, not npm: it receives SIGTERM
# directly, and the server's shutdown handlers close the database cleanly.
CMD ["node", "packages/backend/dist/server.js"]
