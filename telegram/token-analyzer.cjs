/**
 * Token Analysis Helper
 * Returns { card, question } — two separate Telegram messages
 */

function isSolanaAddress(text) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text.trim());
}

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
  if (score >= 800) return "✅ SAFE";
  if (score >= 500) return "⚠️ CAUTION";
  if (score >= 200) return "🔴 HIGH RISK";
  return "💀 DANGER";
}

async function fetchDexScreener(address) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (data.pairs ?? []).filter(p => p.chainId === "solana");
    if (pairs.length === 0) return null;
    return pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  } catch { return null; }
}

async function fetchRugCheck(address) {
  try {
    const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Returns { card, question, raw } or null
async function analyzeToken(text) {
  const address = extractAddress(text);
  if (!address) return null;

  const [dex, rug] = await Promise.all([
    fetchDexScreener(address),
    fetchRugCheck(address),
  ]);

  // ── Build the data card (Message 1) ───────────────────────────────────────
  const lines = [];

  if (dex) {
    const sym    = dex.baseToken?.symbol || "??";
    const name   = dex.baseToken?.name   || "Unknown";
    const price  = parseFloat(dex.priceUsd || 0);
    const liq    = parseFloat(dex.liquidity?.usd || 0);
    const vol    = parseFloat(dex.volume?.h24 || 0);
    const mc     = parseFloat(dex.marketCap || dex.fdv || 0);
    const c24    = parseFloat(dex.priceChange?.h24 || 0);
    const c6     = parseFloat(dex.priceChange?.h6  || 0);
    const c1     = parseFloat(dex.priceChange?.h1  || 0);
    const buys   = dex.txns?.h24?.buys  || 0;
    const sells  = dex.txns?.h24?.sells || 0;
    const ratio  = sells > 0 ? (buys / sells).toFixed(2) : "N/A";
    const ageMs  = Date.now() - (dex.pairCreatedAt ?? 0);
    const ageH   = Math.floor(ageMs / 3600000);
    const ageD   = Math.floor(ageH / 24);
    const ageStr = ageD > 0 ? `${ageD}d ${ageH % 24}h` : `${ageH}h`;
    const changeEmoji = c24 >= 0 ? "📈" : "📉";

    lines.push(`🪙 *${sym}* — ${name}`);
    lines.push(`📍 \`${address.slice(0,6)}...${address.slice(-6)}\``);
    lines.push(``);
    lines.push(`💵 Price: *$${price < 0.0001 ? price.toExponential(4) : price.toFixed(6)}*`);
    lines.push(`${changeEmoji} 24h: *${formatChange(c24)}*  6h: ${formatChange(c6)}  1h: ${formatChange(c1)}`);
    lines.push(``);
    lines.push(`💧 Liquidity:  *${formatUsd(liq)}*`);
    lines.push(`📊 24h Volume: *${formatUsd(vol)}*`);
    lines.push(`💎 Market Cap: *${formatUsd(mc)}*`);
    lines.push(`🔄 Buys/Sells: *${buys} / ${sells}* (ratio ${ratio})`);
    lines.push(`🕐 Pair Age:   *${ageStr}*`);
  } else {
    lines.push(`⚠️ *No DexScreener data found*`);
    lines.push(`Token may be very new, unlisted, or the address is incorrect.`);
  }

  lines.push(``);
  lines.push(`─────────────────────`);

  if (rug) {
    const score    = rug.score_normalised ?? rug.score ?? 0;
    const verdict  = getVerdict(score, rug.rugged);
    const top10    = (rug.topHolders || []).slice(0, 10);
    const top10pct = top10.length > 0
      ? top10.reduce((s, h) => s + (h.pct || 0), 0).toFixed(1) + "%"
      : "N/A";
    const lpLocked  = (rug.markets?.[0]?.lp?.lpLockedPct  ?? 0).toFixed(1);
    const lpBurned  = (rug.markets?.[0]?.lp?.lpBurnedPct  ?? 0).toFixed(1);
    const holders   = rug.totalHolders ?? "N/A";
    const insiders  = top10.some(h => h.insider);

    lines.push(`🛡 Risk Score: *${score}/1000 — ${verdict}*`);
    lines.push(`👥 Top 10 Holders: *${top10pct}* of supply`);
    lines.push(`🔒 LP Locked: *${lpLocked}%*  |  LP Burned: *${lpBurned}%*`);
    lines.push(`👤 Total Holders: *${holders}*`);
    if (insiders) lines.push(`⚠️ Insider wallets in top holders`);

    const flags = (rug.risks || [])
      .filter(r => r.level === "danger" || r.level === "warning")
      .slice(0, 4);

    if (flags.length > 0) {
      lines.push(``);
      lines.push(`🚩 *Red Flags:*`);
      flags.forEach(r => {
        lines.push(`${r.level === "danger" ? "🔴" : "🟡"} ${r.name}: ${r.description}`);
      });
    }
  } else {
    lines.push(`🛡 RugCheck: Unable to fetch safety data`);
  }

  // ── Goal question (Message 2) ─────────────────────────────────────────────
  const question = [
    `*What's your goal with this token?*`,
    ``,
    `A) 🟢 Thinking of buying`,
    `B) 🟡 Already holding`,
    `C) 🔴 Smells like a rug`,
    `D) 🔵 Just curious`,
    ``,
    `_Reply A, B, C, or D — I'll tailor my analysis. DYOR._`,
  ].join("\n");

  // raw text for LLM context (no markdown)
  const raw = lines.join("\n");

  return { card: lines.join("\n"), question, raw };
}

module.exports = { analyzeToken, containsSolanaAddress, isSolanaAddress, extractAddress };
