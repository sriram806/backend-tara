FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @thinkai/config build
RUN pnpm --filter @thinkai/db build
RUN pnpm --filter @thinkai/billing-service build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/billing-service/node_modules ./services/billing-service/node_modules
COPY --from=builder /app/services/billing-service/dist ./services/billing-service/dist

USER node

EXPOSE 4010
CMD ["node", "services/billing-service/dist/index.js"]
