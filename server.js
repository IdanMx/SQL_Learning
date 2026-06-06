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

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NorthwindSQL server running → http://localhost:${PORT}`);
});
