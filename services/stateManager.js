// ============================================================
// services/stateManager.js  (HYBRID VERSION)
// ============================================================

const sessions = {};

const STATES = {
  IDLE:              "IDLE",
  MAIN_MENU:         "MAIN_MENU",
  SELECTING_PRODUCT: "SELECTING_PRODUCT",
  ENTERING_QUANTITY: "ENTERING_QUANTITY",
  AWAITING_ORDER:    "AWAITING_ORDER",
  AWAITING_TYPE:     "AWAITING_TYPE",
  AWAITING_LOCATION: "AWAITING_LOCATION",
  AWAITING_NAME:     "AWAITING_NAME",
  AWAITING_CONFIRM:  "AWAITING_CONFIRM",
  AI_QUESTION:       "AI_QUESTION",
  HUMAN_HANDOFF:     "HUMAN_HANDOFF",
};

function getSession(phone) {
  if (!sessions[phone]) {
    sessions[phone] = {
      state:       STATES.IDLE,
      orderDraft:  {},
      productList: [],
      conversationHistory: [],
      createdAt:   new Date().toISOString(),
    };
  }
  return sessions[phone];
}

function setState(phone, updates) {
  const session = getSession(phone);
  Object.assign(session, updates);
  return session;
}

function resetSession(phone) {
  sessions[phone] = {
    state:       STATES.IDLE,
    orderDraft:  {},
    productList: [],
    conversationHistory: [],
    createdAt:   new Date().toISOString(),
  };
}

function getAllSessions() {
  return sessions;
}

module.exports = { getSession, setState, resetSession, getAllSessions, STATES };