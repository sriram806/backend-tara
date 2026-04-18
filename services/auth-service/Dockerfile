FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @thinkai/config build
RUN pnpm --filter @thinkai/types build
RUN pnpm --filter @thinkai/db build
RUN pnpm --filter @thinkai/auth-service build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/auth-service/node_modules ./services/auth-service/node_modules
COPY --from=builder /app/services/auth-service/dist ./services/auth-service/dist

USER node

EXPOSE 4001
CMD ["node", "services/auth-service/dist/index.js"]
