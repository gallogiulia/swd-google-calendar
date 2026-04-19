// GET /api/results/load
// Headers: Authorization: Bearer <token>
// Returns: the current results-data.json from main branch

const { requireAuth } = require('../_auth.js');

const REPO_OWNER = 'gallogiulia';
const REPO_NAME = 'swd-google-calendar';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = requireAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return res.status(500).json({ error: 'Server config error' });
  }

  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/results-data.json`, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'swd-results-publisher'
      }
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: `GitHub ${r.status}: ${text}` });
    }
    const data = await r.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const resultsData = JSON.parse(content);
    return res.status(200).json({ resultsData, sha: data.sha });
  } catch (e) {
    console.error('Load error:', e);
    return res.status(500).json({ error: e.message || 'Load failed' });
  }
};