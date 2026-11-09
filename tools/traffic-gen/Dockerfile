FROM mcr.microsoft.com/playwright:v1.65.0-noble
WORKDIR /app
RUN npm install -g pnpm@10.18.3
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY tools/traffic-gen/package.json tools/traffic-gen/
RUN pnpm install --frozen-lockfile --filter @bitsburg/traffic-gen...
COPY tools/traffic-gen tools/traffic-gen
WORKDIR /app/tools/traffic-gen
CMD ["sh", "-c", "exec node --import tsx src/index.ts --mode ${TRAFFIC_MODE} --concurrency ${TRAFFIC_CONCURRENCY} --duration ${TRAFFIC_DURATION} --target ${TRAFFIC_TARGET}"]
