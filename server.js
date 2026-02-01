const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Prepare storage folders
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer setup (limit file size 20MB)
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-\_]/g, '_')); }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

// Session (in-memory for prototype)
app.use(session({
  secret: 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// DB
const DB_PATH = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    originalname TEXT,
    subject TEXT,
    uploader TEXT,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER,
    downloader_name TEXT,
    downloader_subject TEXT,
    phone TEXT,
    roll TEXT,
    ip TEXT,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS owner (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    passwordHash TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    code TEXT,
    expires_at INTEGER
  )`);
});

// Helper
function escape(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.post('/upload', upload.single('noteFile'), (req, res) => {
  const { subject, uploader } = req.body;
  if (!req.file) return res.status(400).send('No file uploaded');
  const stmt = db.prepare('INSERT INTO notes(filename, originalname, subject, uploader, created_at) VALUES(?,?,?,?,?)');
  stmt.run(req.file.filename, req.file.originalname, subject || '', uploader || '', new Date().toISOString(), function (err) {
    if (err) return res.status(500).send('DB error');
    res.redirect('/notes');
  });
});

// Owner routes
app.get('/owner', (req, res) => {
  if (req.session && req.session.owner) return res.sendFile(path.join(__dirname, 'public', 'owner-upload.html'));
  // if no owner configured yet, show setup page
  db.get('SELECT COUNT(*) as c FROM owner', (err, row) => {
    const count = (row && row.c) || 0;
    if (count === 0) return res.sendFile(path.join(__dirname, 'public', 'owner-setup.html'));
    res.sendFile(path.join(__dirname, 'public', 'owner.html'));
  });
});

app.post('/owner-setup', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).send('Phone and password required');
  db.get('SELECT COUNT(*) as c FROM owner', (err, row) => {
    const count = (row && row.c) || 0;
    if (count > 0) return res.status(400).send('Owner already configured');
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO owner(phone,passwordHash) VALUES(?,?)', [phone, hash], function (e) {
      if (e) return res.status(500).send('DB error');
      res.redirect('/owner');
    });
  });
});

app.post('/owner-login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).send('Password required');
  db.get('SELECT id,passwordHash FROM owner LIMIT 1', (err, row) => {
    if (err || !row) return res.status(400).send('Owner not configured');
    if (bcrypt.compareSync(password, row.passwordHash)){
      req.session.owner = true;
      res.redirect('/owner');
    } else res.status(401).send('Invalid password');
  });
});

app.get('/owner-logout', (req, res) => { req.session.destroy(()=>res.redirect('/')); });

app.post('/owner-upload', upload.single('noteFile'), (req, res) => {
  if (!(req.session && req.session.owner)) return res.status(403).send('Forbidden');
  const { subject } = req.body;
  const uploader = 'Avi (Owner)';
  if (!req.file) return res.status(400).send('No file uploaded');
  db.run('INSERT INTO notes(filename, originalname, subject, uploader, created_at) VALUES(?,?,?,?,?)', [req.file.filename, req.file.originalname, subject || '', uploader, new Date().toISOString()], function (err) {
    if (err) return res.status(500).send('DB error');
    res.redirect('/dashboard');
  });
});

// Forgot password flow (demo: OTP shown on page for now)
app.get('/owner-forgot', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'owner-forgot.html'));
});

app.post('/owner-forgot-request', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).send('Phone required');
  db.get('SELECT id FROM owner WHERE phone = ? LIMIT 1', [phone], (err, row) => {
    if (err || !row) return res.status(400).send('Phone not recognized');
    const code = String(Math.floor(100000 + Math.random()*900000));
    const expires = Date.now() + 10*60*1000;
    db.run('INSERT INTO otps(phone,code,expires_at) VALUES(?,?,?)', [phone, code, expires], function (e) {
      if (e) return res.status(500).send('DB error');
      // For demo, show code on a confirmation page (in prod send SMS via provider)
      res.send(`<!doctype html><html><body><p>OTP for ${escape(phone)}: <strong>${code}</strong> (demo only)</p><p>Use this to <a href="/owner-forgot">enter OTP & reset password</a></p></body></html>`);
    });
  });
});

app.post('/owner-forgot-verify', (req, res) => {
  const { phone, code, newPassword } = req.body;
  if (!phone || !code || !newPassword) return res.status(400).send('Missing fields');
  db.get('SELECT id,code,expires_at FROM otps WHERE phone = ? ORDER BY id DESC LIMIT 1', [phone], (err, row) => {
    if (err || !row) return res.status(400).send('No OTP found');
    if (row.code !== code) return res.status(400).send('Invalid code');
    if (Date.now() > row.expires_at) return res.status(400).send('OTP expired');
    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE owner SET passwordHash = ? WHERE phone = ?', [hash, phone], function (e) {
      if (e) return res.status(500).send('DB error');
      res.send(`<!doctype html><html><body><p>Password updated. <a href="/owner">Login</a></p></body></html>`);
    });
  });
});

// Notes listing
app.get('/notes', (req, res) => {
  db.all('SELECT id, originalname, subject, uploader, created_at FROM notes ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).send('DB error');
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>PGDCA All Subject Note - Notes</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h1>PGDCA All Subject Note — Create By Avi</h1><p><a href="/upload">Upload a note</a></p><table border="0" cellpadding="8"><tr><th>Title</th><th>Subject</th><th>Uploader</th><th>Uploaded</th><th></th></tr>`;
    rows.forEach(r => {
      html += `<tr><td>${escape(r.originalname)}</td><td>${escape(r.subject)}</td><td>${escape(r.uploader)}</td><td>${escape(r.created_at)}</td><td><a href="/download/${r.id}">Download</a></td></tr>`;
    });
    html += `</table><p><a href="/">Home</a> | <a href="/owner">Owner</a> | <a href="/dashboard">Dashboard</a></p></div></body></html>`;
    res.send(html);
  });
});

