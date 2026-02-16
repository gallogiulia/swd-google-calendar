import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    res.status(200).json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
