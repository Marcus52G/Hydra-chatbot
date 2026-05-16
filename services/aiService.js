// ============================================================
// services/aiService.js
// ============================================================
// PURPOSE: The AI brain of the bot.
//
// This file sends the customer's message to Claude API and
// gets back a structured JSON response telling us:
//   - What the customer INTENDS to do (intent)
//   - Any data extracted (item, quantity, name, location)
//   - A natural human-like reply to send back
//
// WHY CLAUDE INSTEAD OF REGEX?
// Regex: only understands "beef 2kg" exactly
// Claude: understands ALL of these:
//   "nataka nyama ya ng'ombe kilo mbili"  (Swahili)
//   "nipe beef kilo 2"                    (Sheng)
//   "I want 2kg of beef please"           (English)
//   "beef"                                (just the word)
//   "whats cheapest?"                     (question)
//   "is goat available today?"            (question)
// ============================================================

const fs   = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/db.json");

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

// ── Build a fresh system prompt from db.json ───────────────
// This reads the LIVE data every time so if prices change
// the AI immediately knows the new prices — no code changes needed
function buildSystemPrompt() {
  const db = readDB();
  const business = db.business;
  const prices   = db.prices;
  const delivery = db.delivery;

  // Build the menu text from live db.json data
  const menuText = Object.values(prices).map(p => {
    const status = p.available ? "✅ Available" : "❌ Out of stock";
    return `  - ${p.name}: KES ${p.price}/kg — ${status}`;
  }).join("\n");

  // This is the "training" for the AI — it defines who it is
  // and what it knows about the business
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
- You speak BOTH English and Swahili — reply in the same language the customer uses
- If they mix languages (Sheng), match their energy
- Keep replies SHORT and clear — this is WhatsApp, not an essay
- Use emojis naturally but not excessively
- You are knowledgeable about meat — you can give cooking tips if asked

YOUR JOB:
1. Answer questions about prices, availability, location, hours, delivery
2. Help customers place orders naturally — no rigid format needed
3. Handle complaints politely and escalate if needed
4. Upsell naturally: "Beef is great today! Would you like to add Chicken?"

STRICT RULES:
- NEVER make up prices or availability — only use what is listed above
- NEVER promise delivery times you are not sure about
- If a customer asks something you cannot answer, say so and offer the phone number
- For placing orders, you must collect: item, quantity, pickup or delivery, name
- If delivery: also collect their location

RESPONSE FORMAT:
You must ALWAYS respond with a valid JSON object — nothing else, no extra text.

For general conversation / questions:
{
  "intent": "general",
  "reply": "your friendly reply here"
}

For when customer wants to order:
{
  "intent": "order_start",
  "reply": "your reply confirming what you understood and asking next question"
}

For when you have extracted order details:
{
  "intent": "order_details",
  "item": "beef",
  "quantity": 2,
  "reply": "Got it! Beef 2kg = KES 1200. Pickup or delivery?"
}

For when customer says pickup:
{
  "intent": "pickup",
  "reply": "Great! What is your name?"
}

For when customer says delivery:
{
  "intent": "delivery",
  "reply": "Sure! What is your delivery location?"
}

For when you have their location:
{
  "intent": "got_location",
  "location": "Rongai near Total",
  "reply": "Got it! What is your name?"
}

For when you have their name:
{
  "intent": "got_name",
  "name": "John Kamau",
  "reply": "Perfect! Let me confirm your order..."
}

For escalation to human:
{
  "intent": "human",
  "reply": "Let me connect you to our attendant right away!"
}

IMPORTANT: Return ONLY the JSON object. No markdown, no backticks, no explanation.`;
}

// ── askClaude ──────────────────────────────────────────────
// Sends a message to Claude API and returns parsed JSON
// conversationHistory = array of previous messages for context
async function askClaude(customerMessage, conversationHistory = []) {
  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY not set in environment variables");
  }

  // Build messages array — include conversation history for context
  // This is how Claude remembers what was said earlier in the chat
  const messages = [
    ...conversationHistory,
    { role: "user", content: customerMessage }
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":            "application/json",
      "x-api-key":               apiKey,
      "anthropic-version":       "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5",  // fastest + cheapest model
      max_tokens: 500,                  // short replies only — this is WhatsApp
      system:     buildSystemPrompt(), // business data injected here
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude API error: ${err.error?.message}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

  // Parse the JSON response from Claude
  // Claude was instructed to return ONLY JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    // If Claude somehow didn't return valid JSON, return a safe fallback
    console.error("Claude returned non-JSON:", text);
    return {
      intent: "general",
      reply:  text, // use raw text as reply
    };
  }
}

module.exports = { askClaude };