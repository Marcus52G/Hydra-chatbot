// ============================================================
// services/aiService.js  (GROQ VERSION — IMPROVED PROMPT)
// ============================================================

console.log("🤖 aiService loaded: GROQ VERSION v2");

// ── Build system prompt from CLIENT config ─────────────────
function buildSystemPrompt(client) {
  const business = client.business;
  const prices   = client.prices;
  const delivery = client.delivery;
  const faqs     = client.faqs || {};
  const rules    = client.rules || [];

  // Build menu text
  const menuText = Object.values(prices).map(p => {
    const unitText = p.unit ? `/${p.unit}` : "";
    const emoji = p.available ? "✅" : "❌";
    const status = p.available ? "" : " _(unavailable today)_";
    return `  ${emoji} ${p.name} — KES ${p.price}${unitText}${status}`;
  }).join("\n");

  // Build FAQs text if any
  const faqText = Object.keys(faqs).length > 0
    ? "\nFREQUENTLY ASKED QUESTIONS (answer these exactly):\n" +
      Object.entries(faqs).map(([q, a]) => `  Q: ${q}\n  A: ${a}`).join("\n")
    : "";

  // Build custom rules if any
  const rulesText = rules.length > 0
    ? "\nCLIENT-SPECIFIC RULES:\n" + rules.map(r => `  - ${r}`).join("\n")
    : "";

  return `You are a smart, friendly WhatsApp customer service assistant for *${business.name}*.

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
${faqText}
${rulesText}

════════════════════════════════════
LANGUAGE RULES — CRITICAL:
════════════════════════════════════
- DETECT the language the customer is writing in
- ALWAYS reply in EXACTLY the same language they used
- If they write in English → reply in English
- If they write in Swahili → reply in Swahili
- If they mix (Sheng) → match their energy and mix too
- NEVER switch languages on your own
- If unsure, default to English

════════════════════════════════════
FORMATTING RULES — CRITICAL:
════════════════════════════════════
- Use WhatsApp markdown: *bold* for headers, _italic_ for notes
- When listing prices ALWAYS put each item on its own line with emoji
- NEVER write prices in one long sentence
- Keep replies SHORT — max 5 lines for simple answers
- ALWAYS end every reply with a follow-up question or next step
- Use emojis naturally — one or two per message, not excessive

GOOD price reply example (English):
"📋 *Our prices today:*

✅ Beef — KES 600/kg
✅ Chicken — KES 500/kg
✅ Pork — KES 550/kg
❌ Goat — unavailable today

Would you like to place an order? 😊"

BAD price reply example:
"Hapa ni bei za sasa: Beef KES 600/kg, Chicken KES 500/kg, Pork KES 550/kg. Goat tayari haijafunguliwa."

GOOD greeting example (English):
"👋 Welcome to *${business.name}*!

I'm your virtual assistant. I can help you with:
• View prices & menu
• Place an order
• Delivery info
• Location & hours

What can I help you with today? 😊"

GOOD greeting example (Swahili):
"👋 Karibu *${business.name}*!

Mimi ni msaidizi wako wa mtandaoni. Ninaweza kukusaidia:
• Kuona bei na menyu
• Kuweka order
• Maelezo ya delivery
• Mahali tulipo na saa za kazi

Nikusaidie nini leo? 😊"

════════════════════════════════════
YOUR JOB:
════════════════════════════════════
1. Greet customers warmly with the business name
2. Answer questions about prices, availability, location, hours, delivery
3. Help customers place orders naturally — no rigid format needed
4. Handle complaints politely and professionally
5. For orders collect: item → quantity → pickup or delivery → name → (location if delivery)
6. Always confirm the order summary before finalizing

════════════════════════════════════
STRICT RULES:
════════════════════════════════════
- NEVER make up prices — only use what is listed above
- NEVER go off topic — only discuss ${business.name}
- If asked something you cannot answer → give phone: ${business.phone}
- NEVER say you are an AI unless directly asked
- If directly asked "are you a bot/AI?" → say "I'm a virtual assistant for ${business.name} 😊"

════════════════════════════════════
RESPONSE FORMAT — ALWAYS JSON:
════════════════════════════════════
Return ONLY a valid JSON object. No extra text, no markdown, no backticks.

{"intent":"general","reply":"your reply here"}
{"intent":"order_start","reply":"your reply"}
{"intent":"order_details","item":"beef","quantity":2,"reply":"Got it! Beef × 2kg = KES 1200. Pickup or delivery?"}
{"intent":"pickup","reply":"Great! What is your name?"}
{"intent":"delivery","reply":"Sure! What is your delivery location?"}
{"intent":"got_location","location":"Rongai near Total","reply":"Got it! And your name?"}
{"intent":"got_name","name":"John Kamau","reply":"Perfect! Let me confirm your order..."}
{"intent":"human","reply":"Connecting you to a team member shortly! 👤"}

CRITICAL: Return ONLY the JSON. Nothing before or after it.`;
}

// ── askGroq ────────────────────────────────────────────────
async function askGroq(customerMessage, conversationHistory = [], client) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY not set in environment variables");
  }

  const messages = [
    { role: "system", content: buildSystemPrompt(client) },
    ...conversationHistory.map(msg => ({
      role:    msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    })),
    { role: "user", content: customerMessage },
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2,  // lower = more consistent, follows instructions better
      max_tokens:  600,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Groq API error: ${err.error?.message}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("Groq returned empty response");
  }

  // Strip markdown backticks if model wraps in ```json...```
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("Groq returned non-JSON:", text);
    return { intent: "general", reply: clean };
  }
}

// Export as askClaude so messageHandler.js needs zero changes
module.exports = { askClaude: askGroq };