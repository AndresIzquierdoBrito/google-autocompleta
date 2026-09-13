FROM node:22-bookworm-slim AS build

ENV CI=1
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.16.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/client/package.json apps/client/package.json
RUN pnpm install --frozen-lockfile --filter google-autocompleta-client...

COPY apps/client apps/client
RUN pnpm --dir apps/client build:web

FROM nginx:1.29-alpine AS runtime

COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/web-build /usr/share/nginx/html

EXPOSE 80
