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
  polling: false,
  parse_mode: 'Markdown'
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
      system: "Kamu adalah asisten AI yang membantu. Format kode program dengan backticks ``` untuk syntax highlighting. Gunakan format Markdown untuk formatting teks."
    };
  }
  return userConfig[chatId];
}

function formatCodeBlocks(text) {
  // Deteksi kode program dan format dengan backticks
  const codePatterns = [
    /\b(function|const|let|var|class|import|export|return|if|else|for|while|console\.log)\b/,
    /<\?php|\b(echo|print_r|function)\b/,
    /\b(def|class|import|print)\b/,
    /```[\s\S]*?```/ // Sudah ada code blocks
  ];
  
  let hasCode = codePatterns.some(pattern => pattern.test(text));
  
  if (hasCode && !text.includes('```')) {
    // Tambah code blocks jika belum ada
    return text.replace(/(```)?([\s\S]*?)(```)?/g, '```$2```');
  }
  
  return text;
}

// Fungsi untuk memastikan Markdown aman
function safeMarkdown(text) {
  // Escape backtick tunggal yang tidak berpasangan
  let result = text;
  
  // Hitung jumlah backtick
  const backtickCount = (text.match(/`/g) || []).length;
  
  // Jika jumlah backtick ganjil, escape yang terakhir
  if (backtickCount % 2 !== 0) {
    // Cari backtick yang tidak berpasangan
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineBackticks = (lines[i].match(/`/g) || []).length;
      if (lineBackticks % 2 !== 0) {
        // Ganti dengan backtick yang di-escape
        lines[i] = lines[i].replace(/`/g, '\\`');
      }
    }
    result = lines.join('\n');
  }
  
  return result;
}

async function callAIAPI(model, prompt) {
  try {
    console.log(`Calling AI API: ${model}`);
    const response = await axios.get(model, {
      params: { prompt },
      timeout: 10000
    });
    
    let reply = response.data?.result?.response || response.data?.response || "Maaf, AI sedang tidak bisa merespons.";
    
    // Format kode program
    reply = formatCodeBlocks(reply);
    
    return reply;
  } catch (error) {
    console.error("AI API Error:", error.message);
    throw new Error(`AI service error: ${error.message}`);
  }
}

// ================== COMMAND HANDLERS ==================
async function handleStartCommand(chatId, config) {
  const message = `
🤖 *AI TELEGRAM BOT* 🤖

*Selamat datang!* Saya adalah asisten AI yang siap membantu Anda.

✨ *FITUR YANG TERSEDIA:*
• /model - Ganti model AI
• /system - Atur prompt system  
• /reset - Reset percakapan
• Chat langsung dengan AI

📊 *MODEL SAAT INI:* \`${config.model}\`

🎯 *CARA PENGGUNAAN:*
1. Kirim pesan biasa untuk chatting dengan AI
2. Gunakan perintah di atas untuk konfigurasi
3. Kode program akan diformat dengan tanda backtick (\`\`\`) untuk mudah disalin

💡 *CONTOH PERINTAH:*
• /model gpt5
• /system Kamu adalah ahli programming
• /reset

---
📌 *INFORMASI BOT:*
• Dibuat oleh: *Abiq Nurmagedov*
• API Provider: [Magma API](https://www.magma-api.biz.id/)
• Status: ✅ Gratis sepenuhnya

⚠️ *CATATAN:*
Jika AI tiba-tiba tidak merespon, kemungkinan server penyedia API sedang down atau maintenance. Coba lagi beberapa saat kemudian.

_Silahkan mulai chatting dengan AI!_ ✨
  `.trim();
  
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
}

