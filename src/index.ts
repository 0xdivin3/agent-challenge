/**
 * ElinosaAI Custom Plugin
 *
 * Adds three actions to the ElinosaAI agent:
 *   1. ANALYZE_TOKEN  — fetches live price, volume, liquidity (DexScreener)
 *                       + rug risk score (RugCheck.xyz) for any Solana token address
 *   2. CHECK_WALLET   — fetches recent transaction activity for a Solana wallet (Helius)
 *   3. GOAL_ANALYSIS  — provides goal-based interpretation after token data is fetched
 *
 * All APIs used here are FREE with no key required except Helius (free tier).
 */

import { type Plugin, type IAgentRuntime, type Memory, type State, type HandlerCallback } from "@elizaos/core";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DexPair {
  chainId: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  txns: { h24: { buys: number; sells: number } };
  volume: { h24: number };
  priceChange: { h24: number; h6: number; h1: number };
  liquidity: { usd: number };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  url: string;
}

interface RugRisk {
  name: string;
  description: string;
  level: "danger" | "warning" | "info";
}

interface RugCheckReport {
  score_normalised: number;
  rugged: boolean;
  risks: RugRisk[];
  markets?: Array<{ lp?: { lpLockedPct: number; lpBurnedPct: number } }>;
  topHolders?: Array<{ pct: number; insider: boolean }>;
  totalHolders?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the string looks like a Solana base58 address */
function isSolanaAddress(text: string): boolean {
  const trimmed = text.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
}

/** Extracts the first Solana-looking address from a message */
function extractAddress(text: string): string | null {
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match ? match[0] : null;
}

/** Formats a USD number into a readable string e.g. $1.2M, $284K */
function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Formats a price change into a colored arrow string */
function formatChange(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** Derives a risk verdict from a rug check score */
function getVerdict(score: number, rugged: boolean): string {
  if (rugged) return "🚨 RUGGED";
  if (score >= 800) return "✅ GOOD";
  if (score >= 500) return "⚠️ CAUTION";
  if (score >= 200) return "🔴 HIGH RISK";
  return "💀 DANGER";
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function fetchDexScreener(address: string): Promise<DexPair | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    const solanaPairs: DexPair[] = (data.pairs ?? []).filter(
      (p: DexPair) => p.chainId === "solana"
    );
    if (solanaPairs.length === 0) return null;
    return solanaPairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  } catch {
    return null;
  }
}

async function fetchRugCheck(address: string): Promise<RugCheckReport | null> {
  try {
    const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchHeliusActivity(walletAddress: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=10`
    );
    if (!res.ok) return `Helius returned ${res.status}`;
    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) return "No recent transactions found.";

    const typeCounts: Record<string, number> = {};
    txs.forEach((tx: { type?: string }) => {
      const t = tx.type ?? "UNKNOWN";
      typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    });

    const summary = Object.entries(typeCounts)
      .map(([type, count]) => `${count}x ${type}`)
      .join(", ");

    return `Last ${txs.length} transactions: ${summary}`;
  } catch (e) {
    return `Failed to fetch: ${(e as Error).message}`;
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * ANALYZE_TOKEN
 * Triggered when the user's message contains a Solana token address.
 * Fetches DexScreener + RugCheck data and formats a structured report.
 */
const analyzeTokenAction = {
  name: "ANALYZE_TOKEN",
  description:
    "Analyzes a Solana token by its contract address. Fetches live price, volume, liquidity from DexScreener and rug pull risk data from RugCheck.xyz.",
  similes: [
    "CHECK_TOKEN",
    "TOKEN_INFO",
    "MEMECOIN_CHECK",
    "SCAN_TOKEN",
    "LOOKUP_TOKEN",
    "ANALYZE_COIN",
  ],

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const text = message.content?.text ?? "";
    return extractAddress(text) !== null;
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | void | undefined> => {
    const text = message.content?.text ?? "";
    const address = extractAddress(text);

    if (!address) {
      callback?.({ text: "I couldn't find a valid Solana token address in your message." });
      return { success: false, error: "invalid address" };
    }

    callback?.({ text: `🔍 Analyzing \`${address.slice(0, 8)}...\` — fetching live data from DexScreener and RugCheck...` });

    const [dex, rug] = await Promise.all([
      fetchDexScreener(address),
      fetchRugCheck(address),
    ]);

    // ── Build report ──
    const lines: string[] = [];

    if (!dex) {
      lines.push(`⚠️ **No Solana trading pairs found** for this address on DexScreener.`);
      lines.push(`This token may not be listed yet, or the address may be incorrect.`);
    } else {
      const ageMs = Date.now() - (dex.pairCreatedAt ?? 0);
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      const ageStr = ageDays > 0 ? `${ageDays}d ${ageHours % 24}h` : `${ageHours}h`;

      const buysSells = dex.txns?.h24;
      const ratio =
        buysSells && buysSells.sells > 0
          ? (buysSells.buys / buysSells.sells).toFixed(2)
          : "N/A";

      lines.push(`**$${dex.baseToken.symbol} — ${dex.baseToken.name}**`);
      lines.push(``);
      lines.push(`📊 **Price:** $${parseFloat(dex.priceUsd ?? "0").toExponential(4)}`);
      lines.push(`📈 **24h Change:** ${formatChange(dex.priceChange?.h24 ?? 0)} | 6h: ${formatChange(dex.priceChange?.h6 ?? 0)} | 1h: ${formatChange(dex.priceChange?.h1 ?? 0)}`);
      lines.push(`💧 **Liquidity:** ${formatUsd(dex.liquidity?.usd ?? 0)}`);
      lines.push(`📉 **24h Volume:** ${formatUsd(dex.volume?.h24 ?? 0)}`);
      lines.push(`🔄 **Buy/Sell Ratio (24h):** ${ratio} (${buysSells?.buys ?? 0} buys / ${buysSells?.sells ?? 0} sells)`);
      lines.push(`💎 **Market Cap:** ${formatUsd(dex.marketCap ?? 0)}`);
      lines.push(`🕐 **Pair Age:** ${ageStr}`);
      lines.push(`🔗 **DexScreener:** ${dex.url}`);
    }

    lines.push(``);

    if (!rug) {
      lines.push(`🛡️ **RugCheck:** Unable to fetch safety data for this token.`);
    } else {
      const score = rug.score_normalised ?? 0;
      const verdict = getVerdict(score, rug.rugged);
      const top10Pct = rug.topHolders
        ? rug.topHolders.slice(0, 10).reduce((s, h) => s + (h.pct ?? 0), 0).toFixed(1)
        : "N/A";
      const lpLocked = rug.markets?.[0]?.lp?.lpLockedPct ?? 0;
      const lpBurned = rug.markets?.[0]?.lp?.lpBurnedPct ?? 0;
      const hasInsiders = rug.topHolders?.some((h) => h.insider) ?? false;

      lines.push(`🛡️ **Risk Score:** ${score}/1000 — ${verdict}`);
      lines.push(`👥 **Top 10 Holders:** ${top10Pct}% of supply`);
      lines.push(`🔒 **LP Locked:** ${lpLocked.toFixed(1)}% | **LP Burned:** ${lpBurned.toFixed(1)}%`);
      lines.push(`👤 **Total Holders:** ${rug.totalHolders ?? "N/A"}`);
      if (hasInsiders) lines.push(`⚠️ **Insider wallets detected** in top holders`);

      // Red flags
      const redFlags = (rug.risks ?? [])
        .filter((r) => r.level === "danger" || r.level === "warning")
        .slice(0, 4);

      if (redFlags.length > 0) {
        lines.push(``);
        lines.push(`🚩 **Red Flags:**`);
        redFlags.forEach((r) => {
          const icon = r.level === "danger" ? "🔴" : "🟡";
          lines.push(`${icon} ${r.name}: ${r.description}`);
        });
      }
    }

    lines.push(``);
    lines.push(`---`);
    lines.push(`**What's your goal with this token?**`);
    lines.push(`A) 🟢 Thinking of buying — want entry analysis`);
    lines.push(`B) 🟡 Already holding — want exit signals`);
    lines.push(`C) 🔴 Smells like a rug — want a safety breakdown`);
    lines.push(`D) 🔵 Just curious about the project`);
    lines.push(``);
    lines.push(`_Reply with A, B, C, or D and I'll tailor my analysis to your situation. DYOR — this is data, not financial advice._`);

    callback?.({ text: lines.join("\n") });
    return { success: true };
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHkv" },
      },
      {
        name: "ElinosaAI",
        content: {
          text: "Fetching live data on that token now...",
        },
      },
    ],
  ],
};

