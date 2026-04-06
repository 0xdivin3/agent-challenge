const fs = require("fs");
const path = require("path");

// Load .env manually
try {
  const lines = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
  console.log("✅ .env loaded");
} catch (e) {}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const BASE = (process.env.AGENT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const AGENT_ID = "892eb016-cd1c-0f36-b531-8a938d776ff2";

const CHANNEL_ID = "00000000-0000-0000-0000-000000000000";
const SERVER_ID  = "00000000-0000-0000-0000-000000000000";

// Import token analyzer and conversation handler
const { containsSolanaAddress, analyzeToken } = require("./token-analyzer.cjs");
const { generateResponse } = require("./conversation-handler.cjs");

if (!TOKEN) { console.error("❌ No TELEGRAM_BOT_TOKEN"); process.exit(1); }

console.log("🤖 ElinosaAI Telegram Bot starting...");
console.log("   Agent:", BASE);

const TG = "https://api.telegram.org/bot" + TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toUUID(telegramId) {
  const padded = String(telegramId).padStart(12, "0");
  return `00000000-0000-0000-0000-${padded}`;
}

async function tg(method, body) {
  try {
    const r = await fetch(`${TG}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return r.json();
  } catch (e) { return null; }
}

async function send(chatId, text) {
  for (let i = 0; i < text.length; i += 4000) {
    const chunk = text.slice(i, i + 4000);
    const r = await tg("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "Markdown" });
    if (!r?.ok) await tg("sendMessage", { chat_id: chatId, text: chunk });
  }
}

let agentRegistered = false;
async function ensureAgentInChannel() {
  if (agentRegistered) return;
  try {
    // Step 0: Patch agent server_id so the runtime routes messages correctly
    const rp = await fetch(`${BASE}/api/agents/${AGENT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: SERVER_ID })
    });
    console.log("  Agent server_id patch:", rp.status);

    // Step 1: Subscribe agent to the message server (this wakes up the processing loop)
    const rs = await fetch(`${BASE}/api/messaging/message-servers/${SERVER_ID}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: AGENT_ID })
    });
    const ds = await rs.json();
    console.log("  Server subscription:", rs.status, ds?.data?.message || ds?.error || "");

    // Step 2: Add agent to the channel
    const r = await fetch(`${BASE}/api/messaging/channels/${CHANNEL_ID}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: AGENT_ID })
    });
    const d = await r.json();
    if (r.status === 200 || r.status === 201) {
      console.log("✅ Agent registered to channel");
    } else {
      console.warn("  channel register:", d?.error || r.status);
    }
    agentRegistered = true; // Don't keep retrying regardless of result
  } catch (e) { console.warn("  register err:", e.message); }
}

// Get all current message IDs to use as a baseline
async function getMessageIds() {
  try {
    const r = await fetch(`${BASE}/api/messaging/channels/${CHANNEL_ID}/messages?limit=50`);
    const d = await r.json();
    const msgs = d?.data?.messages || [];
    return new Set(msgs.map(m => m.id));
  } catch (e) { return new Set(); }
}

async function askAgent(userId, userName, text) {
  // Use the comprehensive conversation handler
  try {
    const response = await generateResponse(userId, userName, text);
    if (response) {
      console.log("  ✅ Generated response");
      return response;
    }
  } catch (e) {
    console.warn("  ⚠️ Generation error:", e.message);
  }

  return "⏳ Agent is thinking... send your message again.";
}

async function handle(update) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const userName = msg.from.username || msg.from.first_name || userId;
  const text = msg.text.trim();
  console.log(`📨 [${userName}]: ${text}`);

  if (text === "/start") return send(chatId,
    "👋 *Welcome to ElinosaAI!*\n\n" +
    "Paste any Solana token address for a live analysis:\n" +
    "• 📊 Price & volume (DexScreener)\n" +
    "• 🛡 Rug risk score (RugCheck)\n" +
    "• 🔍 Wallet activity (Helius)\n\n" +
    "_DYOR — not financial advice._"
  );
  if (text === "/help") return send(chatId,
    "*Commands:*\n• Paste token address → full scan\n• `check wallet ADDRESS`\n• Reply A/B/C/D after a scan"
  );

  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const reply = await askAgent(userId, userName, text);
  if (reply && typeof reply === "object" && reply.card) {
    await send(chatId, reply.card);
    await new Promise(r => setTimeout(r, 1000));
    await send(chatId, reply.question);
  } else {
    await send(chatId, reply);
  }
}

let offset = 0;
async function poll() {
  try {
    const r = await fetch(`${TG}/getUpdates?offset=${offset}&timeout=25&allowed_updates=%5B%22message%22%5D`);
    const data = await r.json();
    if (!data?.ok) return;
    for (const u of data.result || []) {
      offset = u.update_id + 1;
      handle(u).catch(e => console.error("handle err:", e.message));
    }
  } catch (e) {
    console.error("Poll error:", e.message);
    await sleep(3000);
  }
}

async function main() {
  await tg("deleteWebhook", {});
  const me = await tg("getMe", {});
  if (!me?.ok) { console.error("❌ Bad Telegram token"); process.exit(1); }
  console.log("✅ Bot: @" + me.result.username);

  await ensureAgentInChannel();

  console.log("🟢 Polling...\n");
  while (true) await poll();
}

main().catch(e => { console.error(e); process.exit(1); });
