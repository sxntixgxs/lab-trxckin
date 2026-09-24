# syntax=docker/dockerfile:1
# ERP simulator (fake SIESA). Build from the repo root: docker build -f apps/erp-simulator/Dockerfile .
# The image keeps dev dependencies and the TypeScript sources on purpose: docker-compose.coolify.yml
# runs `prisma migrate deploy` and the seed (tsx) from it before the simulator starts.

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

# Only the simulator and the lockfile entries it needs.
FROM base AS pruner
RUN npm install -g turbo@2.10.13
COPY . .
RUN turbo prune erp-simulator --docker

# Dependencies and the generated Prisma client (src/generated) only change with the lockfile or
# the schema, so this stage stays cached across ordinary code changes.
FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/apps/erp-simulator/prisma ./apps/erp-simulator/prisma
# tsconfig.json too: Prisma infers the client's import extensions from it. Without it the generated
# imports end in `.ts` and the compiled simulator cannot load them.
COPY --from=pruner /app/out/full/apps/erp-simulator/prisma.config.ts /app/out/full/apps/erp-simulator/tsconfig.json ./apps/erp-simulator/
# prisma.config.ts requires ERP_SIM_DATABASE_URL even though generate never connects. The `ls`
# fails the build if the schema engine that `migrate deploy` needs at runtime was not downloaded.
RUN ERP_SIM_DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter erp-simulator exec prisma generate \
 && ls node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x

FROM deps AS builder
COPY --from=pruner /app/out/full/ .
# `nest build` directly: `pnpm build` would re-run `prisma generate` (prebuild).
RUN pnpm --filter erp-simulator exec nest build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/ ./
COPY --from=builder /app/apps/erp-simulator/ ./apps/erp-simulator/
WORKDIR /app/apps/erp-simulator
USER node
EXPOSE 8100
CMD ["node", "dist/main.js"]
