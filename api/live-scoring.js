import { GATED_SCORING } from './_lib/gatedScoring.js';

// GET /api/live-scoring?id=<event id>
//
// Answers "may this event's scoring sheets be shown yet?" using the server's
// clock, so a viewer cannot bring the sheets forward by changing the date on
// their phone. Before the opening time the sheet URLs are not in the response
// at all - there is nothing on the page to read ahead.
export default function handler(req, res) {
  // Never cache. A cached "not open yet" would outlive the opening time and
  // keep the page dark on tournament morning, with nobody around to clear it.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const id = String(req.query.id || '');
  const cfg = GATED_SCORING[id];
  if (!cfg) {
    res.status(404).json({ error: 'no gated scoring for this event' });
    return;
  }

  const opensAt = new Date(cfg.opensAt);
  if (Date.now() < opensAt.getTime()) {
    res.status(200).json({
      open: false,
      opensAt: cfg.opensAt,
      opensAtLabel: cfg.opensAtLabel || ''
    });
    return;
  }

  res.status(200).json({ open: true, sheets: cfg.sheets });
}