app.get('/download/:id', (req, res) => {
  const id = Number(req.params.id);
  db.get('SELECT id, originalname, subject FROM notes WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).send('Note not found');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Download ${escape(row.originalname)}</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h2>Download: ${escape(row.originalname)}</h2><form method="POST" action="/download/${row.id}/confirm"><label>Your name:<br><input name="downname" required></label><br><label>Subject (your subject name):<br><input name="downsubject" required></label><br><label>Phone number:<br><input name="phone"></label><br><label>Roll number:<br><input name="roll"></label><br><button type="submit">Confirm & Download</button></form><p><a href="/notes">Back to notes</a></p></div></body></html>`);
  });
});

app.post('/download/:id/confirm', (req, res) => {
  const id = Number(req.params.id);
  const { downname, downsubject, phone, roll } = req.body;
  db.get('SELECT filename, originalname FROM notes WHERE id = ?', [id], (err, note) => {
    if (err || !note) return res.status(404).send('Note not found');
    const ip = req.ip || req.connection.remoteAddress || '';
    const stmt = db.prepare('INSERT INTO downloads(note_id, downloader_name, downloader_subject, phone, roll, ip, created_at) VALUES(?,?,?,?,?,?,?)');
    stmt.run(id, downname || '', downsubject || '', phone || '', roll || '', ip, new Date().toISOString(), function (err) {
      if (err) return res.status(500).send('DB error');
      const filePath = path.join(UPLOAD_DIR, note.filename);
      res.download(filePath, note.originalname, (err) => { if (err) console.error('Download error', err); });
    });
  });
});

