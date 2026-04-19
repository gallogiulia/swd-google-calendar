// POST /api/login
// Body: { username, password }
// Returns: { token, expiresAt } on success, { error } on fail

const crypto = require('crypto');

function verifyPassword(password, stored) {
  try {
    const [salt, expectedHash] = stored.split(':');
    const actualHash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch (e) {
    return false;
  }
}

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${body}.${sig}`;
}

module.exports = async (req, res) => {
  // CORS for simplicity (same-origin Vercel deploy)
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  let users;
  try {
    users = JSON.parse(process.env.USERS || '{}');
  } catch (e) {
    return res.status(500).json({ error: 'Server config error' });
  }

  const key = String(username).toLowerCase().trim();
  const stored = users[key];
  if (!stored || !verifyPassword(password, stored)) {
    // Same error message for both to prevent username enumeration
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const token = signToken({ u: key, exp: expiresAt }, process.env.SESSION_SECRET);
  return res.status(200).json({ token, expiresAt, username: key });
};