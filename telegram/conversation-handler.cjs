/**
 * ElinosaAI Conversation Handler v6
 *
 * LLM: Groq llama-3.3-70b-versatile (switched from Nosana inference — endpoint was 503)
 * Key fix: retry with backoff on 503 — Nosana shared node is sometimes busy,
 * NOT permanently down. Up to 3 retries with 2s, 4s, 6s delays.
 */

const { analyzeToken, containsSolanaAddress } = require("./token-analyzer.cjs");

const userState = new Map();

// ─── LLM call — retries on 503, full error transparency ──────────────────────
async function callLLM(systemPrompt, userMessage) {
  const apiKey  = process.env.OPENAI_API_KEY;
  const apiUrl  = process.env.OPENAI_API_URL;
  const model   = process.env.MODEL_NAME || "Qwen/Qwen3.5-27B-AWQ-4bit";

  if (!apiKey || !apiUrl) {
    return { error: "OPENAI_API_KEY or OPENAI_API_URL not set in .env" };
  }

  const endpoint = `${apiUrl.replace(/\/v1\/?$/, "")}/v1/chat/completions`;
  const body = JSON.stringify({
    model,
    max_tokens: 600,
    temperature: 0.3,
    // Disable thinking mode — Qwen3 thinks by default, wastes tokens
    
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userMessage  },
    ],
  });

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 4000, 6000]; // ms between retries

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[LLM] attempt ${attempt}/${MAX_RETRIES} → ${endpoint} | model=${model}`);

    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(20000), // 20s per attempt
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body,
      });
    } catch (e) {
      const msg = `Network error: ${e.message}`;
      console.warn(`[LLM] attempt ${attempt} — ${msg}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt - 1]);
        continue;
      }
      return { error: msg };
    }

    // 503 = Nosana node busy/warming up — retry
    if (res.status === 503) {
      console.warn(`[LLM] attempt ${attempt} — 503 (node busy), retrying...`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt - 1]);
        continue;
      }
      return { error: "Nosana node returned 503 after 3 attempts — node may be overloaded. Try again in a moment." };
    }

    if (!res.ok) {
      const body2 = await res.text().catch(() => "");
      return { error: `LLM HTTP ${res.status}: ${body2.slice(0, 150)}` };
    }

    let d;
    try {
      d = await res.json();
    } catch (e) {
      return { error: "LLM returned invalid JSON" };
    }

    const msg = d?.choices?.[0]?.message;
    if (!msg) {
      return { error: `No message in LLM response: ${JSON.stringify(d).slice(0, 200)}` };
    }

    let text = (msg.content || "").trim();

    // Strip Qwen3 <think> blocks if enable_thinking wasn't respected
    if (text.includes("<think>")) {
      const thinkContent = (text.match(/<think>([\s\S]*?)<\/think>/) || [])[1] || "";
      const afterThink   = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      text = afterThink.length > 15 ? afterThink : thinkContent.trim();
    }

    // Some Qwen versions put answer in reasoning_content
    if (text.length < 10 && msg.reasoning_content?.trim().length > 10) {
      text = msg.reasoning_content.trim();
    }

    if (!text || text.length < 10) {
      return { error: `LLM returned empty answer after processing. Raw: "${(msg.content || "").slice(0, 100)}"` };
    }

    console.log(`[LLM] ✅ ${text.length} chars (attempt ${attempt})`);
    return { text };
  }

  return { error: "LLM failed after all retries" };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Token context ────────────────────────────────────────────────────────────
