# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base

# Install system dependencies needed for native modules (e.g. better-sqlite3)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  git \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Disable telemetry
ENV ELIZAOS_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1

WORKDIR /app

# Install elizaos CLI globally
RUN bun install -g @elizaos/cli

# Copy package manifest and lockfile, then install dependencies
COPY package.json bun.lock* ./
RUN bun install --ignore-scripts

# Copy all source files
COPY . .

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV SERVER_PORT=3000

CMD ["bun", "run", "start"]
