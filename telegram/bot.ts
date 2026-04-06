/**
 * ElinosaAI Telegram Bot
 * Run with: pnpm run telegram
 */
import * as dotenv from "dotenv";
dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const AGENT_BASE_URL = (process.env.AGENT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const DEFAULT_SERVER_ID = "00000000-0000-0000-0000-000000000000";

if (!TELEGRAM_TOKEN) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const TG = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function tgCall(method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const chunks = chunkText(text, 4000);
  for (const chunk of chunks) {
    // Try with Markdown first, fall back to plain text
    const res: any = await tgCall("sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "Markdown",
    });
    if (!res.ok) {
      await tgCall("sendMessage", { chat_id: chatId, text: chunk });
    }
  }
}

async function sendTyping(chatId: number): Promise<void> {
  await tgCall("sendChatAction", { chat_id: chatId, action: "typing" });
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + max, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > i) end = nl;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Agent discovery ───────────────────────────────────────────────────────────

let cachedAgentId: string | null = null;

async function getAgentId(): Promise<string | null> {
  if (cachedAgentId) return cachedAgentId;
  for (const url of [`${AGENT_BASE_URL}/api/agents`, `${AGENT_BASE_URL}/agents`]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : (data?.agents ?? data?.data ?? []);
      if (!list.length) continue;
      const agent = list.find((a) => a.name?.toLowerCase() === "elinosaai") ?? list[0];
      cachedAgentId = agent.id;
      console.log(`Agent found: ${agent.name} (${cachedAgentId}) via ${url}`);
      return cachedAgentId;
    } catch { continue; }
  }
  return null;
}

// ── Message sending ───────────────────────────────────────────────────────────

const userChannels = new Map<string, string>();

async function askAgent(agentId: string, userId: string, userName: string, text: string): Promise<string> {
  // Try new ElizaOS 1.7 messaging API first
  try {
    let channelId = userChannels.get(userId);
    if (!channelId) {
      const cr = await fetch(`${AGENT_BASE_URL}/api/messaging/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `tg-${userId}`,
          type: "DM",
          serverId: DEFAULT_SERVER_ID,
          participants: [agentId],
        }),
      });
      if (cr.ok) {
        const cd = await cr.json();
        channelId = cd?.id ?? cd?.channel?.id ?? `tg-${userId}`;
      } else {
        channelId = `tg-${userId}`;
      }
      userChannels.set(userId, channelId!);
    }

    // Get existing message IDs before sending
    const seenIds = new Set<string>();
    try {
      const existing = await fetch(`${AGENT_BASE_URL}/api/messaging/channels/${channelId}/messages?limit=5`);
      if (existing.ok) {
        const ed = await existing.json();
        (ed?.messages ?? ed?.data ?? ed ?? []).forEach((m: any) => seenIds.add(m.id));
      }
    } catch { /* ok */ }

    // Send message
    const sr = await fetch(`${AGENT_BASE_URL}/api/messaging/central-dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_id: channelId,
        server_id: DEFAULT_SERVER_ID,
        author_id: userId,
        author_display_name: userName,
        content: text,
        source_type: "telegram",
        raw_message: { text },
      }),
    });

    if (sr.ok) {
      // Poll for reply up to 35s
      const deadline = Date.now() + 35000;
      while (Date.now() < deadline) {
        await sleep(1500);
        try {
          const pr = await fetch(`${AGENT_BASE_URL}/api/messaging/channels/${channelId}/messages?limit=10`);
          if (!pr.ok) continue;
          const pd = await pr.json();
          const msgs: any[] = pd?.messages ?? pd?.data ?? pd ?? [];
          for (const msg of msgs.reverse()) {
            if (!seenIds.has(msg.id) && msg.author_id !== userId) {
              return msg.content ?? msg.text ?? "...";
            }
          }
        } catch { /* keep polling */ }
      }
      return "I processed your message but the reply timed out. Try again.";
    }
  } catch { /* fall through to legacy */ }

  // Legacy fallback: old /:agentId/message endpoint
  for (const url of [
    `${AGENT_BASE_URL}/api/agents/${agentId}/message`,
    `${AGENT_BASE_URL}/${agentId}/message`,
  ]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, userId, userName, roomId: `telegram-${userId}` }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((m: any) => m.text ?? "").filter(Boolean).join("\n\n");
      }
      if (data?.text) return data.text;
    } catch { continue; }
  }

  return `Could not reach the agent at ${AGENT_BASE_URL}. Is it still running?`;
}

// ── Update handler ────────────────────────────────────────────────────────────

let offset = 0;

async function handleUpdate(update: any): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId: number = msg.chat.id;
  const userId = String(msg.from.id);
  const userName: string = msg.from.username ?? msg.from.first_name ?? userId;
  const text: string = msg.text.trim();

  console.log(`[${userName}]: ${text}`);

  if (text === "/start") {
    await sendMessage(chatId,
      `*Welcome to ElinosaAI!*\n\n` +
      `I am your Solana memecoin intelligence agent.\n\n` +
      `*What I can do:*\n` +
      `- Paste any Solana token address to get live price, liquidity, volume and rug risk score\n` +
      `- Ask me to check a wallet for recent activity\n` +
      `- Reply A, B, C or D after a scan for tailored analysis\n\n` +
      `Powered by DexScreener, RugCheck, Helius and Nosana GPU.\n\n` +
      `Drop a token address to begin. DYOR - this is data, not financial advice.`
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(chatId,
      `*ElinosaAI Commands:*\n\n` +
      `- Paste a Solana token address to get a full token analysis\n` +
      `- Type: check wallet ADDRESS to see recent transactions\n` +
      `- Reply A - thinking of buying (entry analysis)\n` +
      `- Reply B - already holding (exit signals)\n` +
      `- Reply C - rug safety breakdown\n` +
      `- Reply D - general project info\n\n` +
      `All data is live. No financial advice given.`
    );
    return;
  }

  const agentId = await getAgentId();
  if (!agentId) {
    await sendMessage(chatId, `ElinosaAI is still starting up. Please wait a few seconds and try again.`);
    return;
  }

  await sendTyping(chatId);
  const reply = await askAgent(agentId, userId, userName, text);
  await sendMessage(chatId, reply);
}

async function poll(): Promise<void> {
  try {
    const res = await fetch(
      `${TG}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message"]`
    );
    if (!res.ok) return;
    const data: any = await res.json();
    if (!data.ok) return;
    for (const update of data.result) {
      offset = update.update_id + 1;
      await handleUpdate(update).catch((e: any) => console.error("handleUpdate error:", e));
    }
  } catch (e) {
    console.error("Poll error:", e);
    await sleep(3000);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("ElinosaAI Telegram Bot starting...");
  console.log(`Agent URL: ${AGENT_BASE_URL}`);
  console.log(`Token loaded: ${TELEGRAM_TOKEN ? "YES" : "NO"}`);

  await tgCall("deleteWebhook", {});
  const me: any = await tgCall("getMe", {});
  console.log(`Telegram bot: @${me?.result?.username ?? "unknown"}`);

  // Try to connect to agent on startup
  const id = await getAgentId();
  if (!id) console.warn("Agent not found yet - will retry when messages arrive");

  console.log("Polling for messages...\n");
  while (true) { await poll(); }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
