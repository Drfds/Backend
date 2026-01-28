const express = require("express")
const mysql = require("mysql2")
const bcrypt = require("bcrypt")
const cors = require("cors")
const jwt = require("jsonwebtoken")

const app = express()
app.use(cors({
  origin: "https://karnbarn.xn--12c2bdp3bjf8aq6e9aq2a00a.com",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}))
app.use(express.json())

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret'
const PORT = process.env.PORT || 3000

const db = mysql.createPool({
  host: "sql12.freesqldatabase.com",
  user: "sql12815257",
  password: "wPRWbKqmDU",
  database: "sql12815257",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
})


// Try to ensure necessary schema exists (best to run proper migrations in production)
const initSql = ` 
CREATE TABLE IF NOT EXISTS assignments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due DATE NULL,
  not_submitted TEXT DEFAULT '[]',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'student';
`
// Note: MySQL doesn't support "ADD COLUMN IF NOT EXISTS" on older versions; run ALTER in try/catch below.

db.query('SELECT 1', (err) => {
  if (err) {
    console.error('DB init failed', err.message)
  } else {
    console.log('DB pool ready')
  }
  // create assignments table if not exists (include created_by and teacher_name)
  db.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      due DATE NULL,
      not_submitted TEXT NOT NULL,
      teacher_name VARCHAR(255) DEFAULT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, (e) => { if (e) console.warn('create assignments table warning', e.message) })

  // try to add role column (ignore error if exists)
  db.query(`ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'student'`, (e) => {
    if (e && e.code !== 'ER_DUP_FIELDNAME' && e.errno !== 1060) {
      console.warn('alter users add role:', e.message)
    }
  })

  // ensure index on created_by (safe to run)
  db.query(`ALTER TABLE assignments ADD INDEX idx_assignments_created_by (created_by)`, (e) => { /* ignore errors */ })

  console.log('DB connected')
})

app.get('/', (req, res) => {
  res.send('API is running 🚀')
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// helpers
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'No token' })
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' })
    req.user = user
    next()
  })
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' })
    if (req.user.role !== role) return res.status(403).json({ message: 'Forbidden' })
    next()
  }
}

// Register (accept role)
app.post("/register", async (req, res) => {
  const { username, email, password, role } = req.body
  if (!username || !email || !password || !role) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" })
  }
  try {
    const hash = await bcrypt.hash(password, 10)
    const sql = `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`
    db.query(sql, [username, email, hash, role], (err, results) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'มีบัญชีนี้แล้ว' })
        return res.status(500).json({ message: "สมัครไม่สำเร็จ", error: err.message })
      }
      const user = { id: results.insertId, username, email, role }
      const token = signToken(user)
      res.json({ message: "สมัครสำเร็จ", token, user })
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

// Login -> return token + user
app.post("/login", (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ message: "ข้อมูลไม่ครบ" })

  const sql = "SELECT * FROM users WHERE email = ?"
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "เกิดข้อผิดพลาด" })
    if (results.length === 0) return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้" })

    const user = results[0]

    // try bcrypt compare first
    let isMatch = false
    try {
      isMatch = await bcrypt.compare(password, user.password)
    } catch (e) {
      isMatch = false
    }

    // fallback: if password stored plaintext, allow login and migrate to hashed
    if (!isMatch) {
      if (user.password === password) {
        try {
          const newHash = await bcrypt.hash(password, 10)
          db.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id], (uErr) => {
            if (uErr) console.warn('password migrate failed for user', user.id, uErr.message)
          })
          isMatch = true
        } catch (e) {
          // migration failed; keep isMatch as false
        }
      }
    }

    if (!isMatch) return res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" })

    const userSafe = { id: user.id, username: user.username, email: user.email, role: user.role || 'student' }
    const token = signToken(userSafe)
    res.json({ message: "เข้าสู่ระบบสำเร็จ", token, user: userSafe })
  })
})

// Get users (filter by role)
app.get('/users', authenticateToken, (req, res) => {
  const role = req.query.role
  const params = []
  let sql = 'SELECT id, username, email, role FROM users'
  if (role) {
    sql += ' WHERE role = ?'
    params.push(role)
  }
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message })
    res.json(results)
  })
})

