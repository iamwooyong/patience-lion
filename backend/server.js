const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'patience.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
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

  CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
  CREATE INDEX IF NOT EXISTS idx_items_date ON items(created_at);
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
`);

app.use(cors());
app.use(express.json());

// Serve static files in production
app.use(express.static(path.join(__dirname, 'public')));

// ============ USER ROUTES ============

// Register or get user
app.post('/api/users', (req, res) => {
  const { id, name } = req.body;
  
  try {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (existing) {
      return res.json(existing);
    }
    
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(id, name);
    res.json({ id, name, created_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user by id
app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
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
  const { period } = req.query; // 'week', 'month', 'all'
  
  let dateFilter = '';
  if (period === 'week') {
    dateFilter = "AND items.created_at >= date('now', 'weekday 0', '-7 days')";
  } else if (period === 'month') {
    dateFilter = "AND items.created_at >= date('now', 'start of month')";
  }
  
  try {
    const rankings = db.prepare(`
      SELECT 
        users.id,
        users.name,
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
        users.name,
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
