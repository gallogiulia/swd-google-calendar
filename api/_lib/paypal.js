export function paypalBaseUrl() {
  const env = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export async function paypalAccessToken() {
  const base = paypalBaseUrl();
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");

  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!r.ok) throw new Error(`PayPal token failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

// Verifies webhook signature with PayPal
export async function verifyWebhookSignature({ headers, body }) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("Missing PAYPAL_WEBHOOK_ID");

  const transmissionId = headers["paypal-transmission-id"];
  const transmissionTime = headers["paypal-transmission-time"];
  const certUrl = headers["paypal-cert-url"];
  const authAlgo = headers["paypal-auth-algo"];
  const transmissionSig = headers["paypal-transmission-sig"];

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return { ok: false, reason: "Missing PayPal signature headers" };
  }

  const accessToken = await paypalAccessToken();
  const base = paypalBaseUrl();

  const payload = {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: webhookId,
    webhook_event: body,
  };

  const r = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    return { ok: false, reason: `Verify failed: ${r.status} ${await r.text()}` };
  }

  const j = await r.json();
  return { ok: j.verification_status === "SUCCESS", reason: j.verification_status };
}
