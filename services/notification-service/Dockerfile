FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @thinkai/config build
RUN pnpm --filter @thinkai/db build
RUN pnpm --filter @thinkai/notification-service build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/notification-service/node_modules ./services/notification-service/node_modules
COPY --from=builder /app/services/notification-service/dist ./services/notification-service/dist

USER node

EXPOSE 4012
CMD ["node", "services/notification-service/dist/index.js"]
