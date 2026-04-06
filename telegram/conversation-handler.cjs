/**
 * ElinosaAI Conversation Handler
 * Flow:
 *  1. Token address → fetch real data → return { card, question } (two messages)
 *  2. A/B/C/D reply → LLM answers using stored token context
 *  3. Follow-up question → LLM answers with token context
 *  4. General question → LLM answers
 */

const { analyzeToken, containsSolanaAddress } = require("./token-analyzer.cjs");

const userState = new Map();

// ─── Groq LLM call ────────────────────────────────────────────────────────────
async function callLLM(systemPrompt, userMessage) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        max_tokens: 600,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage  },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
// Returns either:
//   { card: string, question: string }  — for token analysis (2 messages)
//   string                              — for everything else (1 message)
async function generateResponse(userId, userName, text) {
  const lower = text.toLowerCase().trim();

  // ── Token address detected ────────────────────────────────────────────────
  if (containsSolanaAddress(text)) {
    console.log(`[Handler] Token detected — fetching live data...`);
    const result = await analyzeToken(text);

    if (!result) {
      return "⚠️ Could not fetch token data. Address may be invalid or APIs are down.";
    }

    // Save raw data for follow-up Q&A (30 min window)
    userState.set(userId, {
      raw: result.raw,
      timestamp: Date.now(),
    });

    // Return two-message object
    return { card: result.card, question: result.question };
  }

  // ── A/B/C/D goal reply ────────────────────────────────────────────────────
  const state = userState.get(userId);
  const ageMin = state ? (Date.now() - state.timestamp) / 60000 : 999;

  if (state && ageMin < 30 && /^[A-Da-d]$/.test(lower)) {
    const goal = lower.toUpperCase();
    const goalLabel = { A: "Thinking of Buying", B: "Already Holding", C: "Rug Safety Check", D: "Just Curious" }[goal];
    console.log(`[Handler] Goal: ${goal} — ${goalLabel}`);

    const sys = `You are ElinosaAI, a Solana memecoin intelligence agent on Nosana GPU.
The user scanned a token and selected goal: "${goalLabel}".
Using ONLY the token data below, give focused practical advice for their goal.
Be concise (under 250 words), use bullet points, end with DYOR.
Do not use markdown headers (##). Use *bold* sparingly.`;

    const llm = await callLLM(sys, `Token data:\n${state.raw}\n\nUser goal: ${goal} — ${goalLabel}`);
    return llm || fallbackGoal(goal);
  }

  // ── Follow-up question about last token ───────────────────────────────────
  if (state && ageMin < 30 && text.length > 4) {
    const isQuestion = /\?|what|why|how|is |can |should|safe|risk|buy|sell|hold/i.test(text);
    if (isQuestion) {
      console.log(`[Handler] Follow-up question with token context`);
      const sys = `You are ElinosaAI, a Solana memecoin intelligence agent on Nosana GPU.
Answer the user's question using ONLY the token data below.
Be concise (under 200 words). End with DYOR.

Token data:
${state.raw}`;
      const llm = await callLLM(sys, text);
      return llm || "Paste a fresh token address or ask a general Solana question.";
    }
  }

  // ── General Solana Q&A ─────────────────────────────────────────────────────
  const isGeneral = /rug|solana|token|memecoin|liquidity|pump|dyor|what is|how to|explain|nosana|help|\?/i.test(text);
  if (isGeneral) {
    console.log(`[Handler] General Q&A`);
    const sys = `You are ElinosaAI, a Solana memecoin intelligence agent on Nosana decentralized GPU.
Help users understand Solana tokens, rug pulls, liquidity, and DeFi safety.
Be concise (under 200 words), practical, end with DYOR. Never recommend specific tokens.`;
    const llm = await callLLM(sys, text);
    return llm || genericHelp();
  }

  return helpMessage();
}

// ─── Fallbacks ────────────────────────────────────────────────────────────────
function fallbackGoal(goal) {
  const r = {
    A: `🟢 *Thinking of Buying*\n\n✅ Look for: Risk score 700+, Liquidity $500K+, Top 10 holders <40%, LP locked, Pair age >48h\n🚩 Avoid: Score <400, Liquidity <$50K, LP unlocked\n\nMax 1-2% portfolio. Set a stop-loss. DYOR.`,
    B: `🟡 *Already Holding*\n\n📊 Watch for exit: Buy/sell ratio drops below 0.7, volume spike with no price rise, top holders % falling\n💡 If up 3x — take out your initial (house money)\n\nDYOR.`,
    C: `🔴 *Rug Safety Check*\n\n1. Mint authority — revoked?\n2. LP locked/burned — yes?\n3. Top 10 holders — under 40%?\n4. Risk score — above 500?\n5. Insider wallets — any flagged?\n\nScore <300 = danger zone. DYOR.`,
    D: `🔵 *Just Curious*\n\n📖 Key terms:\n• Market Cap = price × supply\n• Liquidity = how much you can trade without slippage\n• Volume = 24h activity\n• Pair Age = how old the trading pair is\n\nCheck DexScreener + Solscan for on-chain data. DYOR.`,
  };
  return r[goal] || helpMessage();
}

function genericHelp() {
  return `I'm ElinosaAI — Solana memecoin intelligence on Nosana GPU.\n\nPaste a token address for live analysis, or ask about rug pulls, liquidity, or Solana DeFi. DYOR.`;
}

function helpMessage() {
  return `👋 *ElinosaAI* — Solana memecoin intelligence on Nosana GPU\n\n• Paste a token address → live DexScreener + RugCheck scan\n• Reply A/B/C/D after a scan for tailored advice\n• Ask anything about Solana, rugs, liquidity\n\n_DYOR — not financial advice._`;
}

module.exports = { generateResponse };
