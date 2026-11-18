FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY nest-cli.json tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY src ./src
RUN pnpm run test
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

RUN mkdir -p /app/uploads && chown -R node:node /app

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

USER node
EXPOSE 4000
VOLUME ["/app/uploads"]

CMD ["node", "dist/main.js"]
