FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY services/package.json services/
RUN pnpm install --frozen-lockfile --filter @bitsburg/services...
COPY services services
RUN pnpm --filter @bitsburg/services build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/services
CMD ["sh", "-c", "exec node --require dd-trace/init dist/${SERVICE_DIR}/src/index.js"]
