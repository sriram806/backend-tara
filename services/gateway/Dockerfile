FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @thinkai/config build
RUN pnpm --filter @thinkai/types build
RUN pnpm --filter @thinkai/db build
RUN pnpm --filter @thinkai/gateway build

EXPOSE 4000
CMD ["pnpm", "--filter", "@thinkai/gateway", "start"]
