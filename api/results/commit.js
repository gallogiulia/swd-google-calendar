// POST /api/results/commit
// Headers: Authorization: Bearer <token>
// Body: {
//   resultsData: {...},   // full updated results-data.json object
//   photos: [             // array of photos to upload
//     { path: "photos/tournament-id/1-john-doe.jpg", base64: "..." }
//   ],
//   commitMessage: "..."
// }
// Does: creates a single atomic GitHub commit with JSON + all photos

const { requireAuth } = require('../_auth.js');

const REPO_OWNER = 'gallogiulia';
const REPO_NAME = 'swd-google-calendar';
const BRANCH = 'main';

async function gh(path, method, body, pat) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `token ${pat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'swd-results-publisher'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    const err = new Error(`GitHub ${r.status}: ${data.message || text}`);
    err.status = r.status;
    err.response = data;
    throw err;
  }
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = requireAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return res.status(500).json({ error: 'Server config error: GITHUB_PAT missing' });
  }

  const { resultsData, photos, commitMessage } = req.body || {};
  if (!resultsData || typeof resultsData !== 'object') {
    return res.status(400).json({ error: 'Missing resultsData' });
  }

  const photosList = Array.isArray(photos) ? photos : [];
  const msg = (commitMessage || 'Update results').toString().slice(0, 200);

  try {
    // 1. Get latest commit SHA on main
    const ref = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, 'GET', null, pat);
    const parentSha = ref.object.sha;

    // 2. Get parent tree
    const parentCommit = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${parentSha}`, 'GET', null, pat);
    const baseTreeSha = parentCommit.tree.sha;

    // 3. Create blobs for everything
    const treeItems = [];

    // The results JSON blob
    const jsonContent = JSON.stringify(resultsData, null, 2);
    const jsonBlob = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, 'POST', {
      content: Buffer.from(jsonContent, 'utf8').toString('base64'),
      encoding: 'base64'
    }, pat);
    treeItems.push({
      path: 'results-data.json',
      mode: '100644',
      type: 'blob',
      sha: jsonBlob.sha
    });

    // Photo blobs
    for (const ph of photosList) {
      if (!ph.path || !ph.base64) continue;
      // Strip potential data URI prefix
      const b64 = ph.base64.replace(/^data:[^;]+;base64,/, '');
      const blob = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, 'POST', {
        content: b64,
        encoding: 'base64'
      }, pat);
      treeItems.push({
        path: ph.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }

    // 4. Create tree
    const tree = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, 'POST', {
      base_tree: baseTreeSha,
      tree: treeItems
    }, pat);

    // 5. Create commit
    const commit = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, 'POST', {
      message: `${msg} (via ${user.u})`,
      tree: tree.sha,
      parents: [parentSha]
    }, pat);

    // 6. Update ref
    await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, 'PATCH', {
      sha: commit.sha,
      force: false
    }, pat);

    return res.status(200).json({
      ok: true,
      commitSha: commit.sha,
      filesCommitted: treeItems.length,
      user: user.u
    });
  } catch (e) {
    console.error('Commit error:', e);
    return res.status(500).json({ error: e.message || 'Commit failed' });
  }
};