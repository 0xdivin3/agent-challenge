\# ElinosaAI — Solana Memecoin Intelligence Agent



> Paste any Solana token address. Tell me your goal. I'll tell you what the data says.



Built for the \*\*Nosana x ElizaOS Builders Challenge\*\* — running on decentralized GPU infrastructure.



\## Live Demo



\- Web UI: YOUR\_NOSANA\_DEPLOYMENT\_URL

\- Telegram: @ElinosaAI\_bot



\## What It Does



ElinosaAI is a conversational Solana intelligence agent. It connects to live on-chain APIs and gives you real data-backed analysis on any Solana memecoin — no hype, no opinions, just numbers.



\- \*\*Token Analysis\*\* — Paste any Solana contract address. Get live price, 24h volume, liquidity, buy/sell ratio, pair age, and rug pull risk score instantly.

\- \*\*Rug Pull Detection\*\* — Checks LP lock percentage, LP burn, top holder concentration, and mint authority via RugCheck.xyz.

\- \*\*Goal-Based Advice\*\* — After fetching token data, ElinosaAI asks your goal: buying, holding, rug checking, or just curious. Tailors analysis to your situation.

\- \*\*Wallet Activity\*\* — Look up recent transaction history for any Solana wallet address via Helius.

\- \*\*Telegram Bot\*\* — Full analysis available directly in Telegram. Paste an address, get instant results.



\## Tech Stack



| Layer | Technology |

|-------|-----------|

| Agent Framework | ElizaOS v2 |

| LLM | Qwen/Qwen3.5-4B via Nosana endpoint |

| Compute | Nosana decentralized GPU network |

| Token Data | DexScreener API (free, no key) |

| Rug Analysis | RugCheck.xyz API (free, no key) |

| Wallet Data | Helius (free tier) |

| Telegram | Long-polling bot via Telegram Bot API |

| Runtime | Bun |



\## Quick Start



\### 1. Clone and install

```bash

git clone https://github.com/YOUR\_USERNAME/agent-challenge

cd agent-challenge

bun install --ignore-scripts

```



\### 2. Configure environment

```bash

cp .env.example .env

```



Edit `.env` and add your keys:

```env

HELIUS\_API\_KEY=your\_key\_here        # free at helius.xyz

TELEGRAM\_BOT\_TOKEN=your\_token\_here  # optional, from @BotFather

```



\### 3. Run the agent

```bash

bun run dev

```



Open http://localhost:3000 and paste any Solana token address.



\### 4. Run Telegram bot (optional)

```bash

bun run telegram

```



\## Deployment on Nosana



\### 1. Build and push Docker image

```bash

docker build -t YOUR\_DOCKERHUB\_USERNAME/elinosaai:latest .

docker push YOUR\_DOCKERHUB\_USERNAME/elinosaai:latest

```



\### 2. Update job definition



Edit `nos\_job\_def/nosana\_eliza\_job\_definition.json` and replace `YOUR\_DOCKERHUB\_USERNAME`.



\### 3. Deploy

```bash

npm install -g @nosana/cli

nosana job submit --file nos\_job\_def/nosana\_eliza\_job\_definition.json --market nvidia-3090

```



\## APIs Used



| API | Purpose | Cost |

|-----|---------|------|

| DexScreener | Price, volume, liquidity, pair age | Free |

| RugCheck.xyz | Risk score, LP lock, holder analysis | Free |

| Helius | Wallet transaction history | Free tier |

| Nosana inference | Qwen LLM | Free via challenge credits |



\## Disclaimer



ElinosaAI provides data from public APIs for informational purposes only. Nothing here is financial advice. Always DYOR.



\---



\*Built by \[@YOUR\_GITHUB\_USERNAME](https://github.com/YOUR\_GITHUB\_USERNAME) — Nosana x ElizaOS Builders Challenge 2026\*  

\*Running on \[Nosana](https://nosana.com) decentralized GPU infrastructure\*

