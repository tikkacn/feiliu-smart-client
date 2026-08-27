FROM node:24.19.0-bookworm-slim AS dependencies

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/control-plane-api/package.json apps/control-plane-api/package.json
COPY apps/sync-worker/package.json apps/sync-worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/strategy-engine/package.json packages/strategy-engine/package.json
COPY packages/sync-adapters/package.json packages/sync-adapters/package.json

RUN pnpm install --frozen-lockfile --prod --filter @feiliu/control-plane-api...

FROM node:24.19.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/apps/control-plane-api/node_modules ./apps/control-plane-api/node_modules
COPY --chown=node:node apps/control-plane-api ./apps/control-plane-api
COPY --chown=node:node packages/strategy-engine ./packages/strategy-engine
COPY --chown=node:node policy/fixtures ./policy/fixtures

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/v1/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/control-plane-api/src/server.mjs"]
