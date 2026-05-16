// ============================================================
// test-bot.js  (MULTI-CLIENT VERSION)
// ============================================================
// Tests the bot as different clients to confirm each one
// gets their own correct business data
// ============================================================

require("dotenv").config();

const { handleMessage } = require("./services/messageHandler");
const { getClient }     = require("./services/clientManager");

const CUSTOMER_PHONE = "+254700000001";

async function send(text, client) {
  console.log(`\n👤 Customer: "${text}"`);
  const reply = await handleMessage(CUSTOMER_PHONE, text, client);
  if (reply) {
    console.log(`🤖 Bot:\n${reply}`);
  } else {
    console.log(`🤫 Bot: [human handoff]`);
  }
  console.log("─".repeat(50));
}

async function runTest() {
  console.log("═".repeat(50));
  console.log(" MULTI-CLIENT BOT TEST");
  console.log("═".repeat(50));

  // ── Test Client 1 — Sample Client ───────────────────────
  const client1 = getClient("+254118612755");
  if (client1) {
    console.log(`\n🏪 Testing: ${client1.business.name}`);
    console.log("─".repeat(50));
    await send("hi", client1);
    await send("what are your prices?", client1);
  } else {
    console.log("⚠️  Client 1 not found — check clients/+254118612755.json");
  }

  // ── Test Client 2 — would be a second client ───────────
  // Uncomment and add their number when you have a second client:
  // const client2 = getClient("+254733000000");
  // if (client2) {
  //   console.log(`\n🏪 Testing: ${client2.business.name}`);
  //   await send("hi", client2);
  // }

  console.log("\n✅ Multi-client test complete!");
  console.log("\nTo add a new client:");
  console.log("  1. Copy clients/TEMPLATE.json");
  console.log("  2. Rename to their WhatsApp number e.g +254733000000.json");
  console.log("  3. Fill in their business data");
  console.log("  4. Done — no code changes needed!");
}

runTest().catch(console.error);