function buildTokenContext(d) {
  if (!d) return "No token data available.";
  const lpProt      = (d.lpLockedPct + d.lpBurnedPct).toFixed(1);
  const holdersText = d.topHolders?.length > 0
    ? d.topHolders.slice(0, 10).map((h, i) =>
        `  ${i+1}. ${h.address.slice(0,8)}...${h.address.slice(-6)} — ${(h.pct*100).toFixed(2)}%` +
        `${h.insider ? " [INSIDER]" : ""}${h.owner ? ` (${h.owner})` : ""}`
      ).join("\n")
    : "  Not available from RugCheck";

  return [
    `TOKEN: ${d.symbol} (${d.name})`,
    `ADDRESS: ${d.address}`,
    `PRICE: $${d.price < 0.0001 ? d.price.toExponential(4) : d.price.toFixed(6)}`,
    `PRICE CHANGE: 24h ${d.change24h >= 0 ? "+" : ""}${d.change24h.toFixed(2)}% | 6h ${d.change6h >= 0 ? "+" : ""}${d.change6h.toFixed(2)}% | 1h ${d.change1h >= 0 ? "+" : ""}${d.change1h.toFixed(2)}%`,
    `LIQUIDITY: $${(d.liquidity/1000).toFixed(1)}K`,
    `24H VOLUME: $${(d.volume24h/1000).toFixed(1)}K`,
    `MARKET CAP: $${(d.marketCap/1000).toFixed(1)}K`,
    `BUYS/SELLS (24h): ${d.buys} / ${d.sells} (ratio ${d.buySellRatio})`,
    `PAIR AGE: ${d.ageStr}`,
    `RISK SCORE: ${d.riskScore !== null ? d.riskScore + "/1000 — " + d.verdictText : "Not available"}`,
    `TOP 10 HOLDERS: ${d.top10Pct !== null ? d.top10Pct + "% of supply" : "N/A"}`,
    `LP LOCKED: ${d.lpLockedPct.toFixed(1)}% | LP BURNED: ${d.lpBurnedPct.toFixed(1)}% | TOTAL PROTECTION: ${lpProt}%`,
    `TOTAL HOLDERS: ${d.totalHolders ?? "N/A"}`,
    `INSIDER WALLETS: ${d.hasInsiders ? "YES" : "None detected"}`,
    `RED FLAGS: ${d.redFlags.length > 0 ? d.redFlags.map(r => r.name).join(", ") : "None"}`,
    `TOP HOLDER WALLETS:\n${holdersText}`,
    `SOCIALS: ${d.socials?.length > 0 ? d.socials.map(s => `${s.type}: ${s.url}`).join(" | ") : "None listed"}`,
  ].join("\n");
}

// ─── Whale answer ─────────────────────────────────────────────────────────────
function whaleAnswer(d) {
  const sym = d.symbol !== "Unknown" ? `$${d.symbol}` : "this token";
  if (!d.topHolders || d.topHolders.length === 0) {
    return [
      `🐋 *Whale data for ${sym}*`, ``,
      d.top10Pct !== null ? `• Top 10 hold *${d.top10Pct}%* of supply` : `• Holder data not returned by RugCheck`,
      `• Total holders: ${d.totalHolders ?? "N/A"}`,
      `• Insiders flagged: ${d.hasInsiders ? "⚠️ YES" : "None"}`, ``,
      `Check: https://rugcheck.xyz/tokens/${d.address}`,
      `Holders: https://solscan.io/token/${d.address}#holders`,
    ].join("\n");
  }
  const lines = [
    `🐋 *Top holders — ${sym}*`,
    `_(Top 10 = ${d.top10Pct !== null ? d.top10Pct + "%" : "?"} of supply)_`, ``,
  ];
  d.topHolders.slice(0, 10).forEach((h, i) => {
    const pct   = ((h.pct || 0) * 100).toFixed(2);
    const short = `${h.address.slice(0,8)}...${h.address.slice(-6)}`;
    const tags  = [h.insider ? "⚠️ INSIDER" : null, h.owner || null].filter(Boolean).join(", ");
    lines.push(`${i+1}. \`${short}\` — *${pct}%*${tags ? `  [${tags}]` : ""}`);
  });
  lines.push(``);
  if (d.top10Pct > 60)      lines.push(`🔴 High concentration — ${d.top10Pct}% in top 10. Dump risk is real.`);
  else if (d.top10Pct > 40) lines.push(`🟡 Moderate — watch for coordinated sells.`);
  else if (d.top10Pct)      lines.push(`🟢 ${d.top10Pct}% in top 10 — reasonably distributed.`);
  if (d.hasInsiders)        lines.push(`⚠️ Insider wallets present.`);
  lines.push(`\nhttps://rugcheck.xyz/tokens/${d.address}\nDYOR.`);
  return lines.join("\n");
}

// ─── Sentiment answer ─────────────────────────────────────────────────────────
function sentimentAnswer(d) {
  const sym    = d.symbol !== "Unknown" ? `$${d.symbol}` : "this token";
  const ratio  = parseFloat(d.buySellRatio);
  const mood   = isNaN(ratio) ? "unknown"
    : ratio >= 1.5 ? "Strong accumulation 🟢"
    : ratio >= 1.0 ? "Slight buy pressure 🟡"
    : "Selling pressure 🔴";
  const volMcap = d.marketCap > 0 ? (d.volume24h / d.marketCap * 100).toFixed(1) : null;
  return [
    `📡 *Sentiment — ${sym}*`, ``,
    `*On-chain:*`,
    `• Buy/sell ratio: *${d.buySellRatio}* — ${mood}`,
    `• 24h Buys: ${d.buys}  |  Sells: ${d.sells}`,
    volMcap ? `• Vol/MCap: *${volMcap}%* (${parseFloat(volMcap) > 20 ? "🔥 very high" : parseFloat(volMcap) > 5 ? "moderate" : "quiet"})` : null,
    `• 1h: ${d.change1h >= 0 ? "+" : ""}${d.change1h.toFixed(2)}%  |  6h: ${d.change6h >= 0 ? "+" : ""}${d.change6h.toFixed(2)}%`,
    ``, `*Socials:*`,
    d.socials?.length > 0 ? d.socials.map(s => `• ${s.type}: ${s.url}`).join("\n") : `• No socials on DexScreener ⚠️`,
    ``, `*Search X/Twitter:*  \`$${d.symbol}\``, ``, `DYOR.`,
  ].filter(Boolean).join("\n");
}

