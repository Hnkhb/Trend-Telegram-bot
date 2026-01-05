import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

console.log("Bot starting...");

let users = {}; 

app.post("/", async (req, res) => {
  const message = req.body.message;
  if (!message) return res.sendStatus(200);

  const user_id = message.from.id;
  const text = message.text;

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
  const content_types = ["TikTok","YouTube","General","Custom"];
  const languages = ["Arabic","English","French","Other"];
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  async function sendMessage(chat_id, text, reply_markup=null) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, reply_markup })
    });
  }

  if(text === '/trend') {
    let sub_active = users[user_id].subscription_active && new Date(users[user_id].subscription_expiry) > now;
    if(!sub_active && users[user_id].tries_left <= 0){
      await sendMessage(user_id, "🚫 You have no tries left. Use /buy, /earn or /invite to get more.");
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
  } else if(text.startsWith('/buy')) {
    await sendMessage(user_id, `Choose package:\n1️⃣ $2 = 5 tries\n2️⃣ $5 = 1 week unlimited\n3️⃣ $10 = 1 month unlimited\n4️⃣ $60 = 1 year (50% off)\nSend payment receipt to activate.`, { remove_keyboard: true });
  } else if(text.startsWith('/earn')) {
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
  } else if(text.startsWith('/invite')) {
    await sendMessage(user_id, `Share your bot link:\nhttps://t.me/TrendForgeIdeasBot\nEach new user = +5 free try (max 3 per day).`);
  } else if(content_types.includes(text)) {
    users[user_id].pending_content_type = text;
    await sendMessage(user_id, "Choose language:", {
      keyboard: [
        [{ text: "Arabic" }, { text: "English" }],
        [{ text: "French" }, { text: "Other" }]
      ],
      one_time_keyboard: true
    });
  } else if(languages.includes(text) && users[user_id].pending_content_type) {
    users[user_id].pending_language = text;
    const content_type = users[user_id].pending_content_type;
    const language = users[user_id].pending_language;

    users[user_id].pending_content_type = null;
    users[user_id].pending_language = null;

    const openai_response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "gpt-4o-mini",
        "messages": [{"role":"user","content":`Create a 45-second video script for ${content_type} in ${language}. Include hook and hashtags.`}]
      })
    });

    const data = await openai_response.json();
    const script = data.choices[0].message.content;
    await sendMessage(user_id, script);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  // ===== Commands =====
  if (text === "/trend") {
    const sub_active = users[user_id].subscription_active &&
                       new Date(users[user_id].subscription_expiry) > now;
    if (!sub_active && users[user_id].tries_left <= 0) {
      await sendMessage(user_id, "🚫 No tries left. Use /buy, /earn or /invite.");
    } else {
      if (!sub_active) users[user_id].tries_left -= 1;
      await sendMessageKeyboard(user_id, "Choose content type:", [
        ["TikTok", "YouTube"],
        ["General", "Custom"]
      ]);
    }
  }

  else if (text.startsWith("/buy")) {
    await sendMessage(user_id,
      `Choose package:\n1️⃣ $2 = 5 tries\n2️⃣ $5 = 1 week unlimited\n3️⃣ $10 = 1 month unlimited\n4️⃣ $60 = 1 year (50% off)\nSend payment receipt to activate.`
    );
  }

  else if (text.startsWith("/earn")) {
    await sendMessageKeyboard(user_id,
      `Get extra free try! Follow and send screenshot:\n1️⃣ Facebook\n2️⃣ YouTube\n3️⃣ Instagram\n4️⃣ TikTok (Max 3 per day)`,
      [["Facebook", "YouTube"], ["Instagram", "TikTok"]]
    );
  }

  else if (text.startsWith("/invite")) {
    await sendMessage(user_id, `Share your bot link:\nhttps://t.me/TrendForgeIdeasBot\nEach new user = +5 free try (max 3/day).`);
  }

  // ===== Handling Content Type Selection =====
  else if (content_types.includes(text)) {
    users[user_id].pending_content_type = text;
    await sendMessageKeyboard(user_id, "Choose language:", [
      ["Arabic", "English"],
      ["French", "Other"]
    ]);
  }

  // ===== Handling Language Selection =====
  else if (languages.includes(text) && users[user_id].pending_content_type) {
    users[user_id].pending_language = text;
    const content_type = users[user_id].pending_content_type;
    const language = users[user_id].pending_language;

    // Reset pending selections
    users[user_id].pending_content_type = null;
    users[user_id].pending_language = null;

    // ===== Call OpenAI API =====
    const script = await generateScript(content_type, language);
    await sendMessage(user_id, script);
  }

  res.sendStatus(200);
});

// ===== Helper Functions =====
async function sendMessage(chat_id, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text })
  });
}

async function sendMessageKeyboard(chat_id, text, keyboard) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id,
      text,
      reply_markup: { keyboard, one_time_keyboard: true }
    })
  });
}

async function generateScript(content_type, language) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Create a 45-second video script for ${content_type} in ${language}. Include hook and hashtags.`
      }]
    })
  });

  const data = await resp.json();
  return data.choices[0].message.content || "Failed to generate script";
}

// ===== Start Express Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
