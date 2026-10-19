FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@9.0.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter api... --filter web...
RUN pnpm --filter @inspect-hub/database build
RUN pnpm --filter api build
ARG VITE_BASE_PATH=/inspect-hub/
ARG VITE_API_URL=/inspect-hub/api
ENV VITE_BASE_PATH=$VITE_BASE_PATH VITE_API_URL=$VITE_API_URL
RUN pnpm --filter web build

FROM build AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM nginx:1.28-alpine AS web
COPY deployment/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
