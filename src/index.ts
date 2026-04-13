/**
 * ElinosaAI Custom Plugin — v2
 * Actions:
 *   1. ANALYZE_TOKEN    — live price + rug risk
 *   2. CHECK_WALLET     — Helius wallet activity
 *   3. GOAL_ANALYSIS    — A/B/C/D with real token data injected
 *   4. WHALE_CHECK      — top holder analysis + Helius per-wallet activity
 *   5. SENTIMENT_CHECK  — social signals + on-chain sentiment indicators
 *   6. FOLLOW_UP        — conversational LLM reasoning with full token context
 */

import {
  type Plugin,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
} from "@elizaos/core";

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
  info?: {
    socials?: Array<{ type: string; url: string }>;
    websites?: Array<{ url: string }>;
  };
}

interface RugRisk {
  name: string;
  description: string;
  level: "danger" | "warning" | "info";
}

interface RugCheckHolder {
  address: string;
  pct: number;
  insider: boolean;
  amount?: number;
}

interface RugCheckReport {
  score_normalised: number;
  rugged: boolean;
  risks: RugRisk[];
  markets?: Array<{ lp?: { lpLockedPct: number; lpBurnedPct: number } }>;
  topHolders?: RugCheckHolder[];
  totalHolders?: number;
}

interface TokenScanState {
  address: string;
  symbol?: string;
  name?: string;
  url?: string;
  socials?: Array<{ type: string; url: string }>;
  websites?: Array<{ url: string }>;
  priceUsd: number;
  priceChange24h: number;
  priceChange6h: number;
  priceChange1h: number;
  liquidityUsd: number;
  volume24hUsd: number;
  marketCapUsd: number;
  buySellRatio: string;
  buys: number;
  sells: number;
  pairAgeHours: number;
  pairAgeDays: number;
  top10Pct: string;
  lpLockedPct: number;
  lpBurnedPct: number;
  totalHolders: number | null;
  topHolders: RugCheckHolder[];
  riskScore: number;
  rugged: boolean;
  hasInsiders: boolean;
  redFlags: RugRisk[];
  summaryText: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAddress(text: string): string | null {
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match ? match[0] : null;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatChange(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function getVerdict(score: number, rugged: boolean): string {
  if (rugged) return "🚨 RUGGED";
  if (score >= 800) return "✅ GOOD";
  if (score >= 500) return "⚠️ CAUTION";
  if (score >= 200) return "🔴 HIGH RISK";
  return "💀 DANGER";
}

/** Full token context block for LLM injection */
function buildLLMContext(scan: TokenScanState): string {
  const ageStr =
    scan.pairAgeDays > 0
      ? `${scan.pairAgeDays}d ${scan.pairAgeHours % 24}h`
      : `${scan.pairAgeHours}h`;
  const verdict = getVerdict(scan.riskScore, scan.rugged);
  const topHoldersStr = scan.topHolders
    .slice(0, 5)
    .map(
      (h, i) =>
        `  ${i + 1}. ${h.address.slice(0, 8)}... — ${h.pct.toFixed(2)}%${h.insider ? " [INSIDER]" : ""}`
    )
    .join("\n");
  const redFlagsStr =
    scan.redFlags.length > 0
      ? scan.redFlags
          .map((r) => `  [${r.level.toUpperCase()}] ${r.name}: ${r.description}`)
          .join("\n")
      : "  None detected";

  return `
=== LAST SCANNED TOKEN ===
Token: ${scan.symbol ?? "Unknown"} (${scan.name ?? "Unknown"})
Address: ${scan.address}
DexScreener: ${scan.url ?? "N/A"}
Socials: ${scan.socials?.map((s) => `${s.type}: ${s.url}`).join(", ") || "None"}
Websites: ${scan.websites?.map((w) => w.url).join(", ") || "None"}

PRICE & MARKET
  Price: $${scan.priceUsd.toExponential(4)}
  24h Change: ${formatChange(scan.priceChange24h)} | 6h: ${formatChange(scan.priceChange6h)} | 1h: ${formatChange(scan.priceChange1h)}
  Market Cap: ${formatUsd(scan.marketCapUsd)}
  Liquidity: ${formatUsd(scan.liquidityUsd)}
  24h Volume: ${formatUsd(scan.volume24hUsd)}
  Buy/Sell Ratio: ${scan.buySellRatio} (${scan.buys} buys / ${scan.sells} sells)
  Pair Age: ${ageStr}

SAFETY
  RugCheck Score: ${scan.riskScore}/1000 — ${verdict}
  Rugged: ${scan.rugged ? "YES" : "No"}
  LP Locked: ${scan.lpLockedPct.toFixed(1)}% | LP Burned: ${scan.lpBurnedPct.toFixed(1)}%
  Total Holders: ${scan.totalHolders ?? "Unknown"}
  Top 10 holders: ${scan.top10Pct}% of supply
  Insider wallets in top holders: ${scan.hasInsiders ? "YES ⚠️" : "No"}

TOP 5 HOLDERS:
${topHoldersStr || "  Not available"}

RED FLAGS:
${redFlagsStr}
=========================
`;
}

/** Call the agent's LLM endpoint for conversational reasoning */
async function askLLM(
  agentBaseUrl: string,
  systemPrompt: string,
  userQuestion: string
): Promise<string | null> {
  try {
    const res = await fetch(`${agentBaseUrl}/api/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "default",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuestion },
        ],
        max_tokens: 800,
        temperature: 0.4,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (
      data?.choices?.[0]?.message?.content ??
      data?.message?.content ??
      null
    );
  } catch {
    return null;
  }
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
    return solanaPairs.sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
    )[0];
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

async function fetchHeliusActivity(
  walletAddress: string,
  apiKey: string,
  limit = 10
): Promise<{ summary: string; rawTxs: any[] }> {
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=${limit}`
    );
    if (!res.ok) return { summary: `Helius returned ${res.status}`, rawTxs: [] };
    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0)
      return { summary: "No recent transactions found.", rawTxs: [] };
    const typeCounts: Record<string, number> = {};
    txs.forEach((tx: { type?: string }) => {
      const t = tx.type ?? "UNKNOWN";
      typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    });
    const summary = Object.entries(typeCounts)
      .map(([type, count]) => `${count}x ${type}`)
      .join(", ");
    return { summary: `Last ${txs.length} txns: ${summary}`, rawTxs: txs };
  } catch (e) {
    return { summary: `Failed: ${(e as Error).message}`, rawTxs: [] };
  }
}

function buildTokenScanState(
  address: string,
  dex: DexPair | null,
  rug: RugCheckReport | null,
  summaryText: string,
  ratio: string,
  buys: number,
  sells: number,
  ageHours: number,
  ageDays: number,
  top10Pct: string,
  lpLocked: number,
  lpBurned: number,
  score: number,
  hasInsiders: boolean
): TokenScanState {
  return {
    address,
    symbol: dex?.baseToken.symbol,
    name: dex?.baseToken.name,
    url: dex?.url,
    socials: dex?.info?.socials,
    websites: dex?.info?.websites,
    priceUsd: parseFloat(dex?.priceUsd ?? "0"),
    priceChange24h: dex?.priceChange?.h24 ?? 0,
    priceChange6h: dex?.priceChange?.h6 ?? 0,
    priceChange1h: dex?.priceChange?.h1 ?? 0,
    liquidityUsd: dex?.liquidity?.usd ?? 0,
    volume24hUsd: dex?.volume?.h24 ?? 0,
    marketCapUsd: dex?.marketCap ?? 0,
    buySellRatio: ratio,
    buys,
    sells,
    pairAgeHours: ageHours,
    pairAgeDays: ageDays,
    top10Pct,
    lpLockedPct: lpLocked,
    lpBurnedPct: lpBurned,
    totalHolders: rug?.totalHolders ?? null,
    topHolders: rug?.topHolders ?? [],
    riskScore: score,
    rugged: rug?.rugged ?? false,
    hasInsiders,
    redFlags: (rug?.risks ?? []).filter(
      (r) => r.level === "danger" || r.level === "warning"
    ),
    summaryText,
  };
}

// ─── In-memory scan store (per user, per session) ─────────────────────────────

const lastScanByUser = new Map<string, TokenScanState>();

function getUserId(message: Memory): string {
  return String((message as any).userId ?? (message as any).from?.id ?? "default");
}

function getLastScan(state: State | undefined, userId: string): TokenScanState | null {
  const fromState =
    (state?.values as Record<string, unknown>)?.lastTokenScan ??
    (state?.data as Record<string, unknown>)?.lastTokenScan;
  if (fromState) return fromState as TokenScanState;
  return lastScanByUser.get(userId) ?? null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

const analyzeTokenAction = {
  name: "ANALYZE_TOKEN",
  description:
    "Analyzes a Solana token by contract address. Fetches live price, volume, liquidity from DexScreener and rug pull risk from RugCheck.xyz.",
  similes: ["CHECK_TOKEN", "TOKEN_INFO", "MEMECOIN_CHECK", "SCAN_TOKEN", "LOOKUP_TOKEN", "ANALYZE_COIN"],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    return extractAddress(message.content?.text ?? "") !== null;
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | undefined> => {
    const address = extractAddress(message.content?.text ?? "");
    if (!address) {
      callback?.({ text: "I couldn't find a valid Solana token address in your message." });
      return { success: false, error: "invalid address" };
    }

    callback?.({ text: `🔍 Analyzing \`${address.slice(0, 8)}...\` — fetching live data...` });

    const [dex, rug] = await Promise.all([fetchDexScreener(address), fetchRugCheck(address)]);

    const lines: string[] = [];
    let ratio = "N/A", buys = 0, sells = 0, ageHours = 0, ageDays = 0;
    let score = 0, top10Pct = "N/A", lpLocked = 0, lpBurned = 0, hasInsiders = false;

    if (!dex) {
      lines.push(`⚠️ **No Solana trading pairs found** for this address on DexScreener.`);
      lines.push(`Token may not be listed yet or the address is incorrect.`);
    } else {
      const ageMs = Date.now() - (dex.pairCreatedAt ?? 0);
      ageHours = Math.floor(ageMs / 3_600_000);
      ageDays = Math.floor(ageHours / 24);
      const ageStr = ageDays > 0 ? `${ageDays}d ${ageHours % 24}h` : `${ageHours}h`;
      buys = dex.txns?.h24?.buys ?? 0;
      sells = dex.txns?.h24?.sells ?? 0;
      ratio = sells > 0 ? (buys / sells).toFixed(2) : "N/A";

      lines.push(`**$${dex.baseToken.symbol} — ${dex.baseToken.name}**`);
      lines.push(``);
      lines.push(`📊 **Price:** $${parseFloat(dex.priceUsd ?? "0").toExponential(4)}`);
      lines.push(`📈 **24h:** ${formatChange(dex.priceChange?.h24 ?? 0)} | 6h: ${formatChange(dex.priceChange?.h6 ?? 0)} | 1h: ${formatChange(dex.priceChange?.h1 ?? 0)}`);
      lines.push(`💧 **Liquidity:** ${formatUsd(dex.liquidity?.usd ?? 0)}`);
      lines.push(`📉 **24h Volume:** ${formatUsd(dex.volume?.h24 ?? 0)}`);
      lines.push(`🔄 **Buy/Sell (24h):** ${ratio} (${buys} buys / ${sells} sells)`);
      lines.push(`💎 **Market Cap:** ${formatUsd(dex.marketCap ?? 0)}`);
      lines.push(`🕐 **Pair Age:** ${ageStr}`);
      lines.push(`🔗 **DexScreener:** ${dex.url}`);
      if (dex.info?.socials?.length) {
        lines.push(`🌐 **Socials:** ${dex.info.socials.map((s) => `[${s.type}](${s.url})`).join(" | ")}`);
      }
    }

    lines.push(``);

    if (!rug) {
      lines.push(`🛡️ **RugCheck:** Unable to fetch safety data.`);
    } else {
      score = rug.score_normalised ?? 0;
      const verdict = getVerdict(score, rug.rugged);
      top10Pct = rug.topHolders
        ? rug.topHolders.slice(0, 10).reduce((s, h) => s + (h.pct ?? 0), 0).toFixed(1)
        : "N/A";
      lpLocked = rug.markets?.[0]?.lp?.lpLockedPct ?? 0;
      lpBurned = rug.markets?.[0]?.lp?.lpBurnedPct ?? 0;
      hasInsiders = rug.topHolders?.some((h) => h.insider) ?? false;

      lines.push(`🛡️ **Risk Score:** ${score}/1000 — ${verdict}`);
      lines.push(`👥 **Top 10 Holders:** ${top10Pct}% of supply`);
      lines.push(`🔒 **LP Locked:** ${lpLocked.toFixed(1)}% | **LP Burned:** ${lpBurned.toFixed(1)}%`);
      lines.push(`👤 **Total Holders:** ${rug.totalHolders ?? "N/A"}`);
      if (hasInsiders) lines.push(`⚠️ **Insider wallets detected** in top holders`);

      const redFlags = (rug.risks ?? [])
        .filter((r) => r.level === "danger" || r.level === "warning")
        .slice(0, 4);
      if (redFlags.length > 0) {
        lines.push(``);
        lines.push(`🚩 **Red Flags:**`);
        redFlags.forEach((r) => {
          lines.push(`${r.level === "danger" ? "🔴" : "🟡"} ${r.name}: ${r.description}`);
        });
      }
    }

    lines.push(``);
    lines.push(`---`);
    lines.push(`**What's your goal with this token?**`);
    lines.push(`A) 🟢 Thinking of buying`);
    lines.push(`B) 🟡 Already holding`);
    lines.push(`C) 🔴 Smells like a rug`);
    lines.push(`D) 🔵 Just curious`);
    lines.push(``);
    lines.push(`_Or ask me anything: "who are the whales?", "check sentiment", "is this safe to hold overnight?" — I'll reason with the data I just pulled._`);

    const summaryText = lines.join("\n");
    const scanState = buildTokenScanState(
      address, dex, rug, summaryText, ratio, buys, sells,
      ageHours, ageDays, top10Pct, lpLocked, lpBurned, score, hasInsiders
    );

    lastScanByUser.set(getUserId(message), scanState);

    callback?.({ text: summaryText });
    return {
      success: true,
      values: { lastTokenScan: scanState },
      data: { lastTokenScan: scanState },
    };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHkv" } },
      { name: "ElinosaAI", content: { text: "Fetching live data on that token now..." } },
    ],
  ],
};

const whaleCheckAction = {
  name: "WHALE_CHECK",
  description:
    "Shows top holder wallets for the last scanned token and checks their recent on-chain activity via Helius.",
  similes: ["TOP_HOLDERS", "HOLDER_CHECK", "WHALE_ANALYSIS", "WHO_HOLDS", "HOLDER_WALLETS", "CHECK_WHALES"],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text ?? "").toLowerCase();
    return (
      text.includes("whale") ||
      text.includes("holder") ||
      text.includes("who hold") ||
      text.includes("top wallet") ||
      text.includes("who own") ||
      text.includes("holder detail") ||
      text.includes("big wallet")
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | undefined> => {
    const userId = getUserId(message);
    const scan = getLastScan(state, userId);

    if (!scan) {
      callback?.({
        text: `🐋 Paste a Solana token address first and I'll scan it, then you can ask about the whales.`,
      });
      return { success: false };
    }

    const apiKey = String(runtime.getSetting("HELIUS_API_KEY") ?? process.env.HELIUS_API_KEY ?? "");
    const symbol = scan.symbol ? `$${scan.symbol}` : `\`${scan.address.slice(0, 8)}...\``;

    callback?.({ text: `🐋 Checking top holders for ${symbol}...` });

    const lines: string[] = [];
    lines.push(`**🐋 Whale & Holder Breakdown — ${symbol}**`);
    lines.push(``);

    if (!scan.topHolders || scan.topHolders.length === 0) {
      lines.push(`⚠️ No holder data available from RugCheck for this token.`);
    } else {
      lines.push(`Total holders: **${scan.totalHolders?.toLocaleString() ?? "Unknown"}**`);
      lines.push(`Top 10 control: **${scan.top10Pct}%** of supply`);
      lines.push(``);
      lines.push(`**Top Holders:**`);
      scan.topHolders.slice(0, 10).forEach((h, i) => {
        const tag = h.insider ? " ⚠️ INSIDER" : "";
        lines.push(
          `${i + 1}. \`${h.address.slice(0, 8)}...${h.address.slice(-4)}\` — **${h.pct.toFixed(2)}%**${tag}`
        );
      });
    }

    if (apiKey && scan.topHolders?.length > 0) {
      lines.push(``);
      lines.push(`**Recent wallet activity (top 3, via Helius):**`);
      for (const holder of scan.topHolders.slice(0, 3)) {
        try {
          const { summary } = await fetchHeliusActivity(holder.address, apiKey, 5);
          lines.push(`• \`${holder.address.slice(0, 8)}...\` (${holder.pct.toFixed(2)}%): ${summary}`);
        } catch {
          lines.push(`• \`${holder.address.slice(0, 8)}...\`: Could not fetch`);
        }
      }
    } else if (!apiKey) {
      lines.push(``);
      lines.push(`_Add HELIUS_API_KEY to .env to see per-wallet transaction activity._`);
    }

    lines.push(``);
    lines.push(
      `_If top wallets show heavy SELL or SWAP activity, that's a distribution warning. Top 10 > 40% = manipulation risk._`
    );

    callback?.({ text: lines.join("\n") });
    return { success: true };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "who are the whales on this token?" } },
      { name: "ElinosaAI", content: { text: "Checking top holder wallets now..." } },
    ],
  ],
};

