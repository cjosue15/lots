FROM node:26.13.1-alpine

 RUN npm install -g pnpm@12.21.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate && pnpm build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "dist/main.js"]
