import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .limit(1);

    if (error) throw error;

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
