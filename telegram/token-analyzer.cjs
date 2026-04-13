/**
 * ElinosaAI Token Analyzer
 * Returns { card, question, data } where data is a structured object — not raw text.
 * This avoids fragile regex-scraping in conversation-handler.
 */

function extractAddress(text) {
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match ? match[0] : null;
}

function containsSolanaAddress(text) {
  return extractAddress(text) !== null;
}

function formatUsd(n) {
  n = parseFloat(n || 0);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatChange(n) {
  n = parseFloat(n || 0);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function getVerdict(score, rugged) {
  if (rugged)      return "🚨 RUGGED";
  if (score >= 800) return "✅ GOOD";
  if (score >= 500) return "⚠️ CAUTION";
  if (score >= 200) return "🔴 HIGH RISK";
  return "💀 DANGER";
}

async function fetchDexScreener(address) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (data.pairs || []).filter(p => p.chainId === "solana");
    if (!pairs.length) return null;
    return pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  } catch { return null; }
}

async function fetchRugCheck(address) {
  try {
    const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Returns { card, question, data } or null
// data = structured object with all token metrics (no regex scraping needed)
async function analyzeToken(text) {
  const address = extractAddress(text);
  if (!address) return null;

  const [dex, rug] = await Promise.all([
    fetchDexScreener(address),
    fetchRugCheck(address),
  ]);

  // ── Structured data object (source of truth for follow-ups) ──────────────
  const data = {
    address,
    symbol:        dex?.baseToken?.symbol  || "Unknown",
    name:          dex?.baseToken?.name    || "Unknown",
    price:         parseFloat(dex?.priceUsd || 0),
    change24h:     parseFloat(dex?.priceChange?.h24 || 0),
    change6h:      parseFloat(dex?.priceChange?.h6  || 0),
    change1h:      parseFloat(dex?.priceChange?.h1  || 0),
    liquidity:     parseFloat(dex?.liquidity?.usd   || 0),
    volume24h:     parseFloat(dex?.volume?.h24      || 0),
    marketCap:     parseFloat(dex?.marketCap        || 0),
    buys:          dex?.txns?.h24?.buys  || 0,
    sells:         dex?.txns?.h24?.sells || 0,
    pairAgeHours:  dex ? Math.floor((Date.now() - (dex.pairCreatedAt || 0)) / 3600000) : 0,
    dexUrl:        dex?.url || null,
    socials:       dex?.info?.socials || [],
    // RugCheck fields
    riskScore:     rug?.score_normalised ?? rug?.score ?? null,
    rugged:        rug?.rugged ?? false,
    top10Pct:      rug?.topHolders
                     ? parseFloat((rug.topHolders.slice(0,10).reduce((s,h) => s+(h.pct||0), 0) * 100).toFixed(1))
                     : null,
    lpLockedPct:   parseFloat(rug?.markets?.[0]?.lp?.lpLockedPct ?? 0),
    lpBurnedPct:   parseFloat(rug?.markets?.[0]?.lp?.lpBurnedPct ?? 0),
    totalHolders:  rug?.totalHolders ?? null,
    topHolders:    rug?.topHolders   ?? [],
    hasInsiders:   rug?.topHolders?.some(h => h.insider) ?? false,
    redFlags:      (rug?.risks || []).filter(r => r.level === "danger" || r.level === "warning"),
    rugCheckOk:    rug !== null,
  };

  // Derived
  data.buySellRatio = data.sells > 0 ? (data.buys / data.sells).toFixed(2) : "N/A";
  data.pairAgeDays  = Math.floor(data.pairAgeHours / 24);
  data.ageStr       = data.pairAgeDays > 0
    ? `${data.pairAgeDays}d ${data.pairAgeHours % 24}h`
    : `${data.pairAgeHours}h`;
  data.verdict     = data.riskScore !== null ? getVerdict(data.riskScore, data.rugged) : "Unknown";
  data.verdictText = data.verdict.replace(/[^\x00-\x7F]/g, "").trim() || data.verdict;

  // ── Build the display card ────────────────────────────────────────────────
  const lines = [];
  const changeEmoji = data.change24h >= 0 ? "📈" : "📉";

  if (dex) {
    lines.push(`🪙 *${data.symbol}* — ${data.name}`);
    lines.push(`📍 \`${address.slice(0,6)}...${address.slice(-6)}\``);
    lines.push(``);
    lines.push(`💵 Price: *$${data.price < 0.0001 ? data.price.toExponential(4) : data.price.toFixed(6)}*`);
    lines.push(`${changeEmoji} 24h: *${formatChange(data.change24h)}*  6h: ${formatChange(data.change6h)}  1h: ${formatChange(data.change1h)}`);
    lines.push(``);
    lines.push(`💧 Liquidity:  *${formatUsd(data.liquidity)}*`);
    lines.push(`📊 24h Volume: *${formatUsd(data.volume24h)}*`);
    lines.push(`💎 Market Cap: *${formatUsd(data.marketCap)}*`);
    lines.push(`🔄 Buys/Sells: *${data.buys} / ${data.sells}* (ratio ${data.buySellRatio})`);
    lines.push(`🕐 Pair Age:   *${data.ageStr}*`);
    if (data.socials?.length) {
      lines.push(`🌐 ${data.socials.map(s => `${s.type}: ${s.url}`).join("  |  ")}`);
    }
  } else {
    lines.push(`⚠️ *No DexScreener data found*`);
    lines.push(`Token may be very new, unlisted, or the address is incorrect.`);
  }

  lines.push(``);
  lines.push(`─────────────────────`);

  if (rug) {
    lines.push(`🛡 Risk Score: *${data.riskScore}/1000 — ${data.verdict}*`);
    lines.push(`👥 Top 10 Holders: *${data.top10Pct !== null ? data.top10Pct + "%" : "N/A"}* of supply`);
    lines.push(`🔒 LP Locked: *${data.lpLockedPct.toFixed(1)}%*  |  LP Burned: *${data.lpBurnedPct.toFixed(1)}%*`);
    lines.push(`👤 Total Holders: *${data.totalHolders ?? "N/A"}*`);
    if (data.hasInsiders) lines.push(`⚠️ Insider wallets detected in top holders`);

    if (data.redFlags.length > 0) {
      lines.push(``);
      lines.push(`🚩 *Red Flags:*`);
      data.redFlags.slice(0, 4).forEach(r => {
        lines.push(`${r.level === "danger" ? "🔴" : "🟡"} ${r.name}: ${r.description}`);
      });
    }
  } else {
    lines.push(`🛡 RugCheck: Unable to fetch safety data`);
  }

  const question = [
    `*What's your goal with this token?*`,
    ``,
    `A) 🟢 Thinking of buying`,
    `B) 🟡 Already holding`,
    `C) 🔴 Smells like a rug`,
    `D) 🔵 Just curious`,
    ``,
    `_Or ask me anything: "who are the whales?", "is this safe to hold overnight?", "check sentiment" — I'll reason with the data I just pulled._`,
  ].join("\n");

  return { card: lines.join("\n"), question, data };
}

module.exports = { analyzeToken, containsSolanaAddress };