app.get('/dashboard', (req, res) => {
  db.all('SELECT n.id, n.originalname, n.subject, n.uploader, n.created_at, (SELECT COUNT(*) FROM downloads d WHERE d.note_id = n.id) as downloads FROM notes n ORDER BY n.id DESC', (err, rows) => {
    if (err) return res.status(500).send('DB error');
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Dashboard - PGDCA</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h1>Dashboard — PGDCA All Subject Note</h1><table border="0" cellpadding="8"><tr><th>Title</th><th>Subject</th><th>Uploader</th><th>Uploaded</th><th>Downloads</th><th>View</th></tr>`;
    rows.forEach(r => {
      html += `<tr><td>${escape(r.originalname)}</td><td>${escape(r.subject)}</td><td>${escape(r.uploader)}</td><td>${escape(r.created_at)}</td><td>${r.downloads}</td><td><a href="/note/${r.id}/downloads">View</a></td></tr>`;
    });
    html += `</table><p><a href="/">Home</a></p></div></body></html>`;
    res.send(html);
  });
});

app.get('/note/:id/downloads', (req, res) => {
  const id = Number(req.params.id);
  db.all('SELECT downloader_name, downloader_subject, phone, roll, ip, created_at FROM downloads WHERE note_id = ? ORDER BY id DESC', [id], (err, rows) => {
    if (err) return res.status(500).send('DB error');
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Downloads</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h1>Downloads for note ${id}</h1><table border="0" cellpadding="8"><tr><th>Name</th><th>Subject</th><th>Phone</th><th>Roll</th><th>IP</th><th>Time</th></tr>`;
    rows.forEach(r => {
      html += `<tr><td>${escape(r.downloader_name)}</td><td>${escape(r.downloader_subject)}</td><td>${escape(r.phone)}</td><td>${escape(r.roll)}</td><td>${escape(r.ip)}</td><td>${escape(r.created_at)}</td></tr>`;
    });
    html += `</table><p><a href="/dashboard">Back</a></p></div></body></html>`;
    res.send(html);


  });
});

// ensure public files exist for owner pages
if (!fs.existsSync(path.join(__dirname, 'public', 'owner.html'))){
  fs.writeFileSync(path.join(__dirname, 'public', 'owner.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Owner Login</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h2>Owner Login</h2><form method="POST" action="/owner-login"><label>Password:<br><input name="password" type="password" required></label><button type="submit">Login</button></form><p><a href="/owner-forgot">Forgot password?</a></p></div></body></html>`);
}
if (!fs.existsSync(path.join(__dirname, 'public', 'owner-setup.html'))){
  fs.writeFileSync(path.join(__dirname, 'public', 'owner-setup.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Owner Setup</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h2>Setup Owner Account</h2><form method="POST" action="/owner-setup"><label>Phone (for recovery):<br><input name="phone" required></label><label>Password:<br><input name="password" type="password" required></label><button type="submit">Create Owner</button></form></div></body></html>`);
}
if (!fs.existsSync(path.join(__dirname, 'public', 'owner-upload.html'))){
  fs.writeFileSync(path.join(__dirname, 'public', 'owner-upload.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Owner Upload</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h1>Owner Upload (Avi)</h1><form method="POST" action="/owner-upload" enctype="multipart/form-data"><label>Note file: <input type="file" name="noteFile" required></label><label>Subject: <input name="subject" placeholder="E.g., DBMS, OS"></label><button type="submit">Upload as Owner</button></form><p><a href="/owner-logout">Logout</a></p></div></body></html>`);
}
if (!fs.existsSync(path.join(__dirname, 'public', 'owner-forgot.html'))){
  fs.writeFileSync(path.join(__dirname, 'public', 'owner-forgot.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Owner Forgot Password</title><link rel="stylesheet" href="/static/styles.css"></head><body><div class="wrap"><h2>Reset Owner Password</h2><form method="POST" action="/owner-forgot-request"><label>Registered phone:<br><input name="phone" required></label><button type="submit">Send OTP (demo)</button></form><hr><h3>Enter OTP & New Password</h3><form method="POST" action="/owner-forgot-verify"><label>Phone:<br><input name="phone" required></label><label>OTP:<br><input name="code" required></label><label>New password:<br><input name="newPassword" type="password" required></label><button type="submit">Reset Password</button></form></div></body></html>`);
}

// simple static CSS
if (!fs.existsSync(path.join(__dirname, 'public', 'styles.css'))){
  fs.writeFileSync(path.join(__dirname, 'public', 'styles.css'), `body{font-family:Arial,Helvetica,sans-serif;background:#071024;color:#e6eef6;padding:20px} .wrap{max-width:900px;margin:0 auto;background:rgba(255,255,255,0.02);padding:18px;border-radius:10px} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid rgba(255,255,255,0.03)} a{color:#7c3aed}`);
}

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

module.exports = app;