async function handleModelCommand(chatId, text, config) {
  const args = text.split(" ");
  
  if (args.length < 2) {
    const modelList = Object.keys(MODELS).map(m => `• \`${m}\``).join("\n");
    await bot.sendMessage(
      chatId,
      `📋 *DAFTAR MODEL AI:*\n\n${modelList}\n\n*Model aktif:* \`${config.model}\`\n\n💡 *Contoh:* \`/model gpt5\``,
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
    `✅ *Model berhasil diganti ke:* \`${modelName}\``,
    { parse_mode: 'Markdown' }
  );
}

async function handleSystemCommand(chatId, text, config) {
  const prompt = text.replace("/system", "").trim();
  
  if (!prompt) {
    await bot.sendMessage(
      chatId,
      "❌ System prompt tidak boleh kosong.\n\n💡 *Contoh:* `/system Kamu adalah asisten yang lucu dan humoris`",
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  config.system = prompt;
  await bot.sendMessage(
    chatId,
    `✅ *System prompt berhasil diatur:*\n\n"${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
    { parse_mode: 'Markdown' }
  );
}

async function handleResetCommand(chatId) {
  sessions[chatId] = [];
  await bot.sendMessage(
    chatId,
    "🗑️ *Percakapan telah direset!* Mulai percakapan baru! ✨",
    { parse_mode: 'Markdown' }
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
      sessions[chatId] = session.slice(-10);
    }
    
    // Format final message dengan info footer
    let finalMessage = aiResponse;
    
    // Tambah footer info untuk kode
    if (aiResponse.includes('```')) {
      finalMessage += `\n\n---\n💡 *Tips:* Kode di atas bisa disalin langsung dari blok kode!`;
    }
    
    // Kirim response ke user
    await bot.sendMessage(chatId, finalMessage, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    console.error("Chat error:", error);
    
    let errorMessage = `❌ *Gagal mendapatkan respons dari AI*\n\n`;
    
    if (error.message.includes('timeout')) {
      errorMessage += `_Server AI sedang lambat atau timeout. Coba lagi beberapa saat._\n\n`;
    } else if (error.message.includes('network')) {
      errorMessage += `_Koneksi jaringan bermasalah. Pastikan Anda terhubung ke internet._\n\n`;
    } else {
      errorMessage += `_Error: ${error.message}_\n\n`;
    }
    
    errorMessage += `🔧 *Informasi:*\n`;
    errorMessage += `• API Provider: Magma API\n`;
    errorMessage += `• Model: ${config.model}\n`;
    errorMessage += `• Status: Mungkin server sedang maintenance\n\n`;
    errorMessage += `_Coba gunakan model lain dengan /model atau coba lagi nanti._`;
    
    await bot.sendMessage(chatId, errorMessage, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true 
    });
  }
}

async function handleHelpCommand(chatId, config) {
  const message = `
🆘 *BANTUAN & INFORMASI*

🤖 *TENTANG BOT:*
Bot AI Telegram ini dibuat menggunakan:
• Node.js & Telegram Bot API
• Magma API sebagai penyedia AI
• Hosting: Vercel

👨‍💻 *PEMBUAT:*
• Nama: *Abiq Nurmagedov*
• Bot ini sepenuhnya gratis

🌐 *API PROVIDER:*
[Magma API](https://www.magma-api.biz.id/)
_Menyediakan berbagai model AI gratis_

📋 *PERINTAH YANG TERSEDIA:*
\`/start\` - Menu utama
\`/model [nama]\` - Ganti model AI
\`/system [prompt]\` - Atur system prompt
\`/reset\` - Reset percakapan
\`/help\` - Bantuan ini
\`/info\` - Informasi bot

💻 *FORMATTING:*
• Kode program: backtick triple (\`\`\`kode\`\`\`)
• Teks tebal: *teks*
• Miring: _teks_
• Link: [teks](url)

⚠️ *TROUBLESHOOTING:*
Jika AI tidak merespon:
1. Cek koneksi internet
2. Coba model lain: /model
3. Server API mungkin sedang down
4. Coba lagi nanti

_Butuh bantuan lebih lanjut? Hubungi pembuat bot._
  `.trim();
  
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
}

async function handleInfoCommand(chatId) {
  const message = `
📊 *INFORMASI BOT*

🏗️ *TEKNOLOGI:*
• Backend: Node.js + Express
• AI Provider: Magma API
• Hosting: Vercel Serverless
• Database: In-memory session

🔄 *MODEL YANG DIDUKUNG:*
\`gpt5\` - GPT-5 seperti model
\`copilot\` - GitHub Copilot style
\`think\` - Reasoning model
\`muslim\` - Islamic assistant

📈 *STATUS:*
• ✅ Online
• ✅ Gratis 100%
• ✅ Multi-model
• ✅ Session memory

🔒 *KEAMANAN:*
• Tidak menyimpan data permanen
• Session reset setiap restart
• Tidak ada tracking

💝 *SUPPORT:*
Bot ini dibuat dan di-maintain oleh *Abiq Nurmagedov*.
Jika bot ini membantu, dukungan Anda sangat berarti!

🌐 *LINKS:*
• [Magma API](https://www.magma-api.biz.id/)
• [GitHub Repository](https://github.com/abiqnurmagedov17)
• [Report Issue](https://t.me/abiqnurmagedov)

_Terima kasih telah menggunakan bot ini!_ 🙏
  `.trim();
  
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
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
      creator: "Abiq Nurmagedov",
      api_provider: "https://www.magma-api.biz.id/",
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
      
      // PARSE REQUEST BODY
      let body = {};
      try {
        if (req.body) {
          body = req.body;
        } else {
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
      
      console.log("Parsed body:", JSON.stringify(body).substring(0, 300));
      
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
      else if (text === "/help" || text.startsWith("/help")) {
        await handleHelpCommand(chatId, config);
      }
      else if (text === "/info" || text.startsWith("/info")) {
        await handleInfoCommand(chatId);
      }
      else if (text.startsWith("/")) {
        // Unknown command
        await bot.sendMessage(
          chatId,
          `❌ *Perintah tidak dikenali*\n\nGunakan /start untuk melihat menu atau /help untuk bantuan.`,
          { parse_mode: 'Markdown' }
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
console.log("🤖 Bot initialized in webhook mode");
console.log("✅ Ready to handle requests at /api/bot");
console.log("👨‍💻 Creator: Abiq Nurmagedov");
console.log("🌐 API Provider: https://www.magma-api.biz.id/");
console.log("💝 This bot is completely free!");