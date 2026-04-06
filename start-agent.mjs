#!/usr/bin/env node
/**
 * ElinosaAI launcher
 * - Serves web UI at http://localhost:4000
 * - Exposes /api/config so the UI reads GROQ_API_KEY from .env
 * - Starts ElizaOS (LLM backend)
 * - Starts bot.cjs (Telegram handler)
 */

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env ─────────────────────────────────────────────────────────────────
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
  console.log("✅ .env loaded");
}

const WEB_PORT = process.env.WEB_PORT || 4000;
const htmlPath = join(__dirname, "public", "index.html");

// ── Web server ────────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/api/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ready: true }));
    return;
  }

  if (existsSync(htmlPath)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readFileSync(htmlPath));
  } else {
    res.writeHead(404);
    res.end("Web UI not found — make sure public/index.html exists");
  }
});

server.listen(WEB_PORT, () => {
  console.log(`\n🌐 Web UI:  http://localhost:${WEB_PORT}`);
  console.log(`   Config:  http://localhost:${WEB_PORT}/api/config\n`);
});

// ── ElizaOS ───────────────────────────────────────────────────────────────────
console.log("🚀 Starting ElinosaAI...");

const elizaos = spawn("elizaos", [
  "start", "--character", "./characters/solbrief.character.json"
], { stdio: "inherit", cwd: __dirname, shell: true });

elizaos.on("error", (err) => console.error("ElizaOS error:", err.message));

// ── Telegram bot (waits 8s for ElizaOS to boot) ───────────────────────────────
setTimeout(() => {
  console.log("\n🤖 Starting Telegram bot...\n");
  const bot = spawn("node", ["telegram/bot.cjs"], {
    stdio: "inherit", cwd: __dirname, shell: true
  });
  bot.on("error", (err) => console.error("Bot error:", err.message));
  bot.on("exit", (code) => {
    elizaos.kill();
    server.close();
    process.exit(code ?? 0);
  });
}, 8000);

elizaos.on("exit", (code) => {
  server.close();
  process.exit(code ?? 0);
});
