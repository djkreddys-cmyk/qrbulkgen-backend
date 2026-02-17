// Simple QR SaaS Backend (Login + History)
const express=require('express');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const Database=require('better-sqlite3');

const app=express();
app.use(cors());
app.use(express.json());

const db = new Database('/tmp/qr.db');

// Tables
db.exec(`CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT UNIQUE,
 password TEXT
);
CREATE TABLE IF NOT EXISTS projects(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 name TEXT,
 data TEXT,
 created DATETIME DEFAULT CURRENT_TIMESTAMP
);`);

const SECRET='qrbatch-secret';

function auth(req,res,next){
 const token=req.headers.authorization;
 if(!token) return res.status(401).send('No token');
 try{req.user=jwt.verify(token,SECRET);}catch{ return res.status(401).send('Invalid token'); }
 next();
}

// Register
app.post('/api/register',async(req,res)=>{
 const {email,password}=req.body;
 const hash=await bcrypt.hash(password,10);
 try{db.prepare('INSERT INTO users(email,password) VALUES(?,?)').run(email,hash);
 res.send('Registered');}
 catch{res.status(400).send('User exists');}
});

// Login
app.post('/api/login',(req,res)=>{
 const {email,password}=req.body;
 const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if(!user||!bcrypt.compareSync(password,user.password)) return res.status(401).send('Invalid');
 const token=jwt.sign({id:user.id,email:user.email},SECRET);
 res.json({token});
});

// Save project
app.post('/api/projects',auth,(req,res)=>{
 const {name,data}=req.body;
 db.prepare('INSERT INTO projects(user_id,name,data) VALUES(?,?,?)').run(req.user.id,name,JSON.stringify(data));
 res.send('Saved');
});

// List history
app.get('/api/projects',auth,(req,res)=>{
 const rows=db.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY created DESC').all(req.user.id);
 res.json(rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});



