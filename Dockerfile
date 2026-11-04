FROM node:24-alpine AS builder

WORKDIR /budgetapp

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /budgetapp

COPY --from=builder /budgetapp/package.json ./package.json
COPY --from=builder /budgetapp/node_modules ./node_modules
COPY --from=builder /budgetapp/dist ./dist
COPY vite.*.ts ./
COPY svelte.config.js ./
# The preview server serves the SQLite API, so the server code ships with it.
# node-sqlite3-wasm is WASM, so there is no native build step on Alpine.
COPY server ./server

RUN mkdir -p data
VOLUME ["/budgetapp/data"]

# node:*-alpine ships no timezone data, so without tzdata the process silently
# runs in UTC and a "00:00" backup lands mid-morning anywhere east of London.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Singapore

# data/transdash.backup.sql is rewritten daily at BACKUP_HOUR in TZ above;
# see docs/BACKUPS.md. It lands in data/, the mounted volume, so it survives
# the container. Set BACKUP_SCHEDULE=0 if an external scheduler drives it.
ENV BACKUP_HOUR=0
ENV BACKUP_SCHEDULE=1

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]

