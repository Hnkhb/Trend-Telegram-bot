const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// قاعدة بيانات المستخدمين
let users = {};

// أنواع المحتوى واللغات
const content_types = ["TikTok","YouTube","General","Custom"];
const languages = ["Arabic","English","French","Other"];

// استقبال POST من Telegram
app.post('/', async (req, res) => {
  const message = req.body.message;
  if (!message) return res.sendStatus(200);

  const user_id = message.from.id;
  const text = message.text;

  // إنشاء مستخدم جديد إذا لم يكن موجود
  if (!users[user_id]) {
    users[user_id] = {
      tries_left: 5,
      subscription_active: false,
      subscription_expiry: null,
      invite_count: 0,
      pending_content_type: null,
      pending_language: null
    };
  }

  const now = new Date();

  // -------- /trend --------
  if(text === '/trend') {
    let sub_active = users[user_id].subscription_active && new Date(users[user_id].subscription_expiry) > now;
    if(!sub_active && users[user_id].tries_left <= 0){
      await sendMessage(user_id, "🚫 No tries left. Use /buy, /earn or /invite.");
    } else {
      if(!sub_active) users[user_id].tries_left -= 1;
      await sendMessage(user_id, "Choose content type:", {
        keyboard: [
          [{ text: "TikTok" }, { text: "YouTube" }],
          [{ text: "General" }, { text: "Custom" }]
        ],
        one_time_keyboard: true
      });
    }
  }

  // -------- /buy --------
  else if(text.startsWith('/buy')) {
    await sendMessage(user_id, `Choose package:\n1️⃣ $2 = 5 tries\n2️⃣ $5 = 1 week unlimited\n3️⃣ $10 = 1 month unlimited\n4️⃣ $60 = 1 year (50% off)`, { remove_keyboard: true });
  }

  // -------- /earn --------
  else if(text.startsWith('/earn')) {
    await sendMessage(user_id, `Get extra free try! Follow one of the platforms below and send a screenshot:\n
1️⃣ Facebook: https://facebook.com/soundous.Eco
2️⃣ YouTube: https://youtube.com/@Xrst_vente
3️⃣ Instagram: https://instagram.com/@Xrst_vente
4️⃣ TikTok: https://tiktok.com/@Xrst_vente
(Max 3 per day)`, {
      keyboard: [
        [{ text: "Facebook" }, { text: "YouTube" }],
        [{ text: "Instagram" }, { text: "TikTok" }]
      ],
      one_time_keyboard: true
    });
  }

  // -------- /invite --------
  else if(text.startsWith('/invite')) {
    await sendMessage(user_id, `Share your bot link:\nhttps://t.me/TrendForgeIdeasBot\nEach new user = +5 free try (max 3 per day).`);
  }

  // -------- اختيار نوع المحتوى --------
  else if(content_types.includes(text)) {
    users[user_id].pending_content_type = text;
    await sendMessage(user_id, "Choose language:", {
      keyboard: [
        [{ text: "Arabic" }, { text: "English" }],
        [{ text: "French" }, { text: "Other" }]
      ],
      one_time_keyboard: true
    });
  }

  // -------- اختيار اللغة --------
  else if(languages.includes(text) && users[user_id].pending_content_type) {
    users[user_id].pending_language = text;
    const content_type = users[user_id].pending_content_type;
    const language = users[user_id].pending_language;

    users[user_id].pending_content_type = null;
    users[user_id].pending_language = null;

    // طلب سكريبت من OpenAI
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "gpt-4o-mini",
          "messages": [{"role":"user","content":`Create a 45-second video script for ${content_type} in ${language}. Include hook and hashtags.`}]
        })
      });
      const data = await response.json();
      const script = data.choices[0].message.content;
      await sendMessage(user_id, script);
    } catch (err) {
      console.error(err);
      await sendMessage(user_id, "❌ Error generating script. Try again later.");
    }
  }

  res.sendStatus(200);
});

// دالة إرسال رسالة Telegram
async function sendMessage(chat_id, text, extra={}) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, ...extra })
  });
}

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
