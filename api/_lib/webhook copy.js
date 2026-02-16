import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { fetchCaptureDetails } from "../_lib/paypal.js";
import { getTournamentByName } from "../_lib/tournamentMap.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

async function verifyPayPalWebhook(rawBody, headers) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("Missing PAYPAL_WEBHOOK_ID");

  // sandbox for Phase 1
  const base = "https://api-m.sandbox.paypal.com";

  // get token
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const tok = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tok.ok) throw new Error(`PayPal token error: ${tok.status} ${await tok.text()}`);
  const { access_token } = await tok.json();

  const payload = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  };

  const r = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) throw new Error(`verify signature error: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.verification_status === "SUCCESS";
}

function parseCustomId(customId) {
  // your format: T:<name>|P1:...|P2:...|G:Green A|
  const out = { tournamentName: "", players: [], green: null };

  const s = String(customId || "");
  const parts = s.split("|").map(x => x.trim()).filter(Boolean);

  for (const p of parts) {
    if (p.startsWith("T:")) out.tournamentName = p.slice(2).trim();
    else if (p.startsWith("G:")) out.green = p.slice(2).trim();
    else if (/^P\d+:/i.test(p)) {
      const idx = p.indexOf(":");
      out.players.push({ role: `P${p.slice(1, idx)}`, name: p.slice(idx + 1).trim() });
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const rawBody = await readRawBody(req);
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v])
  );

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  // Verify signature
  try {
    const ok = await verifyPayPalWebhook(rawBody, headers);
    if (!ok) return res.status(400).send("Invalid signature");
  } catch (e) {
    return res.status(500).send(String(e.message || e));
  }

  // Only handle completed captures/orders (sandbox names vary; we’ll support both common ones)
  const eventType = event.event_type || "";
  const resource = event.resource || {};

  // Try to get capture id
  const captureId =
    resource.id ||
    resource.capture_id ||
    resource?.supplementary_data?.related_ids?.capture_id ||
    null;

  // PayPal sometimes gives order id first; if we don’t have capture id, just ACK for now.
  if (!captureId) return res.status(200).send("No capture id; ignored");

  try {
    const details = await fetchCaptureDetails(captureId);

    const amount = details.amount?.value;
    const currency = details.amount?.currency_code || "USD";
    const payerEmail = details.payer?.email_address || null;
    const payerName = details.payer?.name
      ? `${details.payer.name.given_name || ""} ${details.payer.name.surname || ""}`.trim()
      : null;

    const customId =
      details?.custom_id ||
      details?.supplementary_data?.related_ids?.custom_id ||
      details?.supplementary_data?.custom_id ||
      null;

    const parsedCustom = parseCustomId(customId || "");
    const t = getTournamentByName(parsedCustom.tournamentName);

    const tournamentId = t?.id || "unknown";
    const amountCents = Math.round(Number(amount || 0) * 100);

    const sb = supabaseAdmin();

    const insert = {
      tournament_id: tournamentId,
      players: parsedCustom.players,
      green: parsedCustom.green,
      paypal_capture_id: captureId,
      paypal_order_id: details?.supplementary_data?.related_ids?.order_id || null,
      payer_email: payerEmail,
      payer_name: payerName,
      amount_cents: amountCents,
      currency,
      status: "paid",
      raw_webhook: { eventType, event, capture: details },
    };

    const { error } = await sb.from("registrations").insert(insert);
    if (error) {
      // if duplicate capture id, treat as success
      if (String(error.message || "").toLowerCase().includes("duplicate")) {
        return res.status(200).send("Duplicate; ok");
      }
      throw error;
    }

    return res.status(200).send("OK");
  } catch (e) {
    return res.status(500).send(String(e.message || e));
  }
}
