require("dotenv").config();

// test-bot.js — AI-powered bot simulator
// Run with: node test-bot.js

const { handleMessage } = require("./services/messageHandler");

const PHONE = "+254700000001";

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

async function runTest() {
  console.log("═".repeat(50));
  console.log(" AI BOT TEST — Claude Powered");
  console.log("═".repeat(50));

  // Test 1 — greeting
  await send("hi");

  // Test 2 — Swahili order
  await send("nataka beef kilo mbili");

  // Test 3 — delivery choice
  await send("delivery");

  // Test 4 — location
  await send("Rongai near Total petrol station");

  // Test 5 — name
  await send("John Kamau");

  // Test 6 — confirm
  await send("1");

  console.log("\n════════════════════════════════");
  console.log(" EXTRA AI TESTS");
  console.log("════════════════════════════════");

  // Test AI understanding of natural questions
  await send("whats cheapest today?");
  await send("is goat available?");
  await send("what time do you close?");
  await send("nipe chicken 1.5kg");  // Sheng

  console.log("\n✅ Done — check data/db.json for saved order");
}

runTest().catch(console.error);