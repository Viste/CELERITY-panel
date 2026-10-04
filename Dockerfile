# Hysteria Backend - Docker Image
FROM golang:alpine AS agent
WORKDIR /src
COPY cc-agent/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/cc-agent-linux-amd64 . \
 && CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/cc-agent-freebsd-amd64 .

# mieru ships no FreeBSD package: FreeBSD nodes download this build from the panel.
# Keep the version in step with MITA_VERSION in src/services/nodeSetup.js.
FROM golang:alpine AS mita
ARG MITA_VERSION=3.38.0
RUN CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 go install -trimpath -ldflags='-s -w' github.com/enfein/mieru/v3/cmd/mita@v${MITA_VERSION} \
 && mkdir -p /out && cp /go/bin/freebsd_amd64/mita /out/mita-freebsd-amd64

FROM node:20-alpine

WORKDIR /app

# System dependencies: mongodb-tools for backups. The access-logs pipeline now
# talks to an external ClickHouse over HTTP (pure-JS client), so no native
# runtime libraries are needed.
RUN apk add --no-cache mongodb-tools

# Копируем зависимости
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --omit=dev

# Копируем исходники
COPY . .
COPY --from=agent /out/ ./public/agents/
COPY --from=mita /out/ ./public/agents/

# Create directories for logs, certificates, backups and access-logs data.
RUN mkdir -p logs greenlock.d/live greenlock.d/accounts backups data/access-logs && \
    chmod -R 755 greenlock.d backups data

# Порты
EXPOSE 8444 80 443

# Запуск
CMD ["node", "index.js"]

