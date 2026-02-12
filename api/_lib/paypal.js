export async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("Missing PayPal client creds");

  const base = "https://api-m.sandbox.paypal.com"; // sandbox for Phase 1
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!r.ok) throw new Error(`PayPal token error: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return { accessToken: j.access_token, base };
}

export async function fetchCaptureDetails(captureId) {
  const { accessToken, base } = await getPayPalAccessToken();
  const r = await fetch(`${base}/v2/payments/captures/${captureId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`PayPal capture fetch error: ${r.status} ${await r.text()}`);
  return r.json();
}
