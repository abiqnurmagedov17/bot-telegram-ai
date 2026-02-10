require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// ================== CONFIG ==================
const MODELS = {
  gpt5: "https://magma-api.biz.id/ai/gpt5",
  copilot: "https://magma-api.biz.id/ai/copilot",
  think: "https://magma-api.biz.id/ai/copilot-think",
  muslim: "https://magma-api.biz.id/ai/muslim"
};

// Gunakan webhook untuk Vercel, bukan polling
const bot = new TelegramBot(process.env.BOT_TOKEN);

// session memory (gunakan database di production)
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
      system: "You are a helpful AI assistant."
    };
  }
  return userConfig[chatId];
}

// ================== WEBHOOK HANDLER ==================
module.exports = async (req, res) => {
  // Cek method
  if (req.method === 'POST') {
    try {
      const { body } = req;
      
      // Pastikan ini update dari Telegram
      if (body && body.message) {
        const msg = body.message;
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        
        if (text) {
          const config = getConfig(chatId);
          const session = getSession(chatId);

          // ===== /start =====
          if (text === "/start") {
            await bot.sendMessage(
              chatId,
              `🤖 AI BOT AKTIF\n\n/model → ganti model\n/system <prompt> → system prompt\n/reset → hapus session\n\nModel sekarang: ${config.model}`
            );
            return res.status(200).json({ ok: true });
          }

          // ===== /model =====
          if (text.startsWith("/model")) {
            const args = text.split(" ");
            if (!args[1]) {
              await bot.sendMessage(
                chatId,
                `📌 Model tersedia:\n- gpt5\n- copilot\n- think\n- muslim\n\nModel aktif: ${config.model}\nGunakan: /model gpt5`
              );
              return res.status(200).json({ ok: true });
            }

            if (!MODELS[args[1]]) {
              await bot.sendMessage(chatId, "❌ Model tidak valid.");
              return res.status(200).json({ ok: true });
            }

            config.model = args[1];
            await bot.sendMessage(
              chatId,
              `✅ Model diganti ke: ${args[1]}`
            );
            return res.status(200).json({ ok: true });
          }

          // ===== /system =====
          if (text.startsWith("/system")) {
            const prompt = text.replace("/system", "").trim();
            if (!prompt) {
              await bot.sendMessage(
                chatId,
                "❌ System prompt kosong."
              );
              return res.status(200).json({ ok: true });
            }
            config.system = prompt;
            await bot.sendMessage(
              chatId,
              "✅ System prompt diset."
            );
            return res.status(200).json({ ok: true });
          }

          // ===== /reset =====
          if (text === "/reset") {
            sessions[chatId] = [];
            await bot.sendMessage(
              chatId,
              "🗑️ Session chat dihapus."
            );
            return res.status(200).json({ ok: true });
          }

          // ================== AI CHAT ==================
          session.push({ role: "user", content: text });

          const context = [
            `system: ${config.system}`,
            ...session.map(m => `${m.role}: ${m.content}`)
          ].join("\n");

          try {
            const resAI = await axios.get(
              MODELS[config.model],
              { params: { prompt: context } }
            );

            const reply =
              resAI.data?.result?.response || "AI error.";

            session.push({
              role: "assistant",
              content: reply
            });

            await bot.sendMessage(chatId, reply);
          } catch (err) {
            console.error("AI API error:", err);
            await bot.sendMessage(chatId, "❌ API error.");
          }
        }
      }
      
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Error handling update:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (req.method === 'GET') {
    // Health check endpoint
    return res.status(200).json({ 
      status: 'Bot is running',
      timestamp: new Date().toISOString()
    });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};