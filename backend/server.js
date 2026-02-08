const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const https = require('https');
const { initializeTables, query, queryOne, execute } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database tables
initializeTables().catch(err => {
  console.error('Failed to initialize tables:', err);
  process.exit(1);
});

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
app.post('/api/auth/register', async (req, res) => {
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
    const existing = await queryOne('SELECT * FROM users WHERE username = $1', [username]);
    if (existing) {
      return res.status(400).json({ error: '이미 사용 중인 아이디예요' });
    }

    const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = hashPassword(password);

    await execute(
      'INSERT INTO users (id, username, password_hash, nickname) VALUES ($1, $2, $3, $4)',
      [id, username, passwordHash, nickname]
    );

    res.json({ id, username, nickname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요' });
  }

  try {
    const user = await queryOne('SELECT * FROM users WHERE username = $1', [username]);

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
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await queryOne('SELECT id, username, nickname, created_at FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ITEMS ROUTES ============

// Add item
app.post('/api/items', async (req, res) => {
  const { user_id, name, price } = req.body;

  try {
    const result = await execute(
      'INSERT INTO items (user_id, name, price) VALUES ($1, $2, $3)',
      [user_id, name, price]
    );

    res.json({
      id: result.lastInsertId,
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
app.get('/api/items/:userId', async (req, res) => {
  try {
    const items = await query(
      'SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId]
    );
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete item
app.delete('/api/items/:id', async (req, res) => {
  try {
    await execute('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ RANKINGS ROUTES ============

// Get global rankings
app.get('/api/rankings', async (req, res) => {
  const { period } = req.query; // 'day', 'week', 'month', 'all'

  let dateFilter = '';
  if (period === 'day') {
    dateFilter = "AND items.created_at >= date_trunc('day', now())";
  } else if (period === 'week') {
    dateFilter = "AND items.created_at >= (now() - INTERVAL '7 days')";
  } else if (period === 'month') {
    dateFilter = "AND items.created_at >= date_trunc('month', now())";
  }

  try {
    const rankings = await query(`
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
    `);

    res.json(rankings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ HALL OF FAME ROUTES ============

// Get hall of fame records
app.get('/api/hall-of-fame', async (req, res) => {
  try {
    const records = await query(`
      SELECT * FROM hall_of_fame
      ORDER BY period_start DESC
      LIMIT 50
    `);

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save current period winner (called manually or by scheduler)
app.post('/api/hall-of-fame/save', async (req, res) => {
  const { period_type } = req.body; // 'week' or 'month'

  try {
    let periodStart, periodEnd, dateFilter;

    // Compute period boundaries in JS (works for both SQLite and Postgres)
    const formatDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (period_type === 'week') {
      // last 7 days (from 7 days ago up to yesterday)
      const end = new Date();
      end.setDate(end.getDate() - 1);
      const start = new Date();
      start.setDate(start.getDate() - 7);
      periodStart = formatDate(start);
      periodEnd = formatDate(end);
      dateFilter = `AND items.created_at >= date('${periodStart}') AND items.created_at < date('${periodEnd}')`;
    } else if (period_type === 'month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      periodStart = formatDate(start);
      periodEnd = formatDate(end);
      dateFilter = `AND items.created_at >= date('${periodStart}') AND items.created_at < date('${periodEnd}')`;
    } else {
      return res.status(400).json({ error: 'Invalid period_type' });
    }

    // Get winner
    const winner = await queryOne(`
      SELECT
        users.id,
        users.nickname as name,
        COALESCE(SUM(items.price), 0) as total
      FROM users
      LEFT JOIN items ON users.id = items.user_id ${dateFilter}
      GROUP BY users.id
      HAVING COALESCE(SUM(items.price), 0) > 0
      ORDER BY total DESC
      LIMIT 1
    `);

    if (!winner) {
      return res.json({ message: 'No winner for this period' });
    }

    // Check if already exists
    const existing = await queryOne(
      'SELECT * FROM hall_of_fame WHERE period_type = $1 AND period_start = $2',
      [period_type, periodStart]
    );

    if (existing) {
      return res.json({ message: 'Already saved', record: existing });
    }

    // Save to hall of fame
    const result = await execute(`
      INSERT INTO hall_of_fame (period_type, period_start, period_end, user_id, user_name, total_amount)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [period_type, periodStart, periodEnd, winner.id, winner.name, winner.total]);

    res.json({
      success: true,
      id: result.lastInsertId,
      winner: winner,
      period: { type: period_type, start: periodStart, end: periodEnd }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ GROUPS ROUTES ============

// Create group
app.post('/api/groups', async (req, res) => {
  const { name, created_by } = req.body;
  const id = `group_${Date.now()}`;
  const code = Math.random().toString(36).substr(2, 6).toUpperCase();

  try {
    await execute(
      'INSERT INTO groups (id, name, code, created_by) VALUES ($1, $2, $3, $4)',
      [id, name, code, created_by]
    );

    // Add creator as member
    await execute(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [id, created_by]
    );

    res.json({ id, name, code, created_by, created_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Join group by code
app.post('/api/groups/join', async (req, res) => {
  const { code, user_id } = req.body;

  try {
    const group = await queryOne('SELECT * FROM groups WHERE code = $1', [code]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const existing = await queryOne(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group.id, user_id]
    );

    if (existing) return res.status(400).json({ error: 'Already a member' });

    await execute(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, user_id]
    );

    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's groups
app.get('/api/groups/user/:userId', async (req, res) => {
  try {
    const groups = await query(`
      SELECT groups.*,
        (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) as member_count
      FROM groups
      JOIN group_members ON groups.id = group_members.group_id
      WHERE group_members.user_id = $1
    `, [req.params.userId]);

    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get group details with rankings
app.get('/api/groups/:id', async (req, res) => {
  try {
    const group = await queryOne('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = await query(`
      SELECT
        users.id,
        users.nickname as name,
        COALESCE(SUM(CASE
          WHEN items.created_at >= date_trunc('week', now())
          THEN items.price ELSE 0 END), 0) as weekly_total,
        COUNT(CASE
          WHEN items.created_at >= date_trunc('week', now())
          THEN 1 END) as weekly_count,
        MAX(group_members.joined_at) as joined_at
      FROM group_members
      JOIN users ON group_members.user_id = users.id
      LEFT JOIN items ON users.id = items.user_id
      WHERE group_members.group_id = $1
      GROUP BY users.id, users.nickname
      ORDER BY weekly_total DESC
    `, [req.params.id]);

    res.json({ ...group, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete group (creator only)
app.delete('/api/groups/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { user_id } = req.body;

  try {
    const group = await queryOne('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없어요' });
    if (group.created_by !== user_id) return res.status(403).json({ error: '방장만 삭제할 수 있어요' });

    await execute('DELETE FROM group_members WHERE group_id = $1', [groupId]);
    await execute('DELETE FROM groups WHERE id = $1', [groupId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leave group
app.delete('/api/groups/:groupId/members/:userId', async (req, res) => {
  const { groupId, userId } = req.params;

  try {
    await execute(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );

    // Delete group if no members left
    const remaining = await queryOne(
      'SELECT COUNT(*) as count FROM group_members WHERE group_id = $1',
      [groupId]
    );

    if (remaining.count === 0) {
      await execute('DELETE FROM groups WHERE id = $1', [groupId]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ STOCKS ROUTES ============

const STOCKS = [
  { symbol: '005930.KS', name: '삼성전자', currency: 'KRW' },
  { symbol: 'UBER', name: '우버', currency: 'USD' },
  { symbol: 'TSLL', name: 'TSLL', currency: 'USD' },
];

let stockCache = { data: null, updatedAt: 0 };
const STOCK_CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.substring(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

async function fetchOneStock(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const json = await httpsGet(url);
  const meta = json.chart?.result?.[0]?.meta;
  return meta?.regularMarketPrice || 0;
}

async function fetchStockPrices() {
  const now = Date.now();
  if (stockCache.data && now - stockCache.updatedAt < STOCK_CACHE_TTL) {
    return stockCache.data;
  }

  try {
    const prices = await Promise.all(STOCKS.map(s => fetchOneStock(s.symbol).catch(() => 0)));

    const result = STOCKS.map((stock, i) => ({
      symbol: stock.symbol,
      name: stock.name,
      price: prices[i],
      currency: stock.currency,
    }));

    if (prices.some(p => p > 0)) {
      stockCache = { data: result, updatedAt: now };
    }
    return result;
  } catch (err) {
    console.error('Stock fetch error:', err.message);
    return stockCache.data || STOCKS.map(s => ({ ...s, price: 0 }));
  }
}

app.get('/api/stocks', async (req, res) => {
  try {
    const stocks = await fetchStockPrices();
    res.json(stocks);
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
