// ============================================================
// services/aiService.js  (GROQ VERSION v3 — WITH CUSTOMER CONTEXT)
// ============================================================
// WHAT'S NEW:
//   - Accepts customerContext parameter
//   - Injects customer history into system prompt
//   - Bot knows returning customers and their preferences
// ============================================================

console.log("🤖 aiService loaded: GROQ VERSION v3");

function buildSystemPrompt(client, customerContext = "") {
  const business = client.business;
  const prices   = client.prices;
  const delivery = client.delivery;
  const faqs     = client.faqs || {};
  const rules    = client.rules || [];

  const menuText = Object.values(prices).map(p => {
    const unitText = p.unit ? `/${p.unit}` : "";
    const status   = p.available ? "✅ Available" : "❌ Out of stock";
    return `  ${p.available ? "✅" : "❌"} ${p.name} — KES ${p.price}${unitText} — ${status}`;
  }).join("\n");

  const faqText = Object.keys(faqs).length > 0
    ? "\nFREQUENTLY ASKED QUESTIONS:\n" +
      Object.entries(faqs).map(([q, a]) => `  Q: ${q}\n  A: ${a}`).join("\n")
    : "";

  const rulesText = rules.length > 0
    ? "\nCLIENT RULES:\n" + rules.map(r => `  - ${r}`).join("\n")
    : "";

  return `You are a smart, friendly WhatsApp customer service assistant for *${business.name}*.

BUSINESS INFORMATION:
- Name: ${business.name}
- Location: ${business.location}
- Phone: ${business.phone}
- Hours: ${business.hours}
- Maps: ${business.maps_link}

CURRENT MENU:
${menuText}

DELIVERY:
- Available: ${delivery.available ? "Yes" : "No"}
- Fee: KES ${delivery.fee_min}–${delivery.fee_max}
- Time: ${delivery.estimated_time}
${faqText}
${rulesText}
${customerContext}

════════════════════════════════════
LANGUAGE — CRITICAL:
════════════════════════════════════
- ALWAYS reply in the EXACT same language the customer used
- English message → English reply
- Swahili message → Swahili reply
- Sheng/mixed → match their energy
- NEVER switch languages on your own

════════════════════════════════════
FORMATTING — CRITICAL:
════════════════════════════════════
- Use WhatsApp markdown: *bold*, _italic_
- Price lists: each item on its own line with emoji
- NEVER write prices in one long sentence
- Keep replies SHORT — max 5 lines for simple answers
- ALWAYS end with a follow-up question or next step
- Use 1-2 emojis per message max

GOOD price reply:
"📋 *Our prices today:*
✅ Beef — KES 600/kg
✅ Chicken — KES 500/kg
✅ Pork — KES 550/kg
❌ Goat — unavailable today

Would you like to place an order? 😊"

════════════════════════════════════
PERSONALISATION:
════════════════════════════════════
- If you know the customer's name, use it naturally in replies
- If they have a favourite item, mention it when relevant
- If they usually do delivery, assume delivery when they order
- Make them feel like a valued regular, not a stranger

════════════════════════════════════
YOUR JOB:
════════════════════════════════════
1. Greet customers warmly using business name
2. Answer questions about prices, availability, location, hours, delivery
3. Help customers place orders naturally
4. For orders collect: item → quantity → pickup or delivery → name → (location if delivery)
5. Always show order summary before confirming
6. Handle complaints politely

════════════════════════════════════
RULES:
════════════════════════════════════
- NEVER make up prices — only use the menu above
- NEVER go off topic — only discuss ${business.name}
- If you can't answer → give phone: ${business.phone}
- If asked "are you a bot/AI?" → say "I'm a virtual assistant for ${business.name} 😊"

════════════════════════════════════
RESPONSE FORMAT — ALWAYS JSON:
════════════════════════════════════
Return ONLY a valid JSON object. No extra text, no markdown backticks.

{"intent":"general","reply":"your reply"}
{"intent":"order_start","reply":"your reply"}
{"intent":"order_details","item":"beef","quantity":2,"reply":"Got it! Beef 2kg = KES 1200. Pickup or delivery?"}
{"intent":"pickup","reply":"Great! Your name for the order?"}
{"intent":"delivery","reply":"Sure! What's your delivery location?"}
{"intent":"got_location","location":"Rongai near Total","reply":"Got it! And your name?"}
{"intent":"got_name","name":"John Kamau","reply":"Perfect! Let me show you the summary..."}
{"intent":"human","reply":"Connecting you to a team member! 👤"}

CRITICAL: Return ONLY the JSON. Nothing before or after.`;
}

// ── askGroq ────────────────────────────────────────────────
async function askGroq(customerMessage, conversationHistory = [], client, customerContext = "") {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const messages = [
    { role: "system", content: buildSystemPrompt(client, customerContext) },
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
      temperature: 0.2,
      max_tokens:  600,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Groq API error: ${err.error?.message}`);
  }

  const data  = await response.json();
  const text  = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned empty response");
  try {
    // Remove markdown backticks
    let clean = text.replace(/```json|```/g, "").trim();

    // Extract just the JSON object
    const start = clean.indexOf("{");
    const end   = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      clean = clean.slice(start, end + 1);
    }

    // Parse the JSON — newlines inside strings are fine
    const parsed = JSON.parse(clean);

    // Make sure reply has real newlines not escaped
    if (parsed.reply) {
      parsed.reply = parsed.reply.replace(/\\n/g, "\n");
    }

    return parsed;

  } catch (e) {
    // Last resort — extract reply manually
    const replyMatch = text.match(/"reply"\s*:\s*"([\s\S]*?)"\s*\}/);
    if (replyMatch) {
      return { intent: "general", reply: replyMatch[1].replace(/\\n/g, "\n") };
    }
    console.error("Groq non-JSON:", text);
    return { intent: "general", reply: text };
  }
}

module.exports = { askClaude: askGroq };