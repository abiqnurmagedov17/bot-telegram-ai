// ================== INITIALIZATION ==================
require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// ================== ENVIRONMENT DEBUG ==================
console.log("=== BOT STARTING ===");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("VERCEL_ENV:", process.env.VERCEL_ENV);
console.log("BOT_TOKEN exists:", !!process.env.BOT_TOKEN);
if (process.env.BOT_TOKEN) {
  console.log("BOT_TOKEN starts with:", process.env.BOT_TOKEN.substring(0, 10) + "...");
}
console.log("===========================");

// Validasi BOT_TOKEN
if (!process.env.BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is not set!");
  console.error("Please add BOT_TOKEN in Vercel Environment Variables");
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

// Session storage
const sessions = {};
const userConfig = {};

// ================== HELPER FUNCTIONS ==================
function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = [];
  return sessions[chatId];
}

function getConfig(chatId) {
  if (!userConfig[chatId]) {
    userConfig[chatId] = {
      model: "gpt5",
      system: "Kamu adalah asisten AI yang membantu."
    };
  }
  return userConfig[chatId];
}

async function callAIAPI(model, prompt) {
  try {
    console.log(`Calling AI API: ${model}`);
    const response = await axios.get(model, {
      params: { prompt },
      timeout: 8000
    });
    
    return response.data?.result?.response || "Maaf, AI sedang tidak bisa merespons.";
  } catch (error) {
    console.error("AI API Error:", error.message);
    throw new Error(`AI service error: ${error.message}`);
  }
}

