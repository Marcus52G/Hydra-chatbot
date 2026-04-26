// ============================================================
// test-bot.js — Local conversation simulator
// ============================================================
// Run this with: node test-bot.js
// It simulates a full customer conversation WITHOUT needing
// a real WhatsApp connection. Pure logic test.
// ============================================================

const { handleMessage } = require("./services/messageHandler");

const PHONE = "+254700000001"; // fake test number

// Helper to simulate sending a message and printing the reply
async function send(text) {
  console.log(`\n👤 Customer: "${text}"`);
  const reply = await handleMessage(PHONE, text);
  if (reply) {
    console.log(`🤖 Bot:\n${reply}`);
  } else {
    console.log(`🤫 Bot: [silent — human handoff]`);
  }
  console.log("─".repeat(50));
}

// Run the full happy path: order beef, delivery, confirm
async function runTest() {
  console.log("═".repeat(50));
  console.log(" BOT CONVERSATION SIMULATOR");
  console.log("═".repeat(50));

  await send("hi");             // should show main menu
  await send("3");              // place order
  await send("beef 2kg");       // order beef
  await send("2");              // choose delivery
  await send("Rongai, near Total petrol station");  // location
  await send("John Kamau");     // name
  await send("1");              // confirm

  console.log("\n✅ Test complete — check data/db.json for the saved order");
}

runTest().catch(console.error);