const sentimentCheckAction = {
  name: "SENTIMENT_CHECK",
  description:
    "Checks social sentiment signals for the last scanned token — official socials, community activity, on-chain buy/sell pressure as sentiment proxy.",
  similes: ["SOCIAL_CHECK", "TWITTER_CHECK", "SENTIMENT_ANALYSIS", "CHECK_SENTIMENT", "COMMUNITY_CHECK", "HYPE_CHECK"],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text ?? "").toLowerCase();
    return (
      text.includes("sentiment") ||
      text.includes("social") ||
      text.includes("twitter") ||
      text.includes("community") ||
      text.includes("hype") ||
      text.includes("buzz") ||
      text.includes("trending") ||
      text.includes("people think") ||
      text.includes("what people say")
    );
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | undefined> => {
    const userId = getUserId(message);
    const scan = getLastScan(state, userId);

    if (!scan) {
      callback?.({
        text: `📣 Paste a Solana token address first, then I can check the sentiment signals.`,
      });
      return { success: false };
    }

    const symbol = scan.symbol ? `$${scan.symbol}` : `\`${scan.address.slice(0, 8)}...\``;
    const lines: string[] = [];

    lines.push(`**📣 Sentiment & Social Signals — ${symbol}**`);
    lines.push(``);

    if (scan.socials && scan.socials.length > 0) {
      lines.push(`**Official socials (from DexScreener):**`);
      scan.socials.forEach((s) => lines.push(`• ${s.type}: ${s.url}`));
    } else {
      lines.push(`⚠️ **No official socials listed on DexScreener.**`);
      lines.push(`Legitimate projects usually link their community. This is a yellow flag.`);
    }

    if (scan.websites?.length) {
      lines.push(``);
      lines.push(`**Website:** ${scan.websites.map((w) => w.url).join(", ")}`);
    }

    lines.push(``);
    lines.push(`**📊 On-chain sentiment signals:**`);

    const ratioNum = parseFloat(scan.buySellRatio);
    if (!isNaN(ratioNum)) {
      if (ratioNum > 2.0) {
        lines.push(`🟢 **Buy pressure HIGH** — ratio ${scan.buySellRatio} — strong accumulation`);
      } else if (ratioNum > 1.2) {
        lines.push(`🟡 **Mild buy bias** — ratio ${scan.buySellRatio} — more buyers than sellers`);
      } else if (ratioNum < 0.7) {
        lines.push(`🔴 **Sell pressure HIGH** — ratio ${scan.buySellRatio} — possible distribution / exit`);
      } else {
        lines.push(`⚪ **Neutral** — ratio ${scan.buySellRatio} — balanced activity`);
      }
    }

    if (scan.volume24hUsd > 0 && scan.marketCapUsd > 0) {
      const vmr = scan.volume24hUsd / scan.marketCapUsd;
      if (vmr > 1.0) {
        lines.push(`🔥 **Volume/MCap: ${(vmr * 100).toFixed(0)}%** — extremely active (viral or manipulated)`);
      } else if (vmr > 0.3) {
        lines.push(`📈 **Volume/MCap: ${(vmr * 100).toFixed(0)}%** — strong market interest`);
      } else if (vmr < 0.05) {
        lines.push(`📉 **Volume/MCap: ${(vmr * 100).toFixed(0)}%** — fading momentum`);
      }
    }

    if (scan.totalHolders !== null) {
      if (scan.totalHolders > 5000) {
        lines.push(`👥 **${scan.totalHolders.toLocaleString()} holders** — solid community`);
      } else if (scan.totalHolders > 1000) {
        lines.push(`👥 **${scan.totalHolders.toLocaleString()} holders** — growing`);
      } else if (scan.totalHolders < 200) {
        lines.push(`⚠️ **Only ${scan.totalHolders} holders** — very small, high manipulation risk`);
      }
    }

    lines.push(``);
    lines.push(`**🔍 Manual sentiment check:**`);
    if (scan.symbol) lines.push(`• Search **$${scan.symbol}** on Twitter/X`);
    lines.push(`• Search \`${scan.address.slice(0, 16)}\` on Twitter/X`);
    lines.push(`• DexScreener: ${scan.url ?? `https://dexscreener.com/solana/${scan.address}`}`);
    lines.push(``);
    lines.push(`_On-chain data > social hype. High volume + buy ratio is objective. Tweets can be bought._`);

    callback?.({ text: lines.join("\n") });
    return { success: true };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "check sentiment on this" } },
      { name: "ElinosaAI", content: { text: "Analyzing sentiment signals..." } },
    ],
  ],
};

