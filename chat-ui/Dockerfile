# ── Stage 1: build React/Vite frontend ───────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: production — Express serves API + static files ──────
FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY server.js .
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "server.js"]
