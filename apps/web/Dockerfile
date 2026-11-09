FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @bitsburg/web...
COPY apps/web apps/web
ARG VITE_DD_RUM_APP_ID
ARG VITE_DD_RUM_CLIENT_TOKEN
ARG VITE_DD_SITE
ARG VITE_APP_VERSION_STABLE=3.4.2
ARG VITE_APP_VERSION_NEW=3.5.0
ENV VITE_DD_RUM_APP_ID=${VITE_DD_RUM_APP_ID} \
    VITE_DD_RUM_CLIENT_TOKEN=${VITE_DD_RUM_CLIENT_TOKEN} \
    VITE_DD_SITE=${VITE_DD_SITE} \
    VITE_APP_VERSION_STABLE=${VITE_APP_VERSION_STABLE} \
    VITE_APP_VERSION_NEW=${VITE_APP_VERSION_NEW}
RUN pnpm --filter @bitsburg/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
