// ================== INITIALIZATION ==================
require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// ================== ENVIRONMENT DEBUG ==================
console.log("=== BOT STARTING ===");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("VERCEL_ENV:", process.env.VERCEL_ENV);
console.log("BOT_TOKEN exists:", !!process.env.BOT_TOKEN);
console.log("===========================");

// Validasi BOT_TOKEN
if (!process.env.BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is not set!");
}

// Inisialisasi bot
const bot = new TelegramBot(process.env.BOT_TOKEN || "dummy-token", {
  polling: false
});

// ================== CONFIGURATION ==================
const MODELS = {
  gpt5: "https://magma-api.biz.id/ai/gpt5",
  copilot: "https://magma-api.biz.id/ai/copilot",
  think: "https://magma-api.biz.id/ai/copilot-think",
  muslim: "https://magma-api.biz.id/ai/muslim"
};

const sessions = {};
const userConfig = {};

// ================== HELPERS ==================
function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = [];
  return sessions[chatId];
}

function getConfig(chatId) {
  if (!userConfig[chatId]) {
    userConfig[chatId] = {
      model: "gpt5",
      system: "Kamu adalah asisten AI yang membantu. Gunakan Markdown sederhana."
    };
  }
  return userConfig[chatId];
}

async function callAIAPI(model, prompt) {
  const res = await axios.get(model, {
    params: { prompt },
    timeout: 10000
  });
  return res.data?.result?.response || res.data?.response || "AI tidak merespons.";
}

// ================== COMMAND HANDLERS ==================
async function handleStartCommand(chatId, config) {
  const message = `
🤖 *AI TELEGRAM BOT*

Selamat datang. Bot AI siap dipakai.

✨ *Fitur:*
• /model - ganti model
• /system - atur system prompt
• /reset - reset chat
• Chat biasa langsung dijawab AI

📊 *Model aktif:* \`${config.model}\`

🎯 *Cara pakai:*
1. Kirim pesan biasa
2. Gunakan command untuk konfigurasi
3. Kode akan ditampilkan dalam blok kode agar mudah disalin

📌 *Info:*
• Creator: *Abiq Nurmagedov*
• API: Magma API
• Status: Gratis

Catatan:
Jika bot tidak membalas, kemungkinan API sedang lambat atau maintenance.
`.trim();

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });
}

async function handleModelCommand(chatId, text, config) {
  const args = text.split(" ");
  if (!args[1]) {
    return bot.sendMessage(
      chatId,
      `Model tersedia:\n${Object.keys(MODELS).map(m => `• \`${m}\``).join("\n")}`,
      { parse_mode: "Markdown" }
    );
  }

  const model = args[1].toLowerCase();
  if (!MODELS[model]) {
    return bot.sendMessage(chatId, "❌ Model tidak tersedia.");
  }

  config.model = model;
  await bot.sendMessage(chatId, `✅ Model diganti ke \`${model}\``, {
    parse_mode: "Markdown"
  });
}

async function handleSystemCommand(chatId, text, config) {
  const prompt = text.replace("/system", "").trim();
  if (!prompt) {
    return bot.sendMessage(chatId, "❌ System prompt tidak boleh kosong.");
  }
  config.system = prompt;
  await bot.sendMessage(chatId, "✅ System prompt diperbarui.");
}

async function handleResetCommand(chatId) {
  sessions[chatId] = [];
  await bot.sendMessage(chatId, "🗑️ Percakapan direset.");
}

async function handleAIChat(chatId, text, config, session) {
  await bot.sendChatAction(chatId, "typing");

  session.push({ role: "user", content: text });

  const context = [
    `system: ${config.system}`,
    ...session.slice(-10).map(m => `${m.role}: ${m.content}`)
  ].join("\n");

  const reply = await callAIAPI(MODELS[config.model], context);

  session.push({ role: "assistant", content: reply });
  if (session.length > 20) sessions[chatId] = session.slice(-10);

  await bot.sendMessage(chatId, reply, {
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });
}

// ================== MAIN HANDLER ==================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok" });
  }

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const body = req.body;
  if (!body?.message?.text) {
    return res.status(200).json({ ok: true });
  }

  const chatId = body.message.chat.id;
  const text = body.message.text.trim();

  const config = getConfig(chatId);
  const session = getSession(chatId);

  try {
    if (text.startsWith("/start")) await handleStartCommand(chatId, config);
    else if (text.startsWith("/model")) await handleModelCommand(chatId, text, config);
    else if (text.startsWith("/system")) await handleSystemCommand(chatId, text, config);
    else if (text.startsWith("/reset")) await handleResetCommand(chatId);
    else if (text.startsWith("/")) await bot.sendMessage(chatId, "❌ Command tidak dikenal.");
    else await handleAIChat(chatId, text, config, session);
  } catch (e) {
    console.error(e);
  }

  return res.status(200).json({ ok: true });
};

console.log("🤖 Bot ready (Markdown safe)");