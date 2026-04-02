# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# better-sqlite3 requires native compilation tools
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./src/db/migrations

RUN mkdir -p /app/data

ENV DB_PATH=/app/data/prism.db
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
