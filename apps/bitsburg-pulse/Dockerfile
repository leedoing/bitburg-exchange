# Bitsburg Pulse dev server for the shared demo URL (EC2 :8080). Datadog keys come from the environment only.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV PULSE_PUBLIC=1
EXPOSE 5173
CMD ["npx", "datadog-apps", "dev"]