// ================== COMMAND HANDLERS ==================
async function handleStartCommand(chatId, config) {
  const message = `🤖 *AI BOT TELEGRAM* 🤖

*Fitur yang tersedia:*
✅ /model - Ganti model AI
✅ /system - Atur prompt system  
✅ /reset - Reset percakapan
✅ Chat langsung dengan AI

*Model saat ini:* ${config.model}

Ketik pesan apa saja untuk mulai chatting dengan AI!`;
  
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

async function handleModelCommand(chatId, text, config) {
  const args = text.split(" ");
  
  if (args.length < 2) {
    const modelList = Object.keys(MODELS).map(m => `• ${m}`).join("\n");
    await bot.sendMessage(
      chatId,
      `📋 *Daftar Model:*\n${modelList}\n\n*Model aktif:* ${config.model}\n\nContoh: /model gpt5`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const modelName = args[1].toLowerCase();
  
  if (!MODELS[modelName]) {
    await bot.sendMessage(
      chatId,
      `❌ Model *${modelName}* tidak tersedia.\n\nModel yang tersedia: ${Object.keys(MODELS).join(', ')}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  config.model = modelName;
  await bot.sendMessage(
    chatId,
    `✅ Model berhasil diganti ke: *${modelName}*`,
    { parse_mode: 'Markdown' }
  );
}

async function handleSystemCommand(chatId, text, config) {
  const prompt = text.replace("/system", "").trim();
  
  if (!prompt) {
    await bot.sendMessage(
      chatId,
      "❌ System prompt tidak boleh kosong.\n\nContoh: /system Kamu adalah asisten yang lucu dan humoris"
    );
    return;
  }
  
  config.system = prompt;
  await bot.sendMessage(
    chatId,
    `✅ System prompt berhasil diatur:\n\n"${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`
  );
}

async function handleResetCommand(chatId) {
  sessions[chatId] = [];
  await bot.sendMessage(
    chatId,
    "🗑️ Percakapan telah direset. Mulai percakapan baru!"
  );
}

async function handleAIChat(chatId, text, config, session) {
  // Kirim "typing" indicator
  await bot.sendChatAction(chatId, 'typing');
  
  // Tambah ke session
  session.push({ role: "user", content: text });
  
  // Buat context untuk AI
  const context = [
    `system: ${config.system}`,
    ...session.slice(-10).map(m => `${m.role}: ${m.content}`)
  ].join("\n");
  
  try {
    // Panggil AI API
    const aiResponse = await callAIAPI(MODELS[config.model], context);
    
    // Tambah response ke session
    session.push({ role: "assistant", content: aiResponse });
    
    // Potong session jika terlalu panjang
    if (session.length > 20) {
      session.splice(0, session.length - 10);
    }
    
    // Kirim response ke user
    await bot.sendMessage(chatId, aiResponse);
    
  } catch (error) {
    console.error("Chat error:", error);
    await bot.sendMessage(
      chatId,
      `❌ Gagal mendapatkan respons dari AI:\n${error.message}`
    );
  }
}

// ================== MAIN REQUEST HANDLER ==================
module.exports = async (req, res) => {
  console.log(`\n=== REQUEST RECEIVED ===`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.url}`);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle GET request (health check)
  if (req.method === 'GET') {
    const healthResponse = {
      status: "online",
      service: "Telegram AI Bot",
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || "development",
      bot_configured: !!process.env.BOT_TOKEN && process.env.BOT_TOKEN !== "dummy-token",
      webhook_url: `https://${req.headers.host}/api/bot`,
      instructions: {
        set_webhook: `curl -X POST https://api.telegram.org/bot{YOUR_BOT_TOKEN}/setWebhook?url=https://${req.headers.host}/api/bot`,
        check_webhook: `curl https://api.telegram.org/bot{YOUR_BOT_TOKEN}/getWebhookInfo`
      }
    };
    
    console.log("Health check response:", healthResponse);
    return res.status(200).json(healthResponse);
  }
  
  // Handle POST request (Telegram webhook)
  if (req.method === 'POST') {
    try {
      // Validasi BOT_TOKEN
      if (!process.env.BOT_TOKEN || process.env.BOT_TOKEN === 'dummy-token') {
        console.error("BOT_TOKEN is not set in environment variables");
        return res.status(500).json({
          error: "Server misconfiguration",
          message: "BOT_TOKEN environment variable is not set"
        });
      }
      
      // PARSE REQUEST BODY - INI PERBAIKAN UTAMA
      let body = {};
      try {
        if (req.body) {
          // Jika body sudah berupa object (Vercel sudah parse)
          body = req.body;
        } else {
          // Jika body masih buffer/string (harus di-parse)
          let data = '';
          req.on('data', chunk => {
            data += chunk.toString();
          });
          
          await new Promise((resolve) => {
            req.on('end', () => {
              try {
                body = JSON.parse(data);
              } catch (e) {
                console.error("Error parsing JSON:", e);
              }
              resolve();
            });
          });
        }
      } catch (parseError) {
        console.error("Error parsing request body:", parseError);
        return res.status(400).json({ error: "Invalid JSON" });
      }
      
      console.log("Parsed body:", JSON.stringify(body).substring(0, 500));
      
      // Validasi body request
      if (!body || !body.message) {
        console.log("No message in webhook payload");
        return res.status(200).json({ ok: true });
      }
      
      const message = body.message;
      const chatId = message.chat.id;
      const text = message.text?.trim();
      
      console.log(`Processing message from ${chatId}: "${text}"`);
      
      if (!text) {
        return res.status(200).json({ ok: true });
      }
      
      // Dapatkan config dan session
      const config = getConfig(chatId);
      const session = getSession(chatId);
      
      // Handle commands
      if (text === "/start" || text.startsWith("/start")) {
        await handleStartCommand(chatId, config);
      } 
      else if (text.startsWith("/model")) {
        await handleModelCommand(chatId, text, config);
      }
      else if (text.startsWith("/system")) {
        await handleSystemCommand(chatId, text, config);
      }
      else if (text === "/reset" || text.startsWith("/reset")) {
        await handleResetCommand(chatId);
      }
      else if (text.startsWith("/")) {
        // Unknown command
        await bot.sendMessage(
          chatId,
          `❌ Perintah tidak dikenali.\n\nGunakan /start untuk melihat menu.`
        );
      }
      else {
        // Regular chat with AI
        await handleAIChat(chatId, text, config, session);
      }
      
      // Always return 200 to Telegram
      return res.status(200).json({ ok: true });
      
    } catch (error) {
      console.error("Error processing webhook:", error);
      console.error("Error stack:", error.stack);
      
      // Tetap return 200 ke Telegram agar tidak di-retry terus
      return res.status(200).json({ 
        ok: false,
        error: error.message 
      });
    }
  }
  
  // Method not allowed
  return res.status(405).json({ 
    error: "Method not allowed",
    allowed: ["GET", "POST", "OPTIONS"]
  });
};

// ================== ADDITIONAL DEBUG INFO ==================
console.log("Bot initialized in webhook mode");
console.log("Ready to handle requests at /api/bot");