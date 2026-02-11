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
  }  return userConfig[chatId];
}

// 🔥 Split message biar ga tembus limit Telegram
async function safeSendMessage(chatId, text, options = {}) {
  const MAX = 3900;
  for (let i = 0; i < text.length; i += MAX) {
    await bot.sendMessage(chatId, text.slice(i, i + MAX), options);
  }
}

// 🔥 FITUR BARU: typing indicator interval
function startTyping(chatId) {
  bot.sendChatAction(chatId, "typing");
  const interval = setInterval(() => {
    bot.sendChatAction(chatId, "typing");
  }, 4000);
  return interval;
}

// 🔥 Perbaikan: timeout dinaikkan + penanganan error lebih aman
async function callAIAPI(model, prompt) {
  try {
    const res = await axios.get(model, {
      params: { prompt },
      timeout: 25000 // naikkan timeout ke 25 detik (aman untuk Vercel max 28s)
    });

    // Cek apakah respons valid
    if (!res || !res.data) {
      throw new Error("Empty or invalid response from AI API");
    }

    // Ambil respons dari berbagai kemungkinan struktur
    let reply = res.data?.result?.response || res.data?.response || "";

    if (typeof reply !== "string" || reply.trim() === "") {
      reply = "Maaf, AI tidak memberikan respons yang valid.";
    }

    return reply;
  } catch (error) {
    console.error("[AI API ERROR]", error.message || error);
    if (error.code === "ECONNABORTED") {
      return "⚠️ Respons terlalu lama. Coba pertanyaan yang lebih ringkas.";
    }
    return "⚠️ Gagal menghubungi AI. Coba lagi nanti.";
  }
}
// ================== COMMAND HANDLERS ==================
async function handleStartCommand(chatId, config) {
  const message = `
🤖 *TanyaAja AI*

Bot AI untuk membantu menjawab pertanyaan Anda.

✨ *Fitur:*
• /model - ganti model
• /system - atur gaya AI
• /system reset - reset system prompt
• /reset - reset chat
• /help - bantuan

📊 *Model aktif:* \`${config.model}\`

Ketik pertanyaan Anda untuk mulai.
`.trim();

  await safeSendMessage(chatId, message, {
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });
}

async function handleHelpCommand(chatId) {
  const message = `
📘 *Bantuan TanyaAja AI*

Perintah:
• /start - mulai
• /help - bantuan
• /model [nama] - ganti model
• /system [prompt] - ubah gaya AI
• /system reset - kembali ke default
• /reset - reset percakapan

Cukup kirim pesan biasa untuk bertanya.
`.trim();

  await safeSendMessage(chatId, message, {
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });
}

async function handleModelCommand(chatId, text, config) {
  const args = text.split(" ");
  if (!args[1]) {
    return safeSendMessage(      chatId,
      `Model tersedia:\n${Object.keys(MODELS).map(m => `• \`${m}\``).join("\n")}`,
      { parse_mode: "Markdown" }
    );
  }

  const model = args[1].toLowerCase();
  if (!MODELS[model]) {
    return safeSendMessage(chatId, "❌ Model tidak tersedia.");
  }

  config.model = model;
  await safeSendMessage(chatId, `✅ Model diganti ke \`${model}\``, {
    parse_mode: "Markdown"
  });
}

async function handleSystemCommand(chatId, text, config) {
  const arg = text.replace("/system", "").trim();

  if (arg === "reset") {
    config.system = DEFAULT_SYSTEM;
    return safeSendMessage(chatId, "✅ System prompt direset ke default.");
  }

  if (!arg) {
    return safeSendMessage(chatId, "❌ System prompt tidak boleh kosong.");
  }

  config.system = arg;
  await safeSendMessage(chatId, "✅ System prompt diperbarui.");
}

async function handleResetCommand(chatId) {
  sessions[chatId] = [];
  await safeSendMessage(chatId, "🗑️ Percakapan direset.");
}

async function handleAIChat(chatId, text, config, session) {
  let typingInterval;

  try {
    typingInterval = startTyping(chatId);

    session.push({ role: "user", content: text });

    const context = [
      `system: ${config.system}`,
      ...session.slice(-10).map(m => `${m.role}: ${m.content}`)
    ].join("\n");
    let reply = await callAIAPI(MODELS[config.model], context);

    session.push({ role: "assistant", content: reply });
    if (session.length > 20) sessions[chatId] = session.slice(-10);

    clearInterval(typingInterval);

    // 🔥 PENTING: Nonaktifkan Markdown untuk hindari error parsing
    await safeSendMessage(chatId, reply, {
      parse_mode: null, // <-- ini yang mencegah error saat teks panjang/format rusak
      disable_web_page_preview: true
    });
  } catch (err) {
    if (typingInterval) clearInterval(typingInterval);
    console.error("[HANDLE_AI_CHAT ERROR]", err);
    await safeSendMessage(chatId, "⚠️ Terjadi kesalahan internal. Coba lagi sebentar.");
  }
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

  if (text.startsWith("/start")) await handleStartCommand(chatId, config);
  else if (text.startsWith("/help")) await handleHelpCommand(chatId);
  else if (text.startsWith("/model")) await handleModelCommand(chatId, text, config);
  else if (text.startsWith("/system")) await handleSystemCommand(chatId, text, config);
  else if (text.startsWith("/reset")) await handleResetCommand(chatId);
  else if (text.startsWith("/")) await safeSendMessage(chatId, "❌ Command tidak dikenal.");
  else await handleAIChat(chatId, text, config, session);

  return res.status(200).json({ ok: true });};

console.log("🤖 Bot ready (typing indicator stabil)");