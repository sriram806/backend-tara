FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @thinkai/config build
RUN pnpm --filter @thinkai/types build
RUN pnpm --filter @thinkai/db build
RUN pnpm --filter @thinkai/auth-service build

EXPOSE 4001
CMD ["pnpm", "--filter", "@thinkai/auth-service", "start"]
