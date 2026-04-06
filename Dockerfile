# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base

RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  git \
  curl \
  && rm -rf /var/lib/apt/lists/*

ENV ELIZAOS_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1

WORKDIR /app

COPY package.json ./
RUN bun install --ignore-scripts

COPY . .

RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV SERVER_PORT=3000

CMD ["bun", "run", "start"]