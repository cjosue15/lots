# STAGE 1 : BUILD
FROM node:26.13.1-alpine AS build 

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN npm install -g pnpm@12.21.0

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# STAGE 2 : CADDY AND SERVE

FROM caddy:2-alpine

COPY --from=build /app/dist/web/browser /app

COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80