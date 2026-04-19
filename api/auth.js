// Shared helper: verify session token from Authorization header
const crypto = require('crypto');

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch (e) {
    return null;
  }
  let payload;
  try {
    // Reverse base64url → base64
    let b = body.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    payload = JSON.parse(Buffer.from(b, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function requireAuth(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  return verifyToken(m[1], process.env.SESSION_SECRET);
}

module.exports = { verifyToken, requireAuth };