/**
 * FOLLOW_UP — the key action that makes the agent actually conversational.
 * Takes any free-text question after a scan, injects full token data, and
 * lets the LLM reason over real numbers instead of returning canned replies.
 */
const followUpAction = {
  name: "FOLLOW_UP",
  description:
    "Handles any natural-language follow-up question about the last scanned token. Injects full token data into the LLM prompt so it reasons over real numbers.",
  similes: [
    "TOKEN_QUESTION",
    "CONVERSATIONAL_ANALYSIS",
    "REASON_ABOUT_TOKEN",
    "SAFE_TO_HOLD",
    "SHOULD_I_BUY",
    "WHAT_DO_YOU_THINK",
    "OVERNIGHT_HOLD",
  ],

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<boolean> => {
    const text = (message.content?.text ?? "").trim();
    if (!text || text.length < 5) return false;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false; // address
    if (/^[ABCD]$/i.test(text)) return false; // goal reply
    if (text.startsWith("/")) return false; // command
    const userId = getUserId(message);
    return (
      !!(state?.values as Record<string, unknown>)?.lastTokenScan ||
      !!(state?.data as Record<string, unknown>)?.lastTokenScan ||
      lastScanByUser.has(userId)
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | undefined> => {
    const userId = getUserId(message);
    const scan = getLastScan(state, userId);
    const question = message.content?.text ?? "";

    if (!scan) {
      callback?.({
        text: `I need a token to reason about. Paste a Solana token address first.`,
      });
      return { success: false };
    }

    callback?.({ text: `⏳ Analyzing with the token data...` });

    const tokenContext = buildLLMContext(scan);
    const systemPrompt = `You are ElinosaAI, a Solana memecoin intelligence agent running on Nosana decentralized GPU.

You have just scanned a Solana token and have all its live on-chain data. Answer the user's question using ONLY the actual numbers from the scan — not generic advice.

Rules:
- Reference specific numbers (price, liquidity, risk score, holder %, ratios)
- Be direct. No filler. No vague disclaimers beyond "DYOR"
- Never recommend buying or selling. Provide analysis, they decide.
- Keep responses under 300 words unless question is complex.
- Use emojis sparingly for readability.
- Always end risk/opinion answers with "DYOR"

${tokenContext}`;

    const agentBaseUrl = (process.env.AGENT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    let llmReply = await askLLM(agentBaseUrl, systemPrompt, question);

    if (!llmReply) {
      try {
        llmReply = await (runtime as any).generateText?.({
          context: `${systemPrompt}\n\nUser: ${question}`,
          maxTokens: 800,
        }) ?? null;
      } catch { /* ignore */ }
    }

    if (!llmReply) {
      const symbol = scan.symbol ? `$${scan.symbol}` : "this token";
      llmReply = [
        `Here's what the data shows for ${symbol}:`,
        ``,
        `• Risk: **${scan.riskScore}/1000** ${scan.rugged ? "— ⚠️ RUGGED" : getVerdict(scan.riskScore, scan.rugged)}`,
        `• Liquidity: **${formatUsd(scan.liquidityUsd)}**`,
        `• Buy/sell: **${scan.buySellRatio}** (${scan.buys} buys / ${scan.sells} sells)`,
        `• Top 10 holders: **${scan.top10Pct}%** of supply`,
        `• LP locked: **${scan.lpLockedPct.toFixed(1)}%** | burned: **${scan.lpBurnedPct.toFixed(1)}%**`,
        scan.hasInsiders ? `• ⚠️ Insider wallets in top holders` : `• No insider flags`,
        scan.redFlags.length > 0 ? `• Red flags: ${scan.redFlags.map((r) => r.name).join(", ")}` : "",
        ``,
        `_(LLM reasoning unavailable — showing raw data. Ask "whale check" or "sentiment" for more.)_`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    callback?.({ text: llmReply });
    return { success: true };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "is this safe to hold overnight?" } },
      { name: "ElinosaAI", content: { text: "Looking at the actual numbers from this scan..." } },
    ],
    [
      { name: "{{user1}}", content: { text: "what does the buy/sell ratio tell us?" } },
      { name: "ElinosaAI", content: { text: "Based on the data I pulled..." } },
    ],
    [
      { name: "{{user1}}", content: { text: "whats do you think about this token" } },
      { name: "ElinosaAI", content: { text: "Here's my read on the numbers..." } },
    ],
  ],
};

const checkWalletAction = {
  name: "CHECK_WALLET",
  description: "Fetches recent transaction activity for a Solana wallet address using Helius.",
  similes: ["WALLET_ACTIVITY", "WALLET_CHECK", "WALLET_HISTORY", "CHECK_ADDRESS", "WALLET_LOOKUP"],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text ?? "").toLowerCase();
    const hasKeyword =
      text.includes("wallet") || text.includes("activity") || text.includes("transactions");
    return hasKeyword && extractAddress(message.content?.text ?? "") !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | undefined> => {
    const address = extractAddress(message.content?.text ?? "");
    if (!address) {
      callback?.({ text: "Please provide a valid Solana wallet address." });
      return { success: false };
    }

    const apiKey = String(runtime.getSetting("HELIUS_API_KEY") ?? process.env.HELIUS_API_KEY ?? "");
    if (!apiKey) {
      callback?.({
        text: `⚠️ Wallet lookup needs a Helius API key.\nAdd \`HELIUS_API_KEY=your_key\` to .env — free at https://helius.xyz`,
      });
      return { success: false };
    }

    callback?.({ text: `🔍 Fetching wallet activity for \`${address.slice(0, 8)}...\`...` });

    const { summary } = await fetchHeliusActivity(address, apiKey);
    const lines = [
      `**Wallet Activity**`,
      `📍 \`${address.slice(0, 8)}...${address.slice(-4)}\``,
      ``,
      summary,
      ``,
      `_Paste a token address to analyze what this wallet is trading._`,
    ];

    callback?.({ text: lines.join("\n") });
    return { success: true };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Check wallet 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" } },
      { name: "ElinosaAI", content: { text: "Fetching wallet activity..." } },
    ],
  ],
};