/**
 * CHECK_WALLET
 * Triggered when user explicitly asks to check a wallet address.
 */
const checkWalletAction = {
  name: "CHECK_WALLET",
  description:
    "Fetches recent transaction activity for a Solana wallet address using the Helius API.",
  similes: [
    "WALLET_ACTIVITY",
    "WALLET_CHECK",
    "WALLET_HISTORY",
    "CHECK_ADDRESS",
    "WALLET_LOOKUP",
  ],

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const text = (message.content?.text ?? "").toLowerCase();
    const hasWalletKeyword =
      text.includes("wallet") ||
      text.includes("address") ||
      text.includes("activity") ||
      text.includes("transactions");
    const address = extractAddress(message.content?.text ?? "");
    return hasWalletKeyword && address !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | void | undefined> => {
    const text = message.content?.text ?? "";
    const address = extractAddress(text);

    if (!address) {
      callback?.({ text: "Please provide a valid Solana wallet address." });
      return { success: false, error: "invalid address" };
    }

    const apiKey = String(runtime.getSetting("HELIUS_API_KEY") ?? process.env.HELIUS_API_KEY ?? "");

    if (!apiKey) {
      callback?.({
        text: `⚠️ Wallet activity lookup requires a Helius API key.\n\nAdd \`HELIUS_API_KEY=your_key\` to your .env file.\nGet a free key at https://helius.xyz (100K requests/month free).`,
      });
      return { success: false, error: "missing API key" };
    }

    callback?.({ text: `🔍 Fetching wallet activity for \`${address.slice(0, 8)}...\`...` });

    const summary = await fetchHeliusActivity(address, apiKey);

    const lines = [
      `**Wallet Activity Report**`,
      `📍 Address: \`${address.slice(0, 8)}...${address.slice(-4)}\``,
      ``,
      summary,
      ``,
      `_Want me to analyze a specific token this wallet is trading? Paste the token address._`,
    ];

    callback?.({ text: lines.join("\n") });
    return { success: true };
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Check wallet activity for 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" },
      },
      {
        name: "ElinosaAI",
        content: { text: "Fetching wallet activity..." },
      },
    ],
  ],
};

