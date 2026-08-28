FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . ./
RUN pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

COPY --chown=node:node --from=build /app/package.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist

EXPOSE 10000

USER node

CMD ["node", "dist/index.js"]