const goalAnalysisAction = {
  name: "GOAL_ANALYSIS",
  description:
    "Provides goal-based analysis when user replies A/B/C/D. Uses actual scanned token data for specific insights.",
  similes: ["GOAL_RESPONSE", "TOKEN_GOAL", "ANALYZE_GOAL", "INVESTMENT_GOAL"],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text ?? "").trim();
    return /^[ABCD]$/i.test(text) || /^(BUY|BUYING|HOLD|HOLDING|RUG|CURIOUS|JUST CURIOUS)$/i.test(text);
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback
  ): Promise<import("@elizaos/core").ActionResult | undefined> => {
    const raw = (message.content?.text ?? "").trim().toUpperCase();
    const userId = getUserId(message);
    const scan = getLastScan(state, userId);

    let goal = raw;
    if (/BUY/i.test(raw)) goal = "A";
    if (/HOLD/i.test(raw)) goal = "B";
    if (/RUG/i.test(raw)) goal = "C";
    if (/CURIOUS/i.test(raw)) goal = "D";

    let dataContext = "";
    if (scan) {
      const symbol = scan.symbol ? `$${scan.symbol}` : "this token";
      dataContext = `**📌 ${symbol} — ${getVerdict(scan.riskScore, scan.rugged)} | Liq: ${formatUsd(scan.liquidityUsd)} | B/S: ${scan.buySellRatio} | Top10: ${scan.top10Pct}%**\n\n`;
    }

    const responses: Record<string, string> = {
      A: [
        `🟢 **Thinking of Buying**`,
        ``,
        scan ? [
          `**This token:**`,
          `• Risk ${scan.riskScore}/1000 — ${scan.riskScore >= 700 ? "✅ ok" : scan.riskScore >= 400 ? "⚠️ borderline" : "🔴 risky entry"}`,
          `• Liquidity ${formatUsd(scan.liquidityUsd)} — ${scan.liquidityUsd >= 50000 ? "✅" : scan.liquidityUsd >= 20000 ? "⚠️ thin" : "🔴 very thin"}`,
          `• Buy/sell ${scan.buySellRatio} — ${parseFloat(scan.buySellRatio) > 1.2 ? "✅ buyers in control" : "⚠️ mixed"}`,
          `• LP: locked ${scan.lpLockedPct.toFixed(0)}% / burned ${scan.lpBurnedPct.toFixed(0)}% — ${scan.lpLockedPct + scan.lpBurnedPct > 50 ? "✅" : "🔴 low protection"}`,
          `• Top 10 own ${scan.top10Pct}% — ${parseFloat(scan.top10Pct) < 40 ? "✅" : "⚠️ concentrated"}`,
          scan.hasInsiders ? `• ⚠️ Insider wallets in holders` : `• No insider flags`,
          ``,
        ].join("\n") : "",
        `**Entry rules:**`,
        `• Risk > 700, LP locked/burned, top 10 < 40%, B/S > 1.2, age > 48h`,
        `• Max 1-2% of portfolio. Mental stop at -30%.`,
        `_DYOR — this is data, not financial advice._`,
      ].filter(Boolean).join("\n"),

      B: [
        `🟡 **Already Holding**`,
        ``,
        scan ? `**Current B/S: ${scan.buySellRatio}** — ${parseFloat(scan.buySellRatio) > 1.0 ? "buyers still in control" : "⚠️ sellers taking over"}\n` : "",
        `**Exit if you see:**`,
        `• B/S drops below 0.7 (whale exit/distribution)`,
        `• Volume spike with flat price (dumping into bids)`,
        `• Top holder % suddenly drops`,
        ``,
        `**Run may continue if:**`,
        `• B/S stays above 1.5 + growing holders + rising liquidity`,
        ``,
        `Up 3x+? Take out your initial. House money strategy.`,
        `_Profits only exist when realized. DYOR._`,
      ].filter(Boolean).join("\n"),

      C: [
        `🔴 **Rug Safety Breakdown**`,
        ``,
        scan ? [
          `**This token's red flags:**`,
          `• Score: ${scan.riskScore}/1000 — ${getVerdict(scan.riskScore, scan.rugged)}`,
          `• LP protected: ${scan.lpLockedPct + scan.lpBurnedPct > 0 ? `${(scan.lpLockedPct + scan.lpBurnedPct).toFixed(0)}%` : "🔴 NONE — classic rug setup"}`,
          `• Top 10 own ${scan.top10Pct}% — ${parseFloat(scan.top10Pct) > 50 ? "🔴 extreme" : parseFloat(scan.top10Pct) > 35 ? "⚠️ watch for dump" : "✅ ok"}`,
          `• Insiders: ${scan.hasInsiders ? "🔴 YES" : "✅ none"}`,
          scan.redFlags.length > 0 ? `• Flags: ${scan.redFlags.map((r) => r.name).join(", ")}` : `• No critical flags`,
          ``,
        ].join("\n") : "",
        `**5 rug signals:**`,
        `1. Mint authority active → unlimited printing`,
        `2. LP not locked/burned → pool drain`,
        `3. Top 10 > 50% → manipulation`,
        `4. Insider wallets → dev exit`,
        `5. Score < 400 → danger`,
        `_Verify LP on-chain too. RugCheck is a tool, not a guarantee._`,
      ].filter(Boolean).join("\n"),

      D: [
        `🔵 **Project Overview**`,
        ``,
        scan ? [
          `**${scan.symbol ?? "Token"} snapshot:**`,
          `• MCap: ${formatUsd(scan.marketCapUsd)} | Age: ${scan.pairAgeDays > 0 ? scan.pairAgeDays + "d" : scan.pairAgeHours + "h"}`,
          `• Holders: ${scan.totalHolders?.toLocaleString() ?? "unknown"}`,
          scan.socials?.length ? `• Socials: ${scan.socials.map((s) => s.type).join(", ")}` : `• ⚠️ No official socials`,
          ``,
        ].join("\n") : "",
        `**Dig deeper:**`,
        `• DexScreener: holder charts, price history`,
        `• Twitter/X: search token name for community`,
        `• Solscan: on-chain transparency`,
        ``,
        `95%+ of memecoins go to zero. Early + real liquidity is the only edge.`,
        `_DYOR._`,
      ].filter(Boolean).join("\n"),
    };

    const reply = responses[goal];
    if (!reply) {
      callback?.({ text: `Reply A, B, C, or D:\nA) 🟢 Buying\nB) 🟡 Holding\nC) 🔴 Rug check\nD) 🔵 Curious` });
      return { success: false };
    }

    callback?.({ text: `${dataContext}${reply}` });
    return { success: true };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "A" } },
      { name: "ElinosaAI", content: { text: "Here's the entry analysis for this token..." } },
    ],
  ],
};

// ─── Plugin Export ─────────────────────────────────────────────────────────────

export const customPlugin: Plugin = {
  name: "custom-plugin",
  description:
    "ElinosaAI — Solana memecoin intelligence agent with conversational LLM reasoning, whale analysis, sentiment signals, and live on-chain data.",
  actions: [
    analyzeTokenAction,
    whaleCheckAction,
    sentimentCheckAction,
    followUpAction,
    checkWalletAction,
    goalAnalysisAction,
  ],
  providers: [],
  evaluators: [],
};

export default customPlugin;
