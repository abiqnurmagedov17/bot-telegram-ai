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

const DEFAULT_SYSTEM =
  "Kamu adalah asisten AI yang ramah dan komunikatif. Gunakan bahasa Indonesia santai, jelas, dan sopan. Jika teknis, gunakan poin atau contoh kode.";

// ================== HELPERS ==================
function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = [];
  return sessions[chatId];
}

function getConfig(chatId) {
  if (!userConfig[chatId]) {
    userConfig[chatId] = {
      model: "gpt5",
      system: DEFAULT_SYSTEM
    };
  }
  return userConfig[chatId];
}

// 🔥 Split message biar ga tembus limit Telegram
async function safeSendMessage(chatId, text, options = {}) {
  const MAX = 3900;
  for (let i = 0; i < text.length; i += MAX) {
    await bot.sendMessage(chatId, text.slice(i, i + MAX), options);
  }
}

// 🔥 typing indicator
function startTyping(chatId) {
  bot.sendChatAction(chatId, "typing");
  const interval = setInterval(() => {
    bot.sendChatAction(chatId, "typing");
  }, 4000);
  return interval;
}

// ================== AI CALL ==================
async function callAIAPI(model, prompt) {
  try {
    const res = await axios.get(model, {
      params: { prompt },
      timeout: 25000
    });

    let reply = res.data?.result?.response || res.data?.response || "";
    if (!reply || typeof reply !== "string") {
      reply = "Maaf, AI tidak memberikan respons yang valid.";
    }
    return reply;
  } catch (err) {
    console.error("[AI API ERROR]", err.message || err);
    return "⚠️ Gagal menghubungi AI. Coba lagi nanti.";
  }
}

// ================== MARKDOWN ==================
function prepareMarkdownV2(text) {
  if (typeof text !== "string") return "";
  let t = text.replace(/([[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
  t = t.replace(/\\\*\\\*(.+?)\\\*\\\*/g, "**$1**");
  t = t.replace(/\\_\\_(.+?)\\_\\_/g, "__$1__");
  t = t.replace(/\\`\\`\\`([\s\S]*?)\\`\\`\\`/g, "```$1```");
  const ticks = (t.match(/```/g) || []).length;
  if (ticks % 2 === 1) t += "\n```";
  return t;
}

// ================== COMMAND HANDLERS ==================
async function handleStartCommand(chatId, config) {
  const message = `
🤖 *TanyaAja AI*

📊 *Model aktif:* \`${config.model}\`
`.trim();

  await safeSendMessage(chatId, message, { parse_mode: "MarkdownV2" });
}

async function handleHelpCommand(chatId) {
  await safeSendMessage(chatId, "Gunakan /model /system /reset", {
    parse_mode: "MarkdownV2"
  });
}

async function handleModelCommand(chatId, text, config) {
  const args = text.split(" ");
  if (!args[1]) {
    const list = Object.keys(MODELS).map(m => `• \`${m}\``).join("\n");
    return safeSendMessage(chatId, `Model tersedia:\n${list}`, {
      parse_mode: "MarkdownV2"
    });
  }

  const model = args[1].toLowerCase();
  if (!MODELS[model]) return safeSendMessage(chatId, "❌ Model tidak tersedia.");

  config.model = model;
  await safeSendMessage(chatId, `✅ Model diganti ke \`${model}\``, {
    parse_mode: "MarkdownV2"
  });
}

async function handleSystemCommand(chatId, text, config) {
  const arg = text.replace("/system", "").trim();
  if (arg === "reset") {
    config.system = DEFAULT_SYSTEM;
    return safeSendMessage(chatId, "✅ System prompt direset.");
  }
  config.system = arg;
  await safeSendMessage(chatId, "✅ System prompt diperbarui.");
}

async function handleResetCommand(chatId) {
  sessions[chatId] = [];
  await safeSendMessage(chatId, "🗑️ Percakapan direset.");
}

async function handleAIChat(chatId, text, config, session) {
  let typing;
  try {
    typing = startTyping(chatId);

    session.push({ role: "user", content: text });

    const context = [
      `system: ${config.system}`,
      ...session.slice(-10).map(m => `${m.role}: ${m.content}`)
    ].join("\n");

    const reply = await callAIAPI(MODELS[config.model], context);

    session.push({ role: "assistant", content: reply });

    clearInterval(typing);

    await safeSendMessage(
      chatId,
      prepareMarkdownV2(reply),
      { parse_mode: "MarkdownV2" }
    );
  } catch (e) {
    if (typing) clearInterval(typing);
    console.error(e);
  }
}

// ================== MAIN HANDLER ==================
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).end();

  const msg = req.body?.message;
  if (!msg?.text) return res.status(200).json({ ok: true });

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  const config = getConfig(chatId);
  const session = getSession(chatId);

  if (text.startsWith("/start")) await handleStartCommand(chatId, config);
  else if (text.startsWith("/help")) await handleHelpCommand(chatId);
  else if (text.startsWith("/model")) await handleModelCommand(chatId, text, config);
  else if (text.startsWith("/system")) await handleSystemCommand(chatId, text, config);
  else if (text.startsWith("/reset")) await handleResetCommand(chatId);
  else if (text.startsWith("/")) await safeSendMessage(chatId, "❌ Command tidak dikenal.");
  else {
    // 🔥 INI SATU-SATUNYA PERBAIKAN
    handleAIChat(chatId, text, config, session);
  }

  return res.status(200).json({ ok: true });
};

console.log("🤖 Bot ready");