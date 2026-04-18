FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @thinkai/config build
RUN pnpm --filter @thinkai/db build
RUN pnpm --filter @thinkai/interview-service build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/interview-service/node_modules ./services/interview-service/node_modules
COPY --from=builder /app/services/interview-service/dist ./services/interview-service/dist

USER node

EXPOSE 4013
CMD ["node", "services/interview-service/dist/index.js"]
