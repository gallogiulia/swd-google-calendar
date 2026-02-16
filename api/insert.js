import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  try {
    const supabase = supabaseAdmin();

    const fake = {
      provider: "TEST",
      event_type: "TEST.INSERT",
      tournament_id: "swd_mumma_mixed_pairs",
      payer_name: "Test Person",
      payer_email: "test@example.com",
      amount_cents: 6000,
      currency: "USD",
      green: "Green A",
      roster: { P1: "Skip Test", P2: "Lead Test" },
      paypal_capture_id: "CAPTURE_TEST_123",
      paypal_order_id: "ORDER_TEST_123",
      raw: { ok: true }
    };

    const { data, error } = await supabase
      .from("entries")
      .insert([fake])
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, inserted: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