// Assignments endpoints

// list assignments (return teacher info + teacher_name)
app.get('/assignments', authenticateToken, (req, res) => {
  const sql = `
    SELECT a.*, u.id AS teacher_id, u.username AS teacher_username
    FROM assignments a
    LEFT JOIN users u ON a.created_by = u.id
    ORDER BY a.created_at DESC
  `
  db.query(sql, [], (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message })
    const parsed = results.map(r => ({
      id: r.id,
      title: r.title,
      desc: r.description,
      due: r.due ? r.due.toISOString().split('T')[0] : null,
      notSubmitted: (() => { try { return JSON.parse(r.not_submitted || '[]') } catch { return [] } })(),
      created_by: r.created_by || r.teacher_id || null,
      teacher_username: r.teacher_username || null,
      teacher_name: r.teacher_name || null,
      created_at: r.created_at
    }))
    res.json(parsed)
  })
})

// create assignment (teacher only) — accept teacher_name and created_by (override)
app.post('/assignments', authenticateToken, requireRole('teacher'), (req, res) => {
  const { title, description, due, created_by, teacher_name } = req.body
  if (!title) return res.status(400).json({ message: 'Title required' })

  const tryUse = created_by ? String(created_by) : null

  function insertWithCreator(createdBy) {
    const sql = 'INSERT INTO assignments (title, description, due, not_submitted, teacher_name, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    db.query(sql, [title, description || null, due || null, '[]', teacher_name || null, createdBy], (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message })
      res.json({ id: results.insertId, title, description, due, notSubmitted: [], created_by: createdBy, teacher_name: teacher_name || null })
    })
  }

  if (tryUse) {
    // verify that the provided created_by exists and is a teacher
    db.query('SELECT id, role FROM users WHERE id = ?', [tryUse], (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message })
      if (rows.length === 0) return res.status(400).json({ message: 'Provided teacher not found' })
      const u = rows[0]
      if (u.role !== 'teacher') return res.status(400).json({ message: 'Provided user is not a teacher' })
      insertWithCreator(u.id)
    })
  } else {
    const createdBy = req.user && req.user.id ? req.user.id : null
    insertWithCreator(createdBy)
  }
})

// delete assignment (teacher only)
app.delete('/assignments/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  const id = req.params.id
  db.query('DELETE FROM assignments WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message })
    res.status(204).end()
  })
})

// add student to not_submitted (teacher only)
app.post('/assignments/:id/not-submitted', authenticateToken, requireRole('teacher'), (req, res) => {
  const id = req.params.id
  const { studentId } = req.body
  if (!studentId) return res.status(400).json({ message: 'studentId required' })
  db.query('SELECT not_submitted FROM assignments WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message })
    if (results.length === 0) return res.status(404).json({ message: 'Assignment not found' })
    let arr = []
    try { arr = JSON.parse(results[0].not_submitted || '[]') } catch { arr = [] }
    if (!arr.includes(String(studentId))) arr.push(String(studentId))
    db.query('UPDATE assignments SET not_submitted = ? WHERE id = ?', [JSON.stringify(arr), id], (e) => {
      if (e) return res.status(500).json({ message: 'DB error', error: e.message })
      return res.json({ id, notSubmitted: arr })
    })
  })
})

// remove student from not_submitted (mark submitted) (teacher only)
app.delete('/assignments/:id/not-submitted/:studentId', authenticateToken, requireRole('teacher'), (req, res) => {
  const id = req.params.id
  const studentId = req.params.studentId
  db.query('SELECT not_submitted FROM assignments WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message })
    if (results.length === 0) return res.status(404).json({ message: 'Assignment not found' })
    let arr = []
    try { arr = JSON.parse(results[0].not_submitted || '[]') } catch { arr = [] }
    const idx = arr.map(x => String(x)).indexOf(String(studentId))
    if (idx > -1) arr.splice(idx, 1)
    db.query('UPDATE assignments SET not_submitted = ? WHERE id = ?', [JSON.stringify(arr), id], (e) => {
      if (e) return res.status(500).json({ message: 'DB error', error: e.message })
      return res.json({ id, notSubmitted: arr })
    })
  })
})

// ensure server listens
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on 0.0.0.0:${PORT}`)
})
