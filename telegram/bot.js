#!/usr/bin/env node
/**
 * ElinosaAI Telegram Bot - Plain JavaScript (no TypeScript required)
 * Run with: node telegram/bot.js
 * Or via pnpm: pnpm run telegram
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ─── Load .env manually ───────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  try {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
    console.log("✅ .env loaded");
  } catch (e) {
    console.warn("⚠️  Could not load .env:", e.message);
  }
}
loadEnv();

// ─── Config ───────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const AGENT_BASE_URL = (process.env.AGENT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const DEFAULT_SERVER_ID = "00000000-0000-0000-0000-000000000000";

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not found in .env");
  process.exit(1);
}

console.log("🤖 ElinosaAI Telegram Bot starting...");
console.log("   Agent URL:", AGENT_BASE_URL);
console.log("   Token:", TELEGRAM_TOKEN.slice(0, 10) + "...");

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpRequest(urlStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: options.timeout || 35000,
    };

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

async function tgCall(method, body) {
  try {
    const res = await httpRequest(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      body
    );
    return res.body;
  } catch (e) {
    console.error(`tgCall ${method} error:`, e.message);
    return null;
  }
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────
function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > start) end = nl;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

async function sendMessage(chatId, text) {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    // Try markdown first, fallback to plain
    const res = await tgCall("sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "Markdown",
    });
    if (res && !res.ok) {
      await tgCall("sendMessage", { chat_id: chatId, text: chunk });
    }
  }
}

async function sendTyping(chatId) {
  await tgCall("sendChatAction", { chat_id: chatId, action: "typing" });
}

// ─── Agent API ────────────────────────────────────────────────────────────────
let cachedAgentId = null;

async function getAgentId() {
  if (cachedAgentId) return cachedAgentId;

  for (const endpoint of [`${AGENT_BASE_URL}/api/agents`, `${AGENT_BASE_URL}/agents`]) {
    try {
      const res = await httpRequest(endpoint, {}, null);
      if (res.status !== 200) continue;
      const data = res.body;
      const list = Array.isArray(data) ? data : (data.agents || data.data || []);
      if (list.length === 0) continue;
      const match = list.find((a) => a.name && a.name.toLowerCase() === "elinosaai");
      const id = (match || list[0]).id;
      console.log(`✅ Agent found: ${id} (via ${endpoint})`);
      cachedAgentId = id;
      return id;
    } catch (e) {
      console.warn(`  tried ${endpoint}:`, e.message);
    }
  }
  return null;
}

const userChannels = new Map();

async function ensureChannel(agentId, userId) {
  if (userChannels.has(userId)) return userChannels.get(userId);
  try {
    const res = await httpRequest(
      `${AGENT_BASE_URL}/api/messaging/channels`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      {
        name: `telegram-${userId}`,
        type: "DM",
        serverId: DEFAULT_SERVER_ID,
        participants: [agentId],
        metadata: { source: "telegram", userId },
      }
    );
    const id = res.body?.id || res.body?.channel?.id || `telegram-${userId}`;
    userChannels.set(userId, id);
    return id;
  } catch {
    const fallback = `telegram-${userId}`;
    userChannels.set(userId, fallback);
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollForReply(channelId, excludeAuthorId, timeoutMs = 30000) {
  const start = Date.now();
  const seenIds = new Set();

  // Snapshot existing messages
  try {
    const init = await httpRequest(
      `${AGENT_BASE_URL}/api/messaging/channels/${channelId}/messages?limit=10`
    );
    const msgs = init.body?.messages || init.body?.data || init.body || [];
    if (Array.isArray(msgs)) msgs.forEach((m) => seenIds.add(m.id));
  } catch {}

  while (Date.now() - start < timeoutMs) {
    await sleep(1500);
    try {
      const res = await httpRequest(
        `${AGENT_BASE_URL}/api/messaging/channels/${channelId}/messages?limit=10`
      );
      const msgs = res.body?.messages || res.body?.data || res.body || [];
      if (!Array.isArray(msgs)) continue;
      for (const msg of [...msgs].reverse()) {
        if (seenIds.has(msg.id)) continue;
        seenIds.add(msg.id);
        if (msg.author_id !== excludeAuthorId) {
          return msg.content || msg.text || null;
        }
      }
    } catch {}
  }
  return null;
}

async function askAgent(agentId, userId, userName, text) {
  // Try new ElizaOS 1.7 messaging API first
  try {
    const channelId = await ensureChannel(agentId, userId);
    const res = await httpRequest(
      `${AGENT_BASE_URL}/api/messaging/central-dispatch`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      {
        channel_id: channelId,
        server_id: DEFAULT_SERVER_ID,
        author_id: userId,
        author_display_name: userName,
        content: text,
        source_type: "telegram",
        raw_message: { text },
      }
    );

    if (res.status === 200 || res.status === 201) {
      const reply = await pollForReply(channelId, userId);
      if (reply) return reply;
    }
  } catch (e) {
    console.warn("New API failed, trying legacy:", e.message);
  }

  // Legacy fallback
  for (const url of [
    `${AGENT_BASE_URL}/api/agents/${agentId}/message`,
    `${AGENT_BASE_URL}/${agentId}/message`,
  ]) {
    try {
      const res = await httpRequest(
        url,
        { method: "POST", headers: { "Content-Type": "application/json" } },
        { text, userId, userName, roomId: `telegram-${userId}` }
      );
      if (res.status !== 200) continue;
      const data = res.body;
      if (Array.isArray(data) && data.length > 0) {
        return data.map((m) => m.text || "").filter(Boolean).join("\n\n");
      }
      if (data?.text) return data.text;
    } catch {}
  }

  return "⚠️ Could not reach ElinosaAI. Make sure the agent is fully started on port 3000.";
}

// ─── Message handler ──────────────────────────────────────────────────────────
let offset = 0;

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const userName = msg.from.username || msg.from.first_name || userId;
  const text = msg.text.trim();

  console.log(`📨 [${userName}]: ${text}`);

  if (text === "/start") {
    await sendMessage(chatId,
      `👋 *Welcome to ElinosaAI!*\n\n` +
      `I'm your Solana memecoin intelligence agent.\n\n` +
      `*What I can do:*\n` +
      `- Paste any Solana token address to get live price, liquidity, volume and rug risk score\n` +
      `- Ask me to check a wallet for recent transaction activity\n` +
      `- Reply A, B, C or D after a scan for tailored analysis\n\n` +
      `Powered by DexScreener, RugCheck, Helius and Nosana GPU\n\n` +
      `Drop a token address to begin. DYOR - this is data, not financial advice.`
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(chatId,
      `*ElinosaAI Commands:*\n\n` +
      `- Paste a Solana token address for full token analysis\n` +
      `- Type: check wallet ADDRESS for recent wallet transactions\n` +
      `- Reply A - entry analysis (thinking of buying)\n` +
      `- Reply B - exit signals (already holding)\n` +
      `- Reply C - rug safety breakdown\n` +
      `- Reply D - general project info\n\n` +
      `All data is live. No financial advice given.`
    );
    return;
  }

  const agentId = await getAgentId();
  if (!agentId) {
    await sendMessage(chatId, "⚠️ ElinosaAI is still starting up. Please wait 10 seconds and try again.");
    return;
  }

  await sendTyping(chatId);
  const reply = await askAgent(agentId, userId, userName, text);
  await sendMessage(chatId, reply);
}

async function poll() {
  try {
    const res = await httpRequest(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message"]`,
      { timeout: 35000 }
    );
    if (!res.body || !res.body.ok) return;
    for (const update of res.body.result || []) {
      offset = update.update_id + 1;
      await handleUpdate(update).catch((e) => console.error("handleUpdate error:", e.message));
    }
  } catch (e) {
    console.error("Poll error:", e.message);
    await sleep(3000);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function main() {
  await tgCall("deleteWebhook", {});
  const me = await tgCall("getMe", {});
  console.log(`✅ Telegram bot: @${me?.result?.username || "unknown"}`);

  // Try to find agent
  const id = await getAgentId();
  if (!id) console.warn("⚠️  Agent not found yet - will retry when messages arrive");

  console.log("\n🟢 Polling for messages. Press Ctrl+C to stop.\n");
  while (true) {
    await poll();
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
