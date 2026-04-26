// ============================================================
// services/stateManager.js
// ============================================================
// PURPOSE: Tracks WHERE each customer is in the conversation.
//
// WHY THIS IS CRITICAL:
// WhatsApp sends you one message at a time. When a customer
// says "2" you need to know: does "2" mean "Goat" (from the
// price menu) or "Delivery" (from the order confirmation)?
//
// The answer depends on what STATE they're currently in.
//
// STATES in our flow:
//   IDLE           → fresh start, show main menu
//   AWAITING_ORDER → user picked "Place Order", waiting for item+qty
//   AWAITING_TYPE  → got item, asking pickup or delivery?
//   AWAITING_LOCATION → they chose delivery, waiting for location
//   AWAITING_NAME  → got location, waiting for their name
//   AWAITING_CONFIRM → showing summary, waiting for 1=confirm / 2=cancel
//   HUMAN_HANDOFF  → escalated to a human attendant
// ============================================================

// In-memory store: { phoneNumber: { state, orderDraft, ... } }
// Key = customer phone number (unique identifier)
// Value = their current session data
const sessions = {};

// ── STATE CONSTANTS ────────────────────────────────────────
// Using an object of constants prevents typo bugs.
// If you type STATES.IDEL it throws an error; "idel" silently fails.
const STATES = {
  IDLE:              "IDLE",
  AWAITING_ORDER:    "AWAITING_ORDER",
  AWAITING_TYPE:     "AWAITING_TYPE",
  AWAITING_LOCATION: "AWAITING_LOCATION",
  AWAITING_NAME:     "AWAITING_NAME",
  AWAITING_CONFIRM:  "AWAITING_CONFIRM",
  HUMAN_HANDOFF:     "HUMAN_HANDOFF",
};

// ── Get session (create if first visit) ───────────────────
function getSession(phone) {
  if (!sessions[phone]) {
    // First time we've seen this number — create a blank session
    sessions[phone] = {
      state:      STATES.IDLE,
      orderDraft: {},   // builds up as the conversation progresses
      createdAt:  new Date().toISOString(),
    };
  }
  return sessions[phone];
}

// ── Update session ─────────────────────────────────────────
// We use Object.assign to MERGE updates — it only changes the
// fields you provide, leaving everything else untouched.
// Example: setState(phone, { state: STATES.AWAITING_TYPE })
// will change the state but keep the orderDraft as-is.
function setState(phone, updates) {
  const session = getSession(phone);
  Object.assign(session, updates);
  return session;
}

// ── Reset session (order done or cancelled) ────────────────
function resetSession(phone) {
  sessions[phone] = {
    state:      STATES.IDLE,
    orderDraft: {},
    createdAt:  new Date().toISOString(),
  };
}

// ── Debug: see all active sessions ────────────────────────
function getAllSessions() {
  return sessions;
}

module.exports = { getSession, setState, resetSession, getAllSessions, STATES };