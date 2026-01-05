// ===== Telegram Trend Bot + OpenAI =====
const express = require('express');
const fetch = require('node-fetch'); // v2
const app = express();
app.use(express.json());

// ===== Environment Variables =====
const BOT_TOKEN = process.env.BOT_TOKEN;         // Telegram Bot Token
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // OpenAI API Key
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null; // optional for protected debug endpoints

// ===== Basic checks and logging =====
if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN is not set. Set process.env.BOT_TOKEN and restart.');
} else {
  // Verify token by calling getMe at startup
  (async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.ok) {
        console.log('Bot identity:', data.result.username, '(id=' + data.result.id + ')');
      } else {
        console.error('getMe failed: ', res.status, data);
      }
    } catch (err) {
      console.error('Failed to call getMe:', err);
    }
  })();
}

// Global error handlers
process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (err) => console.error('uncaughtException', err));

// ===== In-memory database for users =====
let users = {};

// ===== Commands and options =====
const content_types = ["TikTok","YouTube","General","Custom"];
const languages = ["Arabic","English","French","Other"];

// Health check
app.get('/', (req, res) => res.send('OK - Bot server running'));

// Optional protected debug endpoint to inspect webhook info (requires ADMIN_TOKEN)
app.get('/debug/webhook', async (req, res) => {
  if (!ADMIN_TOKEN) return res.status(403).send('Admin token not configured');
  const token = req.query.token;
  if (!token || token !== ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!BOT_TOKEN) return res.status(500).send('BOT_TOKEN not set');
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const json = await resp.json().catch(() => null);
    return res.json(json || { error: 'Could not parse response' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ===== Telegram POST endpoint =====
app.post('/', async (req, res) => {
  try {
    const update = req.body;
    if (!update) return res.sendStatus(200);

    const message = update.message || update.edited_message || null;
    if (!message) {
      console.log('Received update without message fields:', Object.keys(update));
      return res.sendStatus(200);
    }

    // Prefer chat.id for replies (works for private chats and groups)
    const chat_id = (message.chat && message.chat.id) ? message.chat.id : (message.from && message.from.id);
    if (!chat_id) {
      console.log('No chat id available in message:', message);
      return res.sendStatus(200);
    }

    // normalize text: try text, then caption
    const text = (typeof message.text === 'string' ? message.text : (typeof message.caption === 'string' ? message.caption : '')).trim();

    console.log('Incoming message from chat_id=', chat_id, 'text=', text || '[no text]');

    // reply immediately to confirm receipt (optional, can be removed)
    await sendMessage(chat_id, `✅ Bot received your message${text ? ': ' + text : ''}`);

    // ---- Initialize user if not exists ----
    if (!users[chat_id]) {
      users[chat_id] = {
        tries_left: 5,
        subscription_active: false,
        subscription_expiry: null,
        invite_count: 0,
        pending_content_type: null,
        pending_language: null
      };
    }

    const now = new Date();

    // If no text present, offer help and stop
    if (!text) {
      await sendMessage(chat_id, 'Send /trend to start or /help for commands.');
      return res.sendStatus(200);
    }

    // ===== /trend =====
    if(text === '/trend') {
      let sub_active = users[chat_id].subscription_active && new Date(users[chat_id].subscription_expiry) > now;
      if(!sub_active && users[chat_id].tries_left <= 0){
        await sendMessage(chat_id, "🚫 You have no tries left. Use /buy, /earn or /invite.");
      } else {
        if(!sub_active) users[chat_id].tries_left -= 1;
        await sendMessage(chat_id, "Choose content type:", {
          reply_markup: {
            keyboard: [
              [{ text: "TikTok" }, { text: "YouTube" }],
              [{ text: "General" }, { text: "Custom" }]
            ],
            one_time_keyboard: true
          }
        });
      }
    }

    // ===== /buy =====
    else if(text.startsWith('/buy')) {
      await sendMessage(chat_id, `Choose package:\n1️⃣ $2 = 5 tries\n2️⃣ $5 = 1 week unlimited\n3️⃣ $10 = 1 month unlimited\n4️⃣ $60 = 1 year (50% off)`, {
        reply_markup: { remove_keyboard: true }
      });
    }

    // ===== /earn =====
    else if(text.startsWith('/earn')) {
      await sendMessage(chat_id, `Get extra free try! Follow one of the platforms below and send a screenshot:\n\n1️⃣ Facebook: https://facebook.com/soundous.Eco\n2️⃣ YouTube: https://youtube.com/@Xrst_vente\n3️⃣ Instagram: https://instagram.com/@Xrst_vente\n4️⃣ TikTok: https://tiktok.com/@Xrst_vente\n(Max 3 per day)`, {
        reply_markup: {
          keyboard: [
            [{ text: "Facebook" }, { text: "YouTube" }],
            [{ text: "Instagram" }, { text: "TikTok" }]
          ],
          one_time_keyboard: true
        }
      });
    }

    // ===== /invite =====
    else if(text.startsWith('/invite')) {
      await sendMessage(chat_id, `Share your bot link:\nhttps://t.me/TrendForgeIdeasBot\nEach new user = +5 free try (max 3 per day).`);
    }

    // ===== Choose content type =====
    else if(content_types.includes(text)) {
      users[chat_id].pending_content_type = text;
      await sendMessage(chat_id, "Choose language:", {
        reply_markup: {
          keyboard: [
            [{ text: "Arabic" }, { text: "English" }],
            [{ text: "French" }, { text: "Other" }]
          ],
          one_time_keyboard: true
        }
      });
    }

    // ===== Choose language =====
    else if(languages.includes(text) && users[chat_id].pending_content_type) {
      users[chat_id].pending_language = text;
      const content_type = users[chat_id].pending_content_type;
      const language = users[chat_id].pending_language;

      // Reset pending choices
      users[chat_id].pending_content_type = null;
      users[chat_id].pending_language = null;

      // ---- هنا يمكن إضافة OpenAI بعد التأكد من عمل البوت ----
      await sendMessage(chat_id, `🎬 Generating script for ${content_type} in ${language}... (OpenAI integration coming soon)`);

    } else {
      // fallback/help text
      await sendMessage(chat_id, 'Command not recognized. Send /trend to start or /help for available commands.');
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Request handler error:', err);
    // Still respond 200 so Telegram won't retry repeatedly
    return res.sendStatus(200);
  }
});

// ===== Send Telegram message function =====
async function sendMessage(chat_id, text, extra={}) {
  if (!BOT_TOKEN) {
    console.error('Cannot send message: BOT_TOKEN not set');
    return;
  }
  const payload = { chat_id, text, ...extra };
  if (payload.reply_markup && typeof payload.reply_markup !== 'string') {
    try { payload.reply_markup = JSON.stringify(payload.reply_markup); }
    catch (e) { console.warn('Could not stringify reply_markup', e); }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const bodyText = await res.text();
    let data = null;
    try { data = JSON.parse(bodyText); } catch(e) { /* ignore */ }

    console.log('Telegram sendMessage => status:', res.status, 'ok:', data && data.ok, 'body:', data || bodyText);

    if (!res.ok) {
      console.error('Telegram API HTTP error:', res.status, bodyText);
    } else if (data && !data.ok) {
      console.error('Telegram API error response:', data);
    }

    return data;
  } catch (err) {
    console.error('Failed to send message to Telegram:', err);
  }
}

// ===== Start Express server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
