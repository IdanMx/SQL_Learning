const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'progress.json');

// ─── Middleware ───────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Data helpers ─────────────────────────────────────────
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir))       fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}', 'utf8');
}

function readData() {
  ensureDataFile();
  try   { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── POST /api/login  { name } ────────────────────────────
// Finds or creates a user and returns their saved progress.
app.post('/api/login', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const data = readData();

  if (!data[name]) {
    // First time — create a fresh progress record
    data[name] = {
      xp: 0,
      streak: 0,
      level: 1,
      hearts: 3,
      completedLessons: ['L1_1'],
      queryHistory: [],
      createdAt: new Date().toISOString(),
    };
    writeData(data);
    console.log(`New user created: "${name}"`);
  } else {
    console.log(`Returning user logged in: "${name}"`);
  }

  res.json({ ok: true, progress: data[name] });
});

// ─── POST /api/save  { name, progress } ──────────────────
// Merges and persists the user's current progress object.
app.post('/api/save', (req, res) => {
  const { name, progress } = req.body;
  if (!name || !progress) {
    return res.status(400).json({ error: 'Missing name or progress.' });
  }

  const data = readData();
  if (!data[name]) {
    return res.status(404).json({ error: 'User not found. Please log in again.' });
  }

  // Whitelist fields — never overwrite metadata written by the server
  const allowed = ['xp', 'streak', 'level', 'hearts', 'completedLessons', 'queryHistory'];
  for (const key of allowed) {
    if (progress[key] !== undefined) data[name][key] = progress[key];
  }
  data[name].updatedAt = new Date().toISOString();

  writeData(data);
  res.json({ ok: true });
});

// ─── GET /admin-secret-data ──────────────────────────────
// Protected admin view of the raw progress file.
// Access: /admin-secret-data?token=YOUR_ADMIN_TOKEN
// Set the ADMIN_TOKEN environment variable in Render to secure it.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

app.get('/admin-secret-data', (req, res) => {
  // Block access if no token has been configured on the server
  if (!ADMIN_TOKEN) {
    return res.status(503).send('Admin access is disabled. Set the ADMIN_TOKEN environment variable in Render to enable it.');
  }

  // Reject wrong or missing token
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send('Unauthorized. Append ?token=YOUR_ADMIN_TOKEN to the URL.');
  }

  // Read and return the file
  const data = readData();
  const userCount = Object.keys(data).length;

  // Return a pretty HTML page rather than raw JSON so it's readable in the browser
  const rows = Object.entries(data).map(([name, p]) => `
    <tr>
      <td>${escHtml(name)}</td>
      <td>${p.xp ?? 0}</td>
      <td>${p.level ?? 1}</td>
      <td>${p.streak ?? 0}</td>
      <td>${(p.completedLessons ?? []).length}</td>
      <td>${(p.queryHistory ?? []).length}</td>
      <td>${p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</td>
      <td>${p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>NorthwindSQL — Admin</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0c0f14; color: #e8ecf4; padding: 32px; }
    h1   { color: #00e5a0; font-size: 20px; margin-bottom: 4px; }
    p    { color: #4a5568; font-size: 13px; margin-bottom: 24px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th   { background: #1c2333; color: #8b95a8; text-transform: uppercase;
           font-size: 11px; letter-spacing: .06em; padding: 10px 14px; text-align: left; }
    td   { padding: 9px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    tr:hover td { background: rgba(255,255,255,0.03); }
    .raw { margin-top: 40px; }
    .raw summary { cursor: pointer; color: #4d9eff; font-size: 13px; margin-bottom: 12px; }
    pre  { background: #080a0d; border: 1px solid rgba(255,255,255,0.06);
           border-radius: 8px; padding: 20px; font-size: 12px; overflow-x: auto;
           color: #c9d8f0; line-height: 1.7; }
  </style>
</head>
<body>
  <h1>NorthwindSQL — Admin Dashboard</h1>
  <p>${userCount} registered user${userCount !== 1 ? 's' : ''} · Data file: ${DATA_FILE}</p>
  <table>
    <thead>
      <tr>
        <th>Name</th><th>XP</th><th>Level</th><th>Streak</th>
        <th>Lessons done</th><th>Queries run</th><th>Created</th><th>Last saved</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="8" style="color:#4a5568;padding:24px">No users yet.</td></tr>'}</tbody>
  </table>
  <details class="raw">
    <summary>▶ Show raw JSON</summary>
    <pre>${escHtml(JSON.stringify(data, null, 2))}</pre>
  </details>
</body>
</html>`);
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NorthwindSQL server running → http://localhost:${PORT}`);
});
