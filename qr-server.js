// QR SaaS Backend (Login + History + Razorpay + Daily Free Limit)

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const Razorpay = require('razorpay');

const app = express();
app.use(cors());
app.use(express.json());

// IMPORTANT: Railway writable storage
const db = new Database('/tmp/qr.db');

const SECRET = process.env.JWT_SECRET || 'qrbatch-secret';
const FREE_LIMIT = 50;

// Health check route (VERY IMPORTANT FOR RAILWAY)
app.all('/', (req, res) => {
  res.status(200).send('QRBulkGen API Running');
});

// Tables
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT UNIQUE,
 password TEXT,
 plan TEXT DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS projects(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 name TEXT,
 data TEXT,
 created DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usage(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 date TEXT,
 count INTEGER DEFAULT 0
);
`);

// Razorpay
const razor = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'test',
  key_secret: process.env.RAZORPAY_SECRET || 'test'
});

// ---------------- AUTH ----------------

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send('No token');

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).send('Invalid token');
  }
}

// ---------------- FREE LIMIT ----------------

function checkFreeLimit(req, res, next) {
  const user = db.prepare('SELECT plan FROM users WHERE id=?').get(req.user.id);
  if (user.plan === 'pro') return next();

  const today = new Date().toISOString().slice(0, 10);
  let row = db.prepare('SELECT * FROM usage WHERE user_id=? AND date=?')
    .get(req.user.id, today);

  if (!row) {
    db.prepare('INSERT INTO usage(user_id,date,count) VALUES(?,?,0)')
      .run(req.user.id, today);
    row = { count: 0 };
  }

  if (row.count >= FREE_LIMIT)
    return res.status(403).json({ message: 'Daily free limit reached', limit: FREE_LIMIT });

  db.prepare('UPDATE usage SET count=count+1 WHERE user_id=? AND date=?')
    .run(req.user.id, today);

  next();
}

// ---------------- AUTH ROUTES ----------------

// Register
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  try {
    db.prepare('INSERT INTO users(email,password) VALUES(?,?)')
      .run(email, hash);
    res.send('Registered');
  } catch {
    res.status(400).send('User exists');
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).send('Invalid');

  const token = jwt.sign({ id: user.id, email: user.email }, SECRET);
  res.json({ token, plan: user.plan });
});

// ---------------- PROJECTS ----------------

// Check limit before QR
app.post('/api/check-limit', auth, checkFreeLimit, (req, res) => {
  res.send('Allowed');
});

// Save project
app.post('/api/projects', auth, (req, res) => {
  const { name, data } = req.body;

  db.prepare('INSERT INTO projects(user_id,name,data) VALUES(?,?,?)')
    .run(req.user.id, name, JSON.stringify(data));

  res.send('Saved');
});

// List history
app.get('/api/projects', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY created DESC')
    .all(req.user.id);

  res.json(rows);
});

// ---------------- PAYMENTS ----------------

// Create order
app.post('/api/create-order', auth, async (req, res) => {
  const order = await razor.orders.create({ amount: 19900, currency: 'INR' });
  res.json(order);
});

// Verify payment
app.post('/api/verify-payment', auth, (req, res) => {
  db.prepare('UPDATE users SET plan=? WHERE id=?')
    .run('pro', req.user.id);

  res.send('Payment success, Pro activated');
});

// ---------------- START SERVER ----------------

const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Server running on port ${PORT}`);
});


