// ============================================================
// services/mpesaService.js
// ============================================================
// PURPOSE: Handles all M-Pesa Daraja API interactions
//   - Generate access token
//   - Send STK Push to customer
//   - Parse payment callback from Safaricom
// ============================================================

// ── Config ─────────────────────────────────────────────────
function getConfig() {
  const env = process.env.MPESA_ENV || "sandbox";
  return {
    consumerKey:    process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode:      process.env.MPESA_SHORTCODE || "174379",
    passkey:        process.env.MPESA_PASSKEY,
    callbackURL:    process.env.MPESA_CALLBACK_URL,
    env,
    baseURL: env === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke",
  };
}

// ── Token cache ─────────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

// ── Generate access token ───────────────────────────────────
async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const config = getConfig();
  const auth   = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");

  const response = await fetch(
    `${config.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
    { method: "GET", headers: { "Authorization": `Basic ${auth}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`M-Pesa token error: ${err}`);
  }

  const data = await response.json();
  tokenCache  = { token: data.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
  console.log("🔑 M-Pesa access token generated");
  return tokenCache.token;
}

// ── Generate password & timestamp ──────────────────────────
function generatePassword() {
  const config    = getConfig();
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  const raw       = `${config.shortcode}${config.passkey}${timestamp}`;
  return { password: Buffer.from(raw).toString("base64"), timestamp };
}

// ── Format phone for M-Pesa (254XXXXXXXXX) ─────────────────
function formatPhone(phone) {
  let p = String(phone).replace(/\s+/g, "").replace(/[^0-9]/g, "");
  if (p.startsWith("0"))    p = "254" + p.slice(1);
  if (p.startsWith("254") && p.length === 12) return p;
  if (!p.startsWith("254")) p = "254" + p;
  return p;
}

// ── Send STK Push ───────────────────────────────────────────
async function sendSTKPush(customerPhone, amount, orderId, businessName) {
  const config              = getConfig();
  const token               = await getAccessToken();
  const { password, timestamp } = generatePassword();
  const phone               = formatPhone(customerPhone);
  const roundedAmount       = Math.ceil(amount);

  const body = {
    BusinessShortCode: config.shortcode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   "CustomerPayBillOnline",
    Amount:            roundedAmount,
    PartyA:            phone,
    PartyB:            config.shortcode,
    PhoneNumber:       phone,
    CallBackURL:       config.callbackURL,
    AccountReference:  orderId.slice(0, 8).toUpperCase(),
    TransactionDesc:   businessName.slice(0, 13),
  };

  console.log(`💳 STK Push → ${phone} KES ${roundedAmount}`);

  const response = await fetch(
    `${config.baseURL}/mpesa/stkpush/v1/processrequest`,
    {
      method:  "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok || data.ResponseCode !== "0") {
    throw new Error(`STK Push failed: ${data.errorMessage || data.ResponseDescription || JSON.stringify(data)}`);
  }

  console.log(`✅ STK Push sent. CheckoutID: ${data.CheckoutRequestID}`);
  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
  };
}

// ── Parse STK callback from Safaricom ──────────────────────
function parseCallback(body) {
  try {
    const stk  = body.Body?.stkCallback;
    const code = stk?.ResultCode;
    const id   = stk?.CheckoutRequestID;

    if (code === 0) {
      const items    = stk.CallbackMetadata?.Item || [];
      const getValue = (name) => items.find(i => i.Name === name)?.Value;
      return {
        success:            true,
        checkoutRequestId:  id,
        amount:             getValue("Amount"),
        mpesaReceiptNumber: getValue("MpesaReceiptNumber"),
        phoneNumber:        getValue("PhoneNumber"),
        transactionDate:    getValue("TransactionDate"),
      };
    }

    return {
      success:          false,
      checkoutRequestId: id,
      resultCode:        code,
      resultDesc:        stk?.ResultDesc,
    };
  } catch (e) {
    console.error("Callback parse error:", e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { sendSTKPush, parseCallback, formatPhone, getAccessToken };