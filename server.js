/**
 * server.js
 * Minimal Express server for Bingo app.
 *
 * Stores all data in an encrypted JSON file via lib/store.js
 * Sessions are handled with a simple signed cookie (small session id).
 *
 * WARNING: For production you'd want a proper DB and stronger session management.
 */

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const Store = require('./lib/store');

const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'keyboard-cat-session-secret';

if (!SECRET_KEY) {
  console.error('ERROR: You must set SECRET_KEY env var (used to encrypt data file).');
  console.error('Example (mac/linux): export SECRET_KEY="super-secret-32-chars"');
  process.exit(1);
}

// initialize store
const store = new Store({
  filePath: path.join(__dirname, 'data', 'store.json.enc'),
  secretKey: SECRET_KEY
});

const app = express();
app.use(bodyParser.json());
app.use(cookieParser(SESSION_SECRET));
app.use(express.static(path.join(__dirname, 'public')));

// Middlewares
function requireAuth(req, res, next) {
  const sessionId = req.signedCookies['sid'];
  if (!sessionId) return res.status(401).json({ error: 'Not signed in' });
  const user = store.getUserBySession(sessionId);
  if (!user) return res.status(401).json({ error: 'Session invalid' });
  req.user = user;
  req.sessionId = sessionId;
  next();
}

// API endpoints

// Sign up
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  const exists = store.getUserByEmail(email);
  if (exists) return res.status(400).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  // default phrases
  const defaultPhrases = store.defaultPhrases();
  const board = defaultPhrases.map((p) => ({ phrase: p, url: null }));

  const user = {
    id: uuidv4(),
    name,
    email,
    passwordHash: hashed,
    board,   // 25 entries
    createdAt: new Date().toISOString()
  };

  store.addUser(user);
  store.save();

  // create a session id and set cookie
  const sid = store.createSessionForUser(user.id);
  res.cookie('sid', sid, { signed: true, httpOnly: true });
  res.json({ ok: true });
});

// Sign in
app.post('/api/signin', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = store.getUserByEmail(email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: 'Invalid credentials' });

  const sid = store.createSessionForUser(user.id);
  store.save();
  res.cookie('sid', sid, { signed: true, httpOnly: true });
  res.json({ ok: true });
});

// Sign out
app.post('/api/signout', (req, res) => {
  const sid = req.signedCookies['sid'];
  if (sid) store.destroySession(sid);
  res.clearCookie('sid');
  store.save();
  res.json({ ok: true });
});

// Get current user's board
app.get('/api/board', requireAuth, (req, res) => {
  // return 5x5 board as array of 25 {phrase, url}
  res.json({ board: req.user.board, name: req.user.name, email: req.user.email });
});

// Update a single cell (index 0..24)
app.post('/api/board/update', requireAuth, (req, res) => {
  const { index, url } = req.body || {};
  if (typeof index !== 'number' || index < 0 || index >= 25) return res.status(400).json({ error: 'Invalid index' });

  // allow url = null to clear
  if (url !== null && url !== undefined) {
    // basic validation (server-side): must be http(s)
    try {
      const u = new URL(url);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Invalid protocol');
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  }

  req.user.board[index].url = url ? url : null;
  store.updateUser(req.user);
  store.save();
  res.json({ ok: true, board: req.user.board });
});

// Submit bingo (user claims a bingo). Server will store a winners entry.
app.post('/api/bingo', requireAuth, (req, res) => {
  // server trusts the user session; client may send board snapshot (optional).
  const snapshot = req.body.snapshot || req.user.board;
  const winner = {
    id: uuidv4(),
    userId: req.user.id,
    name: req.user.name,
    snapshot,
    createdAt: new Date().toISOString()
  };
  store.addWinner(winner);
  store.save();
  res.json({ ok: true });
});

// Get winners
app.get('/api/winners', (req, res) => {
  const winners = store.getWinners();
  res.json({ winners });
});

// Serve app (static files handled by express.static)

// Start server after store loads (it will create file if not exist)
store.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Bingo app listening at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize store:', err);
  process.exit(1);
});