const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'patience.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS hall_of_fame (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(period_type, period_start),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
  CREATE INDEX IF NOT EXISTS idx_items_date ON items(created_at);
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_hall_of_fame_period ON hall_of_fame(period_type, period_start);
`);

// Password hashing
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
};

app.use(cors());
app.use(express.json());

// Serve static files in production
app.use(express.static(path.join(__dirname, 'public')));

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', (req, res) => {
  const { username, password, nickname } = req.body;
  
  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '모든 필드를 입력해주세요' });
  }
  
  if (username.length < 4) {
    return res.status(400).json({ error: '아이디는 4자 이상이어야 해요' });
  }
  
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 해요' });
  }
  
  try {
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: '이미 사용 중인 아이디예요' });
    }
    
    const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = hashPassword(password);
    
    db.prepare(
      'INSERT INTO users (id, username, password_hash, nickname) VALUES (?, ?, ?, ?)'
    ).run(id, username, passwordHash, nickname);
    
    res.json({ id, username, nickname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요' });
  }
  
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸어요' });
    }
    
    res.json({ id: user.id, username: user.username, nickname: user.nickname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ USER ROUTES ============

// Get user by id
app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, nickname, created_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ITEMS ROUTES ============

// Add item
app.post('/api/items', (req, res) => {
  const { user_id, name, price } = req.body;
  
  try {
    const result = db.prepare(
      'INSERT INTO items (user_id, name, price) VALUES (?, ?, ?)'
    ).run(user_id, name, price);
    
    res.json({ 
      id: result.lastInsertRowid, 
      user_id, 
      name, 
      price,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's items
app.get('/api/items/:userId', (req, res) => {
  try {
    const items = db.prepare(
      'SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.params.userId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete item
app.delete('/api/items/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ RANKINGS ROUTES ============

// Get global rankings
app.get('/api/rankings', (req, res) => {
  const { period } = req.query; // 'day', 'week', 'month', 'all'

  let dateFilter = '';
  if (period === 'day') {
    dateFilter = "AND items.created_at >= date('now', 'start of day')";
  } else if (period === 'week') {
    dateFilter = "AND items.created_at >= date('now', 'weekday 0', '-7 days')";
  } else if (period === 'month') {
    dateFilter = "AND items.created_at >= date('now', 'start of month')";
  }
  
  try {
    const rankings = db.prepare(`
      SELECT 
        users.id,
        users.nickname as name,
        COALESCE(SUM(items.price), 0) as total,
        COUNT(items.id) as item_count
      FROM users
      LEFT JOIN items ON users.id = items.user_id ${dateFilter}
      GROUP BY users.id
      ORDER BY total DESC
      LIMIT 100
    `).all();
    
    res.json(rankings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ HALL OF FAME ROUTES ============

// Get hall of fame records
app.get('/api/hall-of-fame', (req, res) => {
  try {
    const records = db.prepare(`
      SELECT * FROM hall_of_fame
      ORDER BY period_start DESC
      LIMIT 50
    `).all();

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save current period winner (called manually or by scheduler)
app.post('/api/hall-of-fame/save', (req, res) => {
  const { period_type } = req.body; // 'week' or 'month'

  try {
    let periodStart, periodEnd, dateFilter;

    if (period_type === 'week') {
      // Last week: Monday to Sunday
      periodStart = db.prepare("SELECT date('now', 'weekday 0', '-14 days')").pluck().get();
      periodEnd = db.prepare("SELECT date('now', 'weekday 0', '-8 days')").pluck().get();
      dateFilter = `AND items.created_at >= date('${periodStart}') AND items.created_at < date('${periodEnd}')`;
    } else if (period_type === 'month') {
      // Last month
      periodStart = db.prepare("SELECT date('now', 'start of month', '-1 month')").pluck().get();
      periodEnd = db.prepare("SELECT date('now', 'start of month')").pluck().get();
      dateFilter = `AND items.created_at >= date('${periodStart}') AND items.created_at < date('${periodEnd}')`;
    } else {
      return res.status(400).json({ error: 'Invalid period_type' });
    }

    // Get winner
    const winner = db.prepare(`
      SELECT
        users.id,
        users.nickname as name,
        COALESCE(SUM(items.price), 0) as total
      FROM users
      LEFT JOIN items ON users.id = items.user_id ${dateFilter}
      GROUP BY users.id
      HAVING total > 0
      ORDER BY total DESC
      LIMIT 1
    `).get();

    if (!winner) {
      return res.json({ message: 'No winner for this period' });
    }

    // Check if already exists
    const existing = db.prepare(
      'SELECT * FROM hall_of_fame WHERE period_type = ? AND period_start = ?'
    ).get(period_type, periodStart);

    if (existing) {
      return res.json({ message: 'Already saved', record: existing });
    }

    // Save to hall of fame
    const result = db.prepare(`
      INSERT INTO hall_of_fame (period_type, period_start, period_end, user_id, user_name, total_amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(period_type, periodStart, periodEnd, winner.id, winner.name, winner.total);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      winner: winner,
      period: { type: period_type, start: periodStart, end: periodEnd }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ GROUPS ROUTES ============

// Create group
app.post('/api/groups', (req, res) => {
  const { name, created_by } = req.body;
  const id = `group_${Date.now()}`;
  const code = Math.random().toString(36).substr(2, 6).toUpperCase();
  
  try {
    db.prepare(
      'INSERT INTO groups (id, name, code, created_by) VALUES (?, ?, ?, ?)'
    ).run(id, name, code, created_by);
    
    // Add creator as member
    db.prepare(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)'
    ).run(id, created_by);
    
    res.json({ id, name, code, created_by, created_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Join group by code
app.post('/api/groups/join', (req, res) => {
  const { code, user_id } = req.body;
  
  try {
    const group = db.prepare('SELECT * FROM groups WHERE code = ?').get(code);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    const existing = db.prepare(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(group.id, user_id);
    
    if (existing) return res.status(400).json({ error: 'Already a member' });
    
    db.prepare(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)'
    ).run(group.id, user_id);
    
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's groups
app.get('/api/groups/user/:userId', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT groups.*, 
        (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) as member_count
      FROM groups
      JOIN group_members ON groups.id = group_members.group_id
      WHERE group_members.user_id = ?
    `).all(req.params.userId);
    
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get group details with rankings
app.get('/api/groups/:id', (req, res) => {
  try {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    const members = db.prepare(`
      SELECT 
        users.id,
        users.nickname as name,
        COALESCE(SUM(CASE 
          WHEN items.created_at >= date('now', 'weekday 0', '-7 days') 
          THEN items.price ELSE 0 END), 0) as weekly_total,
        group_members.joined_at
      FROM group_members
      JOIN users ON group_members.user_id = users.id
      LEFT JOIN items ON users.id = items.user_id
      WHERE group_members.group_id = ?
      GROUP BY users.id
      ORDER BY weekly_total DESC
    `).all(req.params.id);
    
    res.json({ ...group, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leave group
app.delete('/api/groups/:groupId/members/:userId', (req, res) => {
  const { groupId, userId } = req.params;
  
  try {
    db.prepare(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
    ).run(groupId, userId);
    
    // Delete group if no members left
    const remaining = db.prepare(
      'SELECT COUNT(*) as count FROM group_members WHERE group_id = ?'
    ).get(groupId);
    
    if (remaining.count === 0) {
      db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦁 참고 사자 서버가 포트 ${PORT}에서 실행 중!`);
});