/**
 * GOAL_ANALYSIS
 * Triggered when user replies A / B / C / D after a token scan.
 * Provides goal-tailored analysis based on the data already shown.
 */
const goalAnalysisAction = {
  name: "GOAL_ANALYSIS",
  description:
    "Provides goal-based analysis when user replies A (buy), B (hold), C (rug check), or D (curious) after a token scan.",
  similes: ["GOAL_RESPONSE", "TOKEN_GOAL", "ANALYZE_GOAL", "INVESTMENT_GOAL"],

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const text = (message.content?.text ?? "").trim().toUpperCase();
    // Match single letter A/B/C/D or written out versions
    return /^[ABCD]$/.test(text) ||
      /^(BUY|BUYING|HOLD|HOLDING|RUG|CURIOUS|JUST CURIOUS)$/i.test(text);
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | void | undefined> => {
    const raw = (message.content?.text ?? "").trim().toUpperCase();

    // Normalize to A/B/C/D
    let goal = raw;
    if (/BUY/i.test(raw)) goal = "A";
    if (/HOLD/i.test(raw)) goal = "B";
    if (/RUG/i.test(raw)) goal = "C";
    if (/CURIOUS/i.test(raw)) goal = "D";

    const responses: Record<string, string> = {
      A: [
        `🟢 **Goal: Thinking of Buying**`,
        ``,
        `Before you enter, here's what the data says to check:`,
        ``,
        `**✅ Green lights to look for:**`,
        `• Risk score above 700/1000`,
        `• LP locked or burned (not zero)`,
        `• Top 10 holders below 40% of supply`,
        `• Mint authority revoked`,
        `• Buy/sell ratio above 1.2 (more buyers than sellers)`,
        `• Token age over 48 hours (survived the first dump)`,
        ``,
        `**🚩 Red flags to avoid:**`,
        `• Risk score below 400 — high probability of loss`,
        `• Liquidity under $30K — one sell can move price 20%+`,
        `• Top 10 holders above 60% — they control the price`,
        `• LP not locked — devs can drain it any time`,
        ``,
        `**💡 Entry strategy (if metrics are good):**`,
        `• Size position to max 1-2% of your portfolio on any memecoin`,
        `• Set a mental stop-loss at -30% and stick to it`,
        `• Check volume trend — rising volume + rising price is healthier than spike and drop`,
        ``,
        `_This is data, not financial advice. DYOR. Memecoins are high risk._`,
      ].join("\n"),

      B: [
        `🟡 **Goal: Already Holding**`,
        ``,
        `Here's what to watch for exit signals:`,
        ``,
        `**🔴 Consider exiting if you see:**`,
        `• Buy/sell ratio dropping below 0.7 (distribution phase — whales selling)`,
        `• Volume spiking without price moving (someone dumping into bids)`,
        `• Top holders % suddenly decreasing (insider wallets exiting)`,
        `• Price holding flat after a big run — usually precedes a dump`,
        `• 24h change going negative after a long green streak`,
        ``,
        `**🟢 Signs the run may continue:**`,
        `• Buy/sell ratio staying above 1.5`,
        `• New holders growing (check total holders trend)`,
        `• Liquidity increasing (new money coming in, not just price moving)`,
        `• Volume staying high without big price drops`,
        ``,
        `**💡 Holding strategy:**`,
        `• If you're up 3x or more, take out your initial investment ("house money" strategy)`,
        `• Set price alerts, not just targets — memecoins move fast`,
        `• Never hold through a rug because you're "diamond handing" — know when to walk`,
        ``,
        `_Profits only exist when realized. DYOR. This is not financial advice._`,
      ].join("\n"),

      C: [
        `🔴 **Goal: Rug Check — Safety Breakdown**`,
        ``,
        `Here are the key rug pull indicators from the scan:`,
        ``,
        `**🔑 The 5 most important rug signals:**`,
        ``,
        `1. **Mint Authority** — Is it still active?`,
        `   If yes → devs can print unlimited tokens and dump on holders anytime.`,
        ``,
        `2. **LP Locked/Burned** — Is liquidity protected?`,
        `   If LP is not locked or burned → devs can drain the pool instantly (classic rug).`,
        ``,
        `3. **Top Holder Concentration** — Who controls the supply?`,
        `   Above 50% in top 10 wallets = extreme price manipulation risk.`,
        ``,
        `4. **Insider Wallets** — Are marked insiders in the top holders?`,
        `   RugCheck flags wallets linked to known dev/team addresses.`,
        ``,
        `5. **Risk Score** — Below 400 is danger territory.`,
        `   This score aggregates all the above factors plus contract analysis.`,
        ``,
        `**💡 What to do if it looks risky:**`,
        `• Don't buy — no FOMO is worth a rug`,
        `• If already holding and score is below 300 → seriously consider exiting`,
        `• Check if the rug score recently changed — a sudden drop is a warning sign`,
        ``,
        `_RugCheck data is a tool, not a guarantee. Some rugs pass checks. Always verify LP on-chain._`,
      ].join("\n"),

      D: [
        `🔵 **Goal: Just Curious — Project Overview**`,
        ``,
        `Here's how to quickly understand what you're looking at:`,
        ``,
        `**📖 Reading the basics:**`,
        `• **Market Cap** — Total value if every token were sold at current price. Under $1M = micro-cap, very speculative.`,
        `• **Liquidity** — How much money is available to trade against. Under $50K = very thin, big slippage on trades.`,
        `• **24h Volume** — How actively it's being traded. High volume relative to market cap = active speculation.`,
        `• **Pair Age** — How long since the trading pair was created. Under 24h = extremely high risk.`,
        ``,
        `**🌐 How to research further:**`,
        `• Check the DexScreener link from the scan — view holder charts and price history`,
        `• Search the token name on Twitter/X for community sentiment`,
        `• Look up the contract on Solscan for full on-chain transparency`,
        `• Check if there's a real website, whitepaper, or just a meme`,
        ``,
        `**💡 Reality check on memecoins:**`,
        `• 95%+ of memecoins go to zero`,
        `• The ones that don't usually have strong community + real liquidity early`,
        `• Being early is the only real edge — most retail buys the top`,
        ``,
        `_Curiosity is healthy. Aping in blind is not. DYOR._`,
      ].join("\n"),
    };

    const reply = responses[goal];

    if (!reply) {
      callback?.({
        text: `Reply with **A**, **B**, **C**, or **D** to get tailored analysis:\n\nA) 🟢 Thinking of buying\nB) 🟡 Already holding\nC) 🔴 Rug safety check\nD) 🔵 Just curious`,
      });
      return { success: false };
    }

    callback?.({ text: reply });
    return { success: true };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "A" } },
      {
        name: "ElinosaAI",
        content: { text: "Here's what to check before entering a position..." },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "C" } },
      {
        name: "ElinosaAI",
        content: { text: "Here's a full rug safety breakdown..." },
      },
    ],
  ],
};

// ─── Plugin Export ─────────────────────────────────────────────────────────────

export const customPlugin: Plugin = {
  name: "custom-plugin",
  description: "ElinosaAI — Solana memecoin intelligence agent. Analyzes token safety, price data, and wallet activity.",
  actions: [analyzeTokenAction, checkWalletAction, goalAnalysisAction],
  providers: [],
  evaluators: [],
};

export default customPlugin;