# syntax=docker/dockerfile:1
# Next.js app. Build from the repo root (see .github/workflows/deploy.yml):
#   docker build -f apps/frontend/Dockerfile \
#     --build-arg NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
#     --build-arg NEXT_PUBLIC_APP_URL=https://<domain> \
#     --build-arg NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://<domain>/callback .
# Optional: --build-arg NEXT_PUBLIC_ACCESS_REQUEST_URL=https://... (the "Request access" link).
# NEXT_PUBLIC_* values are public and inlined into the bundles at build time; every secret is
# read at runtime from the container environment (docker-compose.coolify.yml).

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Only the frontend and the lockfile entries it needs.
FROM base AS pruner
RUN npm install -g turbo@2.10.13
COPY . .
RUN turbo prune frontend --docker

# Dependencies change far less often than the source, so they get their own cached layer.
FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
COPY --from=pruner /app/out/full/ .
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_WORKOS_REDIRECT_URI
ARG NEXT_PUBLIC_ACCESS_REQUEST_URL
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_WORKOS_REDIRECT_URI=$NEXT_PUBLIC_WORKOS_REDIRECT_URI \
    NEXT_PUBLIC_ACCESS_REQUEST_URL=$NEXT_PUBLIC_ACCESS_REQUEST_URL \
    NEXT_DOCKER_BUILD=true
RUN NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter frontend exec next build

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# The standalone output keeps the monorepo layout because it is traced from the repo root.
COPY --from=builder --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=node:node /app/apps/frontend/public ./apps/frontend/public
USER node
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
