# ElinosaAI — Solana Memecoin Intelligence Agent

> *Paste any Solana token address. Tell me your goal. I'll tell you what the data says.*

**ElinosaAI** is a conversational AI agent built on ElizaOS v2 and deployed on Nosana decentralized GPU infrastructure. It connects to live Solana on-chain APIs and delivers real data-backed analysis on any Solana memecoin — no hype, no opinions, just numbers.

Built for the **[Nosana x ElizaOS Builders Challenge](https://earn.superteam.fun/listings/bounty/nosana-builders-challenge-elizaos/)**.

---

## Live Demo

- 🌐 **Web UI:** [YOUR_NOSANA_DEPLOYMENT_URL]
- 🤖 **Telegram Bot:** [@ElinosaAI_bot](https://t.me/ElinosaAI_bot)
- 🐳 **Docker Image:** [0xdivine3/elinosaai](https://hub.docker.com/r/0xdivine3/elinosaai)

---

## What It Does

ElinosaAI is a Solana memecoin intelligence agent with three core capabilities and two interfaces (Web + Telegram).

### Token Analysis (`ANALYZE_TOKEN`)

Paste any Solana contract address and ElinosaAI fetches live data from two APIs simultaneously:

**From DexScreener:**
- Live price in USD
- 24h / 6h / 1h price change
- Liquidity depth in USD
- 24h trading volume
- Buy/sell transaction count and ratio
- Market cap and FDV
- Pair age (how long since the token launched)
- Direct DexScreener link

**From RugCheck.xyz:**
- Normalised risk score out of 1000
- Top 10 holder concentration (% of supply)
- LP locked percentage and LP burned percentage
- Total holder count
- Insider wallet flags
- Specific red flags (mint authority active, low LP, high concentration, etc.)

After delivering the full report, ElinosaAI prompts the user with a goal selection:

```
What's your goal with this token?
A) 🟢 Thinking of buying — want entry analysis
B) 🟡 Already holding — want exit signals
C) 🔴 Smells like a rug — want a safety breakdown
D) 🔵 Just curious about the project
```

### Goal-Based Analysis (`GOAL_ANALYSIS`)

When the user replies A, B, C, or D, ElinosaAI delivers tailored analysis:

- **A (Buying):** Green lights to look for, red flags to avoid, entry sizing strategy
- **B (Holding):** Exit signal indicators, distribution phase patterns, profit-taking strategy
- **C (Rug Check):** Breakdown of the 5 most important rug pull indicators and what to do
- **D (Curious):** How to read market cap, liquidity, volume, and pair age — plus how to research further

### Wallet Activity (`CHECK_WALLET`)

Send any Solana wallet address with a keyword like "check wallet" and ElinosaAI fetches the last 10 transactions via Helius, summarising transaction types and activity patterns.

---

## Example Interaction

```
User:  7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHkv

Agent: 🔍 Analyzing 7xKXtg2C... — fetching live data from DexScreener and RugCheck...

       **$GOAT — Goat Token**

       📊 Price: $4.2000e-4
       📈 24h: +18.40% | 6h: +6.10% | 1h: +2.30%
       💧 Liquidity: $284.1K
       📉 24h Volume: $1.2M
       🔄 Buy/Sell Ratio: 1.30 (312 buys / 241 sells)
       💎 Market Cap: $420.0K
       🕐 Pair Age: 3d 4h
       🔗 DexScreener: https://dexscreener.com/solana/...

       🛡️ Risk Score: 342/1000 — 🔴 HIGH RISK
       👥 Top 10 Holders: 67.3% of supply
       🔒 LP Locked: 0% | LP Burned: 12.0%
       👤 Total Holders: 4,821

       🚩 Red Flags:
       🔴 Mint authority: still active — devs can print unlimited tokens
       🟡 High concentration: top 10 holders above 60%

       ---
       What's your goal with this token?
       A) 🟢 Thinking of buying
       B) 🟡 Already holding
       C) 🔴 Rug safety check
       D) 🔵 Just curious

User:  A

Agent: 🟢 Goal: Thinking of Buying

       Before you enter, here's what the data says to check:

       ✅ Green lights to look for:
       • Risk score above 700/1000
       • LP locked or burned (not zero)
       • Top 10 holders below 40% of supply
       ...
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Agent Framework | [ElizaOS v2](https://elizaos.com) | Core agent runtime, action system, character config |
| LLM | Qwen/Qwen3.5-4B | Conversational responses via Nosana endpoint |
| Compute | [Nosana](https://nosana.com) decentralized GPU | Inference on community-owned hardware |
| Token Data | [DexScreener API](https://dexscreener.com) | Live price, volume, liquidity (free, no key needed) |
| Rug Analysis | [RugCheck.xyz API](https://rugcheck.xyz) | Risk score, LP lock, holder analysis (free, no key needed) |
| Wallet Data | [Helius](https://helius.xyz) | Transaction history (free tier — 100K req/mo) |
| Telegram | Telegram Bot API | Long-polling bot interface |
| Runtime | [Node.js](https://nodejs.org) | Production container runtime |
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
│   └── solbrief.character.json           # ElinosaAI personality, system prompt, knowledge
│
├── telegram/
│   ├── bot.ts                            # Telegram bot (TypeScript source)
│   └── bot.cjs                           # Compiled bot (CommonJS, ready to run)
│
├── public/
│   └── index.html                        # Web UI landing page
│
├── nos_job_def/
│   └── nosana_eliza_job_definition.json  # Nosana deployment config
│
├── Dockerfile                            # Production container (Node.js-based)
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
- Optional: Telegram bot token from [@BotFather](https://t.me/BotFather)

### 1. Fork and clone

First, fork this repo on GitHub, then:

```bash
git clone https://github.com/YOUR_USERNAME/agent-challenge
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

Edit `.env` — the Nosana LLM endpoint is pre-configured. You only need to add your own keys:

```env
# Pre-configured — Nosana Qwen endpoint (no changes needed)
OPENAI_API_KEY=nosana
OPENAI_API_URL=https://4ksj3tve5bazqwkuyqdhwdpcar4yutcuxphwhckrdxmu.node.k8s.prd.nos.ci/v1
MODEL_NAME=Qwen/Qwen3.5-4B

# Add your own keys below
HELIUS_API_KEY=your_key_here        # Free at helius.xyz — needed for wallet lookups
TELEGRAM_BOT_TOKEN=your_token_here  # Optional — from @BotFather on Telegram
```

### 4. Run the agent

```bash
npm start
```

Open **http://localhost:3000** in your browser and paste any Solana token address.

### 5. Run the Telegram bot (optional)

In a separate terminal:

```bash
npm run telegram
```

Then open your bot in Telegram and send `/start`.

---

## Testing the Project

### Test 1 — Token Analysis (Web UI)

1. Run `npm start` and open `http://localhost:3000`
2. Paste this real Solana token address into the chat:
   ```
   EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```
   (This is USDC — a safe, well-known token good for testing)
3. You should receive a full report: price, liquidity, volume, risk score, holder data
4. Reply `D` and confirm you get the "Just Curious" goal analysis

### Test 2 — Rug Check on a risky token

1. Paste this address into the chat:
   ```
   7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHkv
   ```
2. Confirm the risk score is flagged as HIGH RISK or DANGER
3. Reply `C` and verify you get the full rug safety breakdown

### Test 3 — Wallet Activity

1. Send this message in the chat:
   ```
   check wallet 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
   ```
2. Confirm you get a transaction type summary (requires HELIUS_API_KEY in .env)

### Test 4 — Telegram Bot

1. Run `npm run telegram` in a second terminal
2. Open your bot in Telegram and send `/start`
3. Paste the USDC address above
4. Confirm the full report arrives in Telegram
5. Reply `A` and confirm the buying analysis arrives

### Test 5 — Invalid address handling

1. Send `hello` or `not-an-address` in the chat
2. Confirm the agent does NOT trigger token analysis (no false positives)

---

## How to Use

### Web Interface

1. Open `http://localhost:3000`
2. Paste any Solana token contract address into the chat
3. ElinosaAI fetches live data and returns a full report
4. Reply **A**, **B**, **C**, or **D** to get goal-tailored analysis

### Telegram

1. Start the agent with `npm start`
2. In a second terminal, run `npm run telegram`
3. Open your bot in Telegram
4. Send `/start` for instructions
5. Paste any Solana contract address
6. Reply A, B, C, or D after the report

### Commands (Telegram)

| Command | Description |
|---------|-------------|
| `/start` | Introduction and usage instructions |
| `/help` | List all available commands |
| `<token address>` | Full token analysis with rug check |
| `check wallet <address>` | Wallet transaction activity |
| `A` / `B` / `C` / `D` | Goal-based follow-up analysis |

---

## Deployment on Nosana

### Prerequisites

- [Docker](https://docker.com) installed
- [Docker Hub](https://hub.docker.com) account
- [Nosana CLI](https://docs.nosana.com/cli) installed: `npm install -g @nosana/cli`
- Nosana builder credits: [nosana.com/builders-credits](https://nosana.com/builders-credits)

### 1. Build and push Docker image

```bash
docker build -t YOUR_DOCKERHUB_USERNAME/elinosaai:latest .
docker push YOUR_DOCKERHUB_USERNAME/elinosaai:latest
```

### 2. Update Nosana job definition

Edit `nos_job_def/nosana_eliza_job_definition.json` and update:
- `image` → your Docker Hub image name
- `HELIUS_API_KEY` → your Helius API key
- `TELEGRAM_BOT_TOKEN` → your Telegram bot token

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
        "env": {
          "OPENAI_API_KEY": "nosana",
          "OPENAI_API_URL": "https://4ksj3tve5bazqwkuyqdhwdpcar4yutcuxphwhckrdxmu.node.k8s.prd.nos.ci/v1",
          "MODEL_NAME": "Qwen/Qwen3.5-4B",
          "HELIUS_API_KEY": "your_key",
          "TELEGRAM_BOT_TOKEN": "your_token",
          "SERVER_PORT": "3000",
          "NODE_ENV": "production"
        }
      }
    }
  ]
}
```

### 3. Deploy

```bash
nosana job post \
  --file nos_job_def/nosana_eliza_job_definition.json \
  --market nvidia-3090 \
  --api YOUR_NOSANA_API_KEY \
  --timeout 30 \
  --wait
```

Your live URL will be printed after deployment completes.

---

## Custom ElizaOS Plugin

The core intelligence lives in `src/index.ts` — a custom ElizaOS plugin with three actions:

### `ANALYZE_TOKEN`
- **Trigger:** Any message containing a Solana base58 address (32-44 chars)
- **Validation:** Regex check for valid Solana address format
- **Process:** Parallel fetch from DexScreener + RugCheck APIs
- **Output:** Structured report with price data, safety metrics, and red flags
- **Error handling:** Graceful fallback if either API is unavailable

### `CHECK_WALLET`
- **Trigger:** Messages containing "wallet", "address", "activity", or "transactions" + a valid address
- **Process:** Helius API fetch for last 10 transactions
- **Output:** Transaction type summary (e.g. "4x SWAP, 3x TRANSFER, 2x NFT_SALE")

### `GOAL_ANALYSIS`
- **Trigger:** Single letter A, B, C, D — or written equivalents (buy, hold, rug, curious)
- **Output:** Detailed, goal-specific guidance based on what the data showed

---

## APIs Used

| API | Endpoint | Purpose | Auth Required |
|-----|----------|---------|--------------|
| DexScreener | `api.dexscreener.com/latest/dex/tokens/{address}` | Price, volume, liquidity, pair age | None |
| RugCheck.xyz | `api.rugcheck.xyz/v1/tokens/{address}/report/summary` | Risk score, holder analysis, LP data | None |
| Helius | `api.helius.xyz/v0/addresses/{wallet}/transactions` | Wallet transaction history | Free API key |
| Nosana inference | Qwen/Qwen3.5-4B endpoint | LLM responses | Challenge credits |

---

## Judging Criteria Alignment

| Criteria | Weight | Implementation |
|----------|--------|---------------|
| Technical Implementation | 25% | TypeScript plugin with 3 typed actions, proper ElizaOS interfaces, parallel API fetching, full error handling, address validation |
| Nosana Integration | 25% | Node.js-based Dockerfile, Nosana job definition, Qwen/Qwen3.5-4B via Nosana OpenAI-compatible endpoint |
| Usefulness & UX | 25% | Web UI + Telegram bot, goal-based A/B/C/D flow, real on-chain data, practical memecoin use case |
| Creativity & Originality | 15% | Conversational rug-check agent with interactive goal selection — not a generic chatbot |
| Documentation | 10% | This README, `.env.example`, inline code comments, setup and deployment guides |

---

## Security Notes

- **No API keys are hardcoded** — all secrets are loaded from environment variables
- **`.env` is gitignored** — never committed to the repository
- **DexScreener and RugCheck require no keys** — zero-friction token analysis
- **Helius free tier** — 100,000 requests per month, no credit card required

---

## Disclaimer

ElinosaAI provides data from public APIs for informational purposes only. Nothing in this project constitutes financial advice. Memecoin trading is extremely high risk. Always Do Your Own Research (DYOR) before making any investment decisions.

---

*Built by [@0xdivin3](https://github.com/0xdivin3) — Nosana x ElizaOS Builders Challenge 2026*
*Running on [Nosana](https://nosana.com) decentralized GPU infrastructure*
