FROM node:20-slim

RUN apt-get update && apt-get install -y \
  python3 make g++ git curl \
  && rm -rf /var/lib/apt/lists/*

ENV ELIZAOS_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json ./
RUN npm install --ignore-scripts

# Copy source
COPY . .

RUN mkdir -p /app/data

EXPOSE 3000
ENV NODE_ENV=production
ENV SERVER_PORT=3000

# Secrets are passed at runtime via --env-file .env (NOT baked into image)
CMD ["node", "start-agent.mjs"]
