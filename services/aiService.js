// ============================================================
// services/aiService.js  (GEMINI VERSION)
// ============================================================
// WHAT CHANGED:
//   OLD: uses Claude (Anthropic) API — paid, no free tier
//   NEW: uses Gemini 2.0 Flash (Google) — free tier available
//        same system prompt, same JSON output format
//        messageHandler.js needs NO changes
// ============================================================

// ── Build system prompt from CLIENT config ─────────────────
function buildSystemPrompt(client) {
  const business = client.business;
  const prices   = client.prices;
  const delivery = client.delivery;

  const menuText = Object.values(prices).map(p => {
    const unitText = p.unit ? ` / ${p.unit}` : "";
    const status = p.available ? "✅ Available" : "❌ Out of stock";
    return `  - ${p.name}: KES ${p.price}${unitText} — ${status}`;
  }).join("\n");

  return `You are a friendly WhatsApp customer service assistant for ${business.name} in Nairobi, Kenya.

BUSINESS INFORMATION:
- Name: ${business.name}
- Location: ${business.location}
- Phone: ${business.phone}
- Hours: ${business.hours}
- Maps: ${business.maps_link}

CURRENT MENU AND PRICES:
${menuText}

DELIVERY INFORMATION:
- Delivery available: ${delivery.available ? "Yes" : "No"}
- Delivery fee: KES ${delivery.fee_min} – ${delivery.fee_max} depending on distance
- Estimated time: ${delivery.estimated_time}

YOUR PERSONALITY:
- Friendly, warm, and professional
- Speak BOTH English and Swahili — reply in same language customer uses
- If they mix languages (Sheng), match their energy
- Keep replies SHORT and clear — this is WhatsApp not an essay
- Use emojis naturally but not excessively

YOUR JOB:
1. Answer questions about prices, availability, location, hours, delivery
2. Help customers place orders naturally — no rigid format needed
3. Handle complaints politely
4. For orders collect: item, quantity, pickup or delivery, name
5. If delivery: also collect their location

STRICT RULES:
- NEVER make up prices — only use what is listed above
- If customer asks something you cannot answer, give the phone number: ${business.phone}
- NEVER go off topic — only discuss ${business.name}

RESPONSE FORMAT:
ALWAYS respond with a valid JSON object ONLY. No extra text, no markdown, no backticks.

{"intent":"general","reply":"your reply"}
{"intent":"order_start","reply":"your reply"}
{"intent":"order_details","item":"product","quantity":2,"reply":"Got it! Product 2 units = KES 1200. Pickup or delivery?"}
{"intent":"pickup","reply":"Great! What is your name?"}
{"intent":"delivery","reply":"Sure! What is your delivery location?"}
{"intent":"got_location","location":"Rongai near Total","reply":"Got it! What is your name?"}
{"intent":"got_name","name":"John Kamau","reply":"Perfect! Let me confirm your order..."}
{"intent":"human","reply":"Connecting you to an attendant!"}

CRITICAL: Return ONLY the JSON object. Nothing before or after it. No markdown, no backticks.`;
}

// ── askGemini ──────────────────────────────────────────────
async function askGemini(customerMessage, conversationHistory = [], client) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in environment variables");
  }

  const systemPrompt = buildSystemPrompt(client);

  // Gemini uses "contents" array with roles "user" and "model"
  // We inject the system prompt as the first user+model exchange
  const contents = [
    {
      role: "user",
      parts: [{ text: systemPrompt }],
    },
    {
      role: "model",
      parts: [{ text: '{"intent":"general","reply":"Understood. I am ready to assist customers."}' }],
    },
    // Inject conversation history
    ...conversationHistory.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    // Current customer message
    {
      role: "user",
      parts: [{ text: customerMessage }],
    },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature:     0.3,  // low = more consistent JSON output
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini API error: ${err.error?.message}`);
  }

  const data = await response.json();

  // Extract text from Gemini response
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  // Strip markdown backticks if Gemini wraps in ```json ... ```
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("Gemini returned non-JSON:", text);
    return { intent: "general", reply: clean };
  }
}

// ── Export as askClaude so messageHandler.js needs no changes
// messageHandler.js does: const { askClaude } = require("./aiService")
// We just export askGemini under the same name — zero changes elsewhere
module.exports = { askClaude: askGemini };