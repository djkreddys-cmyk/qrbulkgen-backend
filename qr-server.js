// ================= QRBulkGen Backend (FINAL STABLE VERSION) =================

process.on("uncaughtException", err =>
  console.error("UNCAUGHT EXCEPTION:", err)
);

process.on("unhandledRejection", err =>
  console.error("UNHANDLED REJECTION:", err)
);

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const Razorpay = require("razorpay");

const app = express();

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "https://qrbulkgen.com",
  "https://www.qrbulkgen.com",
  "http://localhost:3000"
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin))
      return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

// ================= DATABASE =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

// test connection (non-blocking)
pool.connect()
  .then(c => {
    console.log("✅ Postgres connected");
    c.release();
  })
  .catch(err => console.error("DB connection error:", err));

// ================= CREATE TABLES =================
async function initDB() {
  try {

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        plan TEXT DEFAULT 'free'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects(
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        data TEXT,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS usage(
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date TEXT,
        count INTEGER DEFAULT 0
      );
    `);

    console.log("✅ Tables ready");

  } catch (err) {
    console.error("DB init error:", err);
  }
}
// ================= CONFIG =================
const SECRET = process.env.JWT_SECRET || "qrbatch_secret";
const FREE_LIMIT = 50;

// ================= AUTH =================
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send("No token");

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
}

// ================= FREE LIMIT =================
async function checkFreeLimit(req, res, next) {
  try {
    const userRes = await pool.query(
      "SELECT plan FROM users WHERE id=$1",
      [req.user.id]
    );

    const user = userRes.rows[0];
    if (!user) return res.status(404).send("User not found");
    if (user.plan === "pro") return next();

    const today = new Date().toISOString().slice(0,10);

    let usage = await pool.query(
      "SELECT * FROM usage WHERE user_id=$1 AND date=$2",
      [req.user.id, today]
    );

    if (!usage.rows.length) {
      await pool.query(
        "INSERT INTO usage(user_id,date,count) VALUES($1,$2,0)",
        [req.user.id, today]
      );
      usage = { rows:[{count:0}] };
    }

    if (usage.rows[0].count >= FREE_LIMIT)
      return res.status(403).json({
        message:"Daily free limit reached",
        limit:FREE_LIMIT
      });

    await pool.query(
      "UPDATE usage SET count=count+1 WHERE user_id=$1 AND date=$2",
      [req.user.id, today]
    );

    next();
  } catch (err) {
    console.error("Limit error:", err);
    res.status(500).send("Server error");
  }
}

// ================= REGISTER =================
app.post("/api/register", async (req,res)=>{
  try{
    const {name,email,password} = req.body;
    if(!name || !email || !password)
      return res.status(400).send("Missing fields");

    const hash = await bcrypt.hash(password,10);

    await pool.query(
      "INSERT INTO users(name,email,password) VALUES($1,$2,$3)",
      [name,email,hash]
    );

    res.send("Registered successfully");
  }catch(err){
    console.error(err);
    res.status(400).send("User already exists");
  }
});

// ================= LOGIN =================
app.post("/api/login", async (req,res)=>{
  try{
    const {email,password} = req.body;

    if(!email || !password)
      return res.status(400).send("Missing email or password");

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if(!result.rows.length)
      return res.status(401).send("User not found");

    const user = result.rows[0];

    if(!user.password)
      return res.status(500).send("Password missing");

    const match = await bcrypt.compare(password,user.password);

    if(!match)
      return res.status(401).send("Invalid password");

    const token = jwt.sign(
      {id:user.id,email:user.email,name:user.name},
      SECRET,
      {expiresIn:"7d"}
    );

    res.json({token,plan:user.plan});

  }catch(err){
    console.error("LOGIN ERROR:",err);
    res.status(500).send("Server error");
  }
});

// ================= PROJECTS =================
app.post("/api/check-limit",auth,checkFreeLimit,(req,res)=>{
  res.send("Allowed");
});

app.post("/api/projects",auth,async(req,res)=>{
  try{
    const {name,data} = req.body;

    await pool.query(
      "INSERT INTO projects(user_id,name,data) VALUES($1,$2,$3)",
      [req.user.id,name,JSON.stringify(data)]
    );

    res.send("Saved");
  }catch(err){
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/api/projects",auth,async(req,res)=>{
  const result = await pool.query(
    "SELECT * FROM projects WHERE user_id=$1 ORDER BY created DESC",
    [req.user.id]
  );
  res.json(result.rows);
});

// ================= PAYMENTS =================
const razor = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "test",
  key_secret: process.env.RAZORPAY_SECRET || "test"
});

app.post("/api/create-order",auth,async(req,res)=>{
  const order = await razor.orders.create({
    amount:19900,
    currency:"INR"
  });
  res.json(order);
});

app.post("/api/verify-payment",auth,async(req,res)=>{
  await pool.query(
    "UPDATE users SET plan=$1 WHERE id=$2",
    ["pro",req.user.id]
  );
  res.send("Payment success");
});

// ================= HEALTH =================
app.get("/", (req,res)=>res.send("OK"));
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// ================= START SERVER =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);

  // initialize DB after server starts
  setTimeout(() => {
    initDB();
  }, 1000);
});









