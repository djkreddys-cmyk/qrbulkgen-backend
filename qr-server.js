// ================= QRBulkGen Backend (FINAL POSTGRES VERSION) =================

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const Razorpay = require('razorpay');

const app = express();
app.use(cors({
  origin: [
    "https://qrbulkgen.com",
    "https://www.qrbulkgen.com",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.use(express.json());

// ================= POSTGRES CONNECTION =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  try {
    await pool.query('SELECT 1');
    console.log("✅ Postgres connected");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        plan TEXT DEFAULT 'free'
      );

      CREATE TABLE IF NOT EXISTS projects(
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        data TEXT,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS usage(
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date TEXT,
        count INTEGER DEFAULT 0
      );
    `);

    console.log("✅ Tables ready");

  } catch (err) {
    console.error("❌ Database init error:", err.message);
  }
}

initDB();
// ================= CONFIG =================
const SECRET = process.env.JWT_SECRET || "qrbatch_secret";
const FREE_LIMIT = 50;
// ================= AUTH MIDDLEWARE =================
function auth(req,res,next){
  const token = req.headers.authorization;
  if(!token) return res.status(401).send("No token");

  try{
    req.user = jwt.verify(token, SECRET);
    next();
  }catch{
    res.status(401).send("Invalid token");
  }
}

// ================= FREE LIMIT CHECK =================
async function checkFreeLimit(req,res,next){
  const userRes = await pool.query(
    'SELECT plan FROM users WHERE id=$1',
    [req.user.id]
  );

  const user = userRes.rows[0];
  if(user.plan === 'pro') return next();

  const today = new Date().toISOString().slice(0,10);

  let usageRes = await pool.query(
    'SELECT * FROM usage WHERE user_id=$1 AND date=$2',
    [req.user.id, today]
  );

  if(usageRes.rows.length === 0){
    await pool.query(
      'INSERT INTO usage(user_id,date,count) VALUES($1,$2,0)',
      [req.user.id, today]
    );
    usageRes = { rows: [{ count: 0 }] };
  }

  if(usageRes.rows[0].count >= FREE_LIMIT)
    return res.status(403).json({
      message:'Daily free limit reached',
      limit:FREE_LIMIT
    });

  await pool.query(
    'UPDATE usage SET count=count+1 WHERE user_id=$1 AND date=$2',
    [req.user.id, today]
  );

  next();
}

// ================= REGISTER =================
app.post('/api/register', async (req,res)=>{
  const {name,email,password} = req.body;

  if(!name || !email || !password)
    return res.status(400).send("Missing fields");

  const hash = await bcrypt.hash(password,10);

  try{
    await pool.query(
      'INSERT INTO users(name,email,password) VALUES($1,$2,$3)',
      [name,email,hash]
    );
    res.send("Registered successfully");
  }catch{
    res.status(400).send("User already exists");
  }
});

// ================= LOGIN =================
app.post('/api/login', async (req,res)=>{
  const {email,password} = req.body;

  const result = await pool.query(
    'SELECT * FROM users WHERE email=$1',
    [email]
  );

  const user = result.rows[0];

  if(!user || !bcrypt.compareSync(password,user.password))
    return res.status(401).send("Invalid credentials");

  const token = jwt.sign(
    {id:user.id,email:user.email,name:user.name},
    SECRET,
    {expiresIn:"7d"}
  );

  res.json({token,plan:user.plan});
});

// ================= CHECK EMAIL =================
app.post('/api/check-email', async (req,res)=>{
  const {email} = req.body;

  if(!email) return res.json({exists:false});

  const result = await pool.query(
    'SELECT id FROM users WHERE email=$1',
    [email]
  );

  res.json({exists: result.rows.length > 0});
});

// ================= RESET PASSWORD =================
app.post('/api/reset-password', async (req,res)=>{
  const {email,newPassword} = req.body;

  if(!email || !newPassword)
    return res.status(400).send("Missing data");

  const check = await pool.query(
    'SELECT id FROM users WHERE email=$1',
    [email]
  );

  if(check.rows.length === 0)
    return res.status(404).send("Email not registered");

  const hash = await bcrypt.hash(newPassword,10);

  await pool.query(
    'UPDATE users SET password=$1 WHERE email=$2',
    [hash,email]
  );

  res.send("Password updated successfully");
});

// ================= PROJECTS =================
app.post('/api/check-limit', auth, checkFreeLimit, (req,res)=>{
  res.send("Allowed");
});

app.post('/api/projects', auth, async (req,res)=>{
  const {name,data} = req.body;

  await pool.query(
    'INSERT INTO projects(user_id,name,data) VALUES($1,$2,$3)',
    [req.user.id, name, JSON.stringify(data)]
  );

  res.send("Saved");
});

app.get('/api/projects', auth, async (req,res)=>{
  const result = await pool.query(
    'SELECT * FROM projects WHERE user_id=$1 ORDER BY created DESC',
    [req.user.id]
  );

  res.json(result.rows);
});

// ================= PAYMENTS =================
const razor = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "test",
  key_secret: process.env.RAZORPAY_SECRET || "test"
});

app.post('/api/create-order', auth, async (req,res)=>{
  const order = await razor.orders.create({
    amount:19900,
    currency:'INR'
  });
  res.json(order);
});

app.post('/api/verify-payment', auth, async (req,res)=>{
  await pool.query(
    'UPDATE users SET plan=$1 WHERE id=$2',
    ['pro', req.user.id]
  );
  res.send("Payment success, Pro activated");
});

// ================= HEALTH CHECK =================
app.get('/', (req,res)=>res.send("OK"));

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT,'0.0.0.0',()=>{
  console.log("🚀 Server running on port",PORT);
});



