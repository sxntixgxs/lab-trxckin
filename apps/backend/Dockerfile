# syntax=docker/dockerfile:1
# NestJS API. Build from the repo root: docker build -f apps/backend/Dockerfile .
# The image keeps dev dependencies and the TypeScript sources on purpose: docker-compose.coolify.yml
# runs `prisma migrate deploy` from it, and scripts such as promote-admin run with tsx inside it
# (docs/deploy-coolify.md).

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
# The Prisma schema engine (migrations) links against OpenSSL 3.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Only the backend and the lockfile entries it needs.
FROM base AS pruner
RUN npm install -g turbo@2.10.13
COPY . .
RUN turbo prune backend --docker

# Dependencies and the generated Prisma client (it lives in node_modules) only change with the
# lockfile or the schema, so this stage stays cached across ordinary code changes.
FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/apps/backend/prisma ./apps/backend/prisma
COPY --from=pruner /app/out/full/apps/backend/prisma.config.ts ./apps/backend/
# prisma.config.ts requires DATABASE_URL even though generate never connects. The `ls` fails the
# build if the schema engine that `migrate deploy` needs at runtime was not downloaded.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter backend exec prisma generate \
 && ls node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x

FROM deps AS builder
COPY --from=pruner /app/out/full/ .
# `nest build` directly: `pnpm build` would re-run `prisma generate` (prebuild) and touch node_modules.
RUN pnpm --filter backend exec nest build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/ ./
COPY --from=builder /app/apps/backend/ ./apps/backend/
WORKDIR /app/apps/backend
USER node
EXPOSE 8000
CMD ["node", "dist/main.js"]
