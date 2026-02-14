FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY tsconfig*.json ./
COPY prisma.config.ts ./
COPY src ./src
COPY prisma ./prisma
COPY scripts ./scripts

RUN DATABASE_URL=postgresql://privatechat:privatechat@postgres:5432/privatechat npx prisma generate && npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "./scripts/start.sh"]
