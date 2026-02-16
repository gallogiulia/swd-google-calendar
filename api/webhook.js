import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { verifyWebhookSignature } from "./_lib/paypal.js";

export const config = {
  api: {
    bodyParser: true, // fine for PayPal verify (we send parsed JSON to PayPal)
  },
};

function normalizeRosterFromCustomId(customId) {
  // customId format you described: "T:Name|P1:aaa|P2:bbb|G:Green A|"
  const out = { roster: {}, green: null, tournamentName: null };

  const s = String(customId || "");
  if (!s) return out;

  const parts = s.split("|").map(p => p.trim()).filter(Boolean);

  for (const p of parts) {
    if (p.startsWith("T:")) out.tournamentName = p.slice(2).trim();
    else if (p.startsWith("G:")) out.green = p.slice(2).trim();
    else if (p.startsWith("P")) {
      const m = p.match(/^P(\d+)\s*:(.+)$/);
      if (m) out.roster[`P${m[1]}`] = m[2].trim();
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const body = req.body;

  try {
    // 1) Verify signature
    const verified = await verifyWebhookSignature({ headers, body });
    if (!verified.ok) {
      return res.status(400).json({ ok: false, error: `Bad signature: ${verified.reason}` });
    }

    // 2) Only handle capture completed
    const eventType = body?.event_type;
    if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.status(200).json({ ok: true, ignored: true, event_type: eventType });
    }

    const resource = body?.resource || {};
    const captureId = resource?.id || null;
    const orderId = resource?.supplementary_data?.related_ids?.order_id || null;

    const payerEmail = resource?.payer?.email_address || null;
    const payerName =
      [resource?.payer?.name?.given_name, resource?.payer?.name?.surname].filter(Boolean).join(" ") || null;

    const amountStr = resource?.amount?.value || null;
    const currency = resource?.amount?.currency_code || null;
    const amountCents = amountStr ? Math.round(Number(amountStr) * 100) : null;

    // PayPal includes purchase_units in some webhook payloads; sometimes not.
    // If present, custom_id lives on purchase_unit.custom_id (and description on purchase_unit.description).
    const pu = resource?.purchase_units?.[0] || null;
    const customId = pu?.custom_id || null;
    const description = pu?.description || null;

    const extracted = normalizeRosterFromCustomId(customId);

    // You already have a tournaments table; resolve tournament_id from name later.
    // For now, store tournament_id as a normalized slug of tournamentName if present.
    const tournamentName = extracted.tournamentName || description || "Unknown Tournament";
    const tournamentId = String(tournamentName)
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);

    const payload = {
      provider: "PAYPAL",
      event_type: eventType,

      tournament_id: tournamentId,
      // tournament_name/format are not in your current table definition; skip them unless you add columns

      payer_name: payerName,
      payer_email: payerEmail,

      amount_cents: amountCents,
      currency,

      green: extracted.green,
      roster: extracted.roster,

      paypal_capture_id: captureId,
      paypal_order_id: orderId,

      raw: body,
      status: "PAID",
    };

    const sb = supabaseAdmin();

    // idempotent insert
    const { data, error } = await sb
      .from("entries")
      .upsert(payload, { onConflict: "paypal_capture_id" })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, entry: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
