# ElinosaAI — Solana Memecoin Intelligence Agent

> *Paste any Solana token address. Tell me your goal. I'll tell you what the data says.*

**ElinosaAI** is a conversational AI agent built on ElizaOS v2 and deployed on Nosana decentralized GPU infrastructure. It connects to live Solana on-chain APIs and delivers real data-backed analysis on any Solana memecoin — no hype, no opinions, just numbers.

Built for the **[Nosana x ElizaOS Builders Challenge](https://earn.superteam.fun/listings/bounty/nosana-builders-challenge-elizaos/)**.

---

## Live Demo

- 🌐 **Web UI:** [YOUR_NOSANA_DEPLOYMENT_URL]
- 🤖 **Telegram Bot:** [@ElinosaAIBot](https://t.me/ElinosaAIBot)
- 🐳 **Docker Image:** [0xdivine3/elinosaai](https://hub.docker.com/r/0xdivine3/elinosaai)

---

## LLM Configuration — Nosana or Groq

ElinosaAI is designed to work with **any OpenAI-compatible LLM endpoint**. The project was originally built for the Nosana-hosted Qwen3.5-27B endpoint, but also supports Groq (or any other provider) via a single `.env` change.

### Option A — Nosana Qwen endpoint (default, as required by challenge)

```env
OPENAI_API_KEY=nosana
OPENAI_API_URL=https://your-nosana-node.node.k8s.prd.nos.ci/v1
MODEL_NAME=Qwen/Qwen3.5-27B-AWQ-4bit
```

Get your Nosana endpoint from [deploy.nosana.com](https://deploy.nosana.com) after creating a deployment.

> **Note:** During development, the shared Nosana inference endpoint provided by the challenge (`4ksj3tve5bazq...`) returned persistent 503 errors. After confirming with the Nosana team, we switched to Groq for reliable LLM responses. The Nosana endpoint is still supported — just set it in `.env` and it will be used automatically.

### Option B — Groq (faster, free tier available)

```env
OPENAI_API_KEY=your_groq_api_key_here
OPENAI_API_URL=https://api.groq.com/openai
MODEL_NAME=llama-3.3-70b-versatile
```

Get a free Groq API key at [console.groq.com/keys](https://console.groq.com/keys).

### Option C — Any OpenAI-compatible provider

The agent uses the standard OpenAI chat completions format. Set `OPENAI_API_URL` to any compatible endpoint (OpenAI, Together, Fireworks, local Ollama, etc.) and set `MODEL_NAME` to the model you want to use.

---

## What It Does

ElinosaAI is a Solana memecoin intelligence agent with two interfaces (Web UI + Telegram) and three core capabilities.

### Token Analysis

Paste any Solana contract address and ElinosaAI fetches live data from two APIs simultaneously:

**From DexScreener (no API key needed):**
- Live price in USD
- 24h / 6h / 1h price change
- Liquidity depth in USD
- 24h trading volume
- Buy/sell transaction count and ratio
- Market cap and FDV
- Pair age (how long since launch)
- Direct DexScreener link

**From RugCheck.xyz (no API key needed):**
- Normalised risk score out of 1000
- Top 10 holder concentration (% of supply)
- LP locked and LP burned percentage
- Total holder count
- Insider wallet flags
- Red flags (mint authority active, low LP, high concentration, etc.)

After the report, ElinosaAI prompts:

```
What's your goal with this token?
A) 🟢 Thinking of buying
B) 🟡 Already holding
C) 🔴 Smells like a rug
D) 🔵 Just curious
```

### Goal-Based LLM Analysis

When the user replies A, B, C, or D — or asks any natural language follow-up — the full token data is injected into the LLM prompt and the model reasons over real numbers to give goal-specific advice.

### Whale & Sentiment Analysis

- **Whale check:** Top holder wallet breakdown, concentration risk, insider flags
- **Sentiment:** Buy/sell ratio, volume vs market cap, social links
- **Follow-up questions:** Ask anything about the token after scanning — the LLM has full context

---

## Example Interaction (Telegram)

```
User:  7tuPcPMUoDUxxb1j1NPjyjLXaqDwmxaW7mA2Y8Mbpump

Agent: BabyBull — Baby Bull
       📊 Price: $0.000136
       📈 24h: +300.00% | 6h: +25.56% | 1h: +34.39%
       💧 Liquidity: $31.0K
       📊 24h Volume: $1.28M
       💎 Market Cap: $135.8K
       🔄 Buys/Sells (24h): 15282 / 11851 (ratio 1.29)
       🕐 Pair Age: 20h

       🛡️ Risk Score: 16/1000 — 💀 DANGER
       🔒 LP Locked: 0.0% | LP Burned: 0.0%

       What's your goal with this token?
       A) 🟢 Thinking of buying
       B) 🟡 Already holding
       C) 🔴 Smells like a rug
       D) 🔵 Just curious

User:  what if i have already bought it

Agent: Considering you've already bought BabyBull, here are key points:
       • Price up 300% in 24h and 34% in the last hour — high volatility
       • Buy/sell ratio 1.29 with 15,282 buys shows buying pressure
       • Liquidity is only $31.0K — large sells will move price significantly
       • Risk score 16/1000 DANGER with LP locked at 0.0% — devs can exit anytime
       • Market cap $135.8K is very low — susceptible to manipulation
       DYOR.
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------| 
| Agent Framework | [ElizaOS v2](https://elizaos.com) | Core agent runtime, action system, character config |
| LLM | Groq llama-3.3-70b / Nosana Qwen3.5-27B | Conversational reasoning over token data |
| Compute | [Nosana](https://nosana.com) decentralized GPU | Container deployment on community-owned hardware |
| Token Data | [DexScreener API](https://dexscreener.com) | Live price, volume, liquidity (free, no key) |
| Rug Analysis | [RugCheck.xyz API](https://rugcheck.xyz) | Risk score, LP lock, holder analysis (free, no key) |
| Wallet Data | [Helius](https://helius.xyz) | Transaction history (free tier) |
| Web UI | Custom HTML/CSS/JS | Token scan dashboard with embedded chat |
| Telegram | Telegram Bot API | Long-polling bot interface |
| Runtime | Node.js 20 | Production container runtime |
| Container | Docker | Containerised deployment |

---

## Project Structure

```
agent-challenge/
├── src/
│   └── index.ts                          # Custom ElizaOS plugin — 3 actions
│       ├── ANALYZE_TOKEN                 # DexScreener + RugCheck parallel fetch
│       ├── CHECK_WALLET                  # Helius wallet activity lookup
│       └── GOAL_ANALYSIS                 # Goal-based token advice (A/B/C/D)
│
├── characters/
│   └── solbrief.character.json           # ElinosaAI personality and system prompt
│
├── telegram/
│   ├── bot.cjs                           # Telegram bot (CommonJS, production)
│   ├── conversation-handler.cjs          # LLM routing and token context logic
│   └── token-analyzer.cjs               # DexScreener + RugCheck data fetcher
│
├── public/
│   └── index.html                        # Web UI — token scanner + chat sidebar
│
├── nos_job_def/
│   └── nosana_eliza_job_definition.json  # Nosana deployment config
│
├── start-agent.mjs                       # Main launcher (web server + ElizaOS + Telegram)
├── Dockerfile                            # Production container (Node.js 20 slim)
├── .env.example                          # Environment variable template
├── package.json                          # Dependencies and scripts
└── README.md
```

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) v20+ and npm
- Git
- A free [Helius](https://helius.xyz) API key (for wallet lookups)
- A free [Groq](https://console.groq.com) API key **or** a Nosana inference endpoint
- Optional: Telegram bot token from [@BotFather](https://t.me/BotFather)

### 1. Fork and clone

```bash
git clone https://github.com/0xdivin3/agent-challenge
cd agent-challenge
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# LLM — choose Groq (recommended) or Nosana endpoint
OPENAI_API_KEY=your_groq_api_key_here
OPENAI_API_URL=https://api.groq.com/openai
MODEL_NAME=llama-3.3-70b-versatile

# OR use Nosana Qwen endpoint
# OPENAI_API_KEY=nosana
# OPENAI_API_URL=https://your-nosana-node.node.k8s.prd.nos.ci/v1
# MODEL_NAME=Qwen/Qwen3.5-27B-AWQ-4bit

# Required for wallet lookups (free at helius.xyz)
HELIUS_API_KEY=your_helius_key_here

# Optional — Telegram bot token from @BotFather
TELEGRAM_BOT_TOKEN=your_telegram_token_here

# Web UI port (default: 4000)
WEB_PORT=4000
SERVER_PORT=3000
NODE_ENV=development
```

### 4. Run the agent

```bash
node start-agent.mjs
```

Open **http://localhost:4000** in your browser and paste any Solana token address.

The Telegram bot starts automatically at the same time if `TELEGRAM_BOT_TOKEN` is set.

---

## Testing the Project

### Test 1 — Web UI Token Scan

1. Run `node start-agent.mjs` and open `http://localhost:4000`
2. Paste this address:
   ```
   EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```
   (USDC — a safe, known token good for testing)
3. Confirm you get a full scan with price, liquidity, risk score, holder data
4. Click **D — Just Curious** and confirm the LLM responds with analysis

### Test 2 — High Risk Token

1. Paste this address:
   ```
   7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHkv
   ```
2. Confirm the risk score shows HIGH RISK or DANGER
3. Click **C — Smells like a rug** and verify the LLM gives a rug breakdown

### Test 3 — Conversational Follow-up

1. After any token scan, type in the chat: `"will it grow?"`
2. Confirm the LLM responds using the actual token data (price, liquidity, score)

### Test 4 — Telegram Bot

1. Open [@ElinosaAIBot](https://t.me/ElinosaAIBot) on Telegram
2. Paste a Solana token address
3. Confirm the scan card arrives with all data
4. Reply `A` and confirm the buying analysis arrives
5. Ask a follow-up like `"who are the whales?"` — confirm whale data appears

### Test 5 — Invalid input handling

1. Send `hello` in the chat
2. Confirm the agent does NOT trigger a token scan (no false positives)

---

## Deployment on Nosana

### Prerequisites

- [Docker](https://docker.com) installed and running
- [Docker Hub](https://hub.docker.com) account
- Nosana account with credits: [deploy.nosana.com](https://deploy.nosana.com)

### 1. Build and push Docker image

```bash
docker build -t YOUR_DOCKERHUB_USERNAME/elinosaai:latest .
docker push YOUR_DOCKERHUB_USERNAME/elinosaai:latest
```

### 2. Update job definition

Edit `nos_job_def/nosana_eliza_job_definition.json`:

```json
{
  "version": "0.1",
  "type": "container",
  "ops": [
    {
      "type": "container/run",
      "id": "agent",
      "args": {
        "image": "YOUR_DOCKERHUB_USERNAME/elinosaai:latest",
        "expose": 3000,
        "gpu": false,
        "env": {
          "OPENAI_API_KEY": "your_groq_or_nosana_key",
          "OPENAI_API_URL": "https://api.groq.com/openai",
          "MODEL_NAME": "llama-3.3-70b-versatile",
          "HELIUS_API_KEY": "your_helius_key",
          "TELEGRAM_BOT_TOKEN": "your_telegram_token",
          "SERVER_PORT": "3000",
          "NODE_ENV": "production"
        }
      }
    }
  ]
}
```

### 3. Deploy via Nosana Dashboard

1. Go to [deploy.nosana.com](https://deploy.nosana.com)
2. Click **New Deployment**
3. Paste your job definition JSON into the editor
4. Select market **nvidia-3090**
5. Click **Create Deployment**
6. Copy the live URL from the deployment page

### 4. Deploy via Nosana CLI

```bash
npm install -g @nosana/cli
nosana job post \
  --file nos_job_def/nosana_eliza_job_definition.json \
  --market nvidia-3090 \
  --api YOUR_NOSANA_API_KEY \
  --timeout 60 \
  --wait
```

---

## APIs Used

| API | Endpoint | Purpose | Auth |
|-----|----------|---------|------|
| DexScreener | `api.dexscreener.com/latest/dex/tokens/{address}` | Price, volume, liquidity, pair age | None |
| RugCheck.xyz | `api.rugcheck.xyz/v1/tokens/{address}/report` | Risk score, holder analysis, LP data | None |
| Helius | `api.helius.xyz/v0/addresses/{wallet}/transactions` | Wallet transaction history | Free API key |
| Groq | `api.groq.com/openai/v1/chat/completions` | LLM reasoning (default) | Free API key |
| Nosana inference | Qwen3.5-27B endpoint | LLM reasoning (alternative) | Challenge credits |

---

## Judging Criteria Alignment

| Criteria | Weight | Implementation |
|----------|--------|---------------|
| Technical Implementation | 25% | TypeScript ElizaOS plugin with 3 typed actions, parallel API fetching, retry logic with backoff, full error handling, address validation regex |
| Nosana Integration | 25% | Node.js Dockerfile, Nosana job definition, supports both Nosana Qwen endpoint and Groq — configurable via `.env` |
| Usefulness & UX | 25% | Web dashboard + Telegram bot, goal-based A/B/C/D flow, conversational LLM follow-ups, whale analysis, sentiment signals |
| Creativity & Originality | 15% | Conversational rug-check agent with interactive goal selection and LLM reasoning over real on-chain numbers |
| Documentation | 10% | This README, `.env.example`, inline code comments, full setup and deployment guides, LLM provider options |

---

## Security Notes

- **No API keys are hardcoded** — all secrets loaded from environment variables at runtime
- **`.env` is gitignored** — never committed to the repository
- **DexScreener and RugCheck require no keys** — zero-friction token analysis
- **Helius and Groq free tiers** — no credit card required to run this project

---

## Disclaimer

ElinosaAI provides data from public APIs for informational purposes only. Nothing in this project constitutes financial advice. Memecoin trading is extremely high risk. Always Do Your Own Research (DYOR) before making any investment decisions.

---

*Built by [@0xdivin3](https://github.com/0xdivin3) — Nosana x ElizaOS Builders Challenge 2026*  
*Deployed on [Nosana](https://nosana.com) decentralized GPU infrastructure*
"# build trigger" 