// ─── Analyst system prompt ────────────────────────────────────────────────────
function analystPrompt(ctx) {
  return `You are ElinosaAI — a Solana memecoin analyst running on Nosana decentralized GPU.
Answer using ONLY the token data below. Reference the actual numbers in every point.
Do NOT give generic advice. Be direct. Max 200 words. Use bullet points. End with DYOR.

${ctx}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
async function generateResponse(userId, userName, text) {
  const lower = text.toLowerCase().trim();

  // ── Token address scan ────────────────────────────────────────────────────
  if (containsSolanaAddress(text)) {
    console.log(`[Handler] Token scan`);
    const result = await analyzeToken(text);
    if (!result) return "⚠️ Could not fetch token data. Address may be invalid or APIs are down.";
    userState.set(userId, { data: result.data, timestamp: Date.now() });
    return { card: result.card, question: result.question };
  }

  const state  = userState.get(userId);
  const ageMin = state ? (Date.now() - state.timestamp) / 60000 : 999;
  const hasCtx = state && ageMin < 30;

  // ── A / B / C / D ──────────────────────────────────────────────────────────
  if (hasCtx && /^[A-Da-d]$/.test(lower)) {
    const goal  = lower.toUpperCase();
    const label = { A: "Thinking of Buying", B: "Already Holding", C: "Rug Safety Check", D: "Just Curious" }[goal];
    console.log(`[Handler] Goal ${goal}: ${label}`);
    const ctx = buildTokenContext(state.data);
    const llm = await callLLM(analystPrompt(ctx),
      `My goal: "${label}". Give me specific analysis of this token based on the numbers.`);
    if (llm.text) return llm.text;
    console.error(`[LLM] Failed:`, llm.error);
    return `⚠️ *Nosana LLM unavailable*\n_${llm.error}_\n\nRaw data:\n\`\`\`\n${ctx}\n\`\`\``;
  }

  // ── Greeting ───────────────────────────────────────────────────────────────
  if (/^(hi|hello|hey|hola|sup|yo)(\b|!|\.)/i.test(lower)) {
    return `👋 Hi ${userName || "there"}! Paste a Solana token address to scan it, or reply A/B/C/D after a scan. DYOR.`;
  }

  // ── Whale — structured data, instant ─────────────────────────────────────
  if (hasCtx && /whale|holder|top wallet|who (holds|owns|has)|distribution/i.test(text)) {
    return whaleAnswer(state.data);
  }

  // ── Sentiment — structured data, instant ─────────────────────────────────
  if (hasCtx && /sentiment|community|social|twitter|trending|hype/i.test(text)) {
    return sentimentAnswer(state.data);
  }

  // ── Any follow-up with token context ─────────────────────────────────────
  if (hasCtx && text.length > 2) {
    console.log(`[Handler] Follow-up → LLM`);
    const ctx = buildTokenContext(state.data);
    const llm = await callLLM(analystPrompt(ctx), text);
    if (llm.text) return llm.text;
    console.error(`[LLM] Failed:`, llm.error);
    return `⚠️ *Nosana LLM unavailable*\n_${llm.error}_\n\nRaw data:\n\`\`\`\n${ctx}\n\`\`\``;
  }

  // ── General Q&A ───────────────────────────────────────────────────────────
  if (text.length > 2 && !/^\//.test(text)) {
    console.log(`[Handler] General Q&A → LLM`);
    const sys = `You are ElinosaAI — Solana memecoin intelligence on Nosana GPU.
Help with questions about Solana tokens, rug pulls, liquidity, DeFi safety.
Max 180 words. Practical. End with DYOR. Never recommend specific tokens.`;
    const llm = await callLLM(sys, text);
    if (llm.text) return llm.text;
    return `⚠️ *Nosana LLM unavailable:* _${llm.error}_\n\nPaste a token address and I'll scan it.`;
  }

  return `👋 *ElinosaAI* — Solana memecoin intelligence on Nosana GPU\n\n• Paste a token address → live scan\n• Reply A/B/C/D after a scan\n• Ask anything about the token\n\n_DYOR — not financial advice._`;
}

module.exports = { generateResponse };
