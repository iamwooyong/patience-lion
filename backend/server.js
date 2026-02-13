const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { initializeTables, query, queryOne, execute } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database tables
initializeTables().catch(err => {
  console.error('Failed to initialize tables:', err);
  process.exit(1);
});

// Email setup (Resend HTTP API)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@dndyd.com';
if (RESEND_API_KEY) {
  console.log(`📧 Resend 이메일 발송 설정 완료 (${EMAIL_FROM})`);
} else {
  console.warn('⚠️ RESEND_API_KEY가 없습니다. 인증번호가 콘솔에 출력됩니다.');
}

async function sendVerificationEmail(email, code, type) {
  const subject = type === 'register' ? '[참고 사자] 회원가입 인증번호' : '[참고 사자] 비밀번호 재설정 인증번호';
  const label = type === 'register' ? '회원가입' : '비밀번호 재설정';
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `참고 사자 <${EMAIL_FROM}>`,
          to: [email],
          subject,
          html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #f59e0b;">🦁 참고 사자</h2>
              <p>${label} 인증번호입니다.</p>
              <div style="background: #fef3c7; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d97706;">${code}</span>
              </div>
              <p style="color: #666; font-size: 14px;">5분 이내에 입력해주세요.</p>
            </div>
          `,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(`📧 이메일 전송 실패:`, data);
        throw new Error(data.message || '이메일 전송 실패');
      }
      console.log(`📧 이메일 전송 성공: ${email}`);
    } catch (err) {
      console.error(`📧 이메일 전송 실패: ${err.message}`);
      throw new Error('이메일 전송에 실패했어요.');
    }
  } else {
    console.log(`📧 [${type}] ${email} → 인증번호: ${code}`);
  }
}

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

// Send verification code
app.post('/api/auth/send-code', async (req, res) => {
  const { email, type } = req.body;

  if (!email) return res.status(400).json({ error: '이메일을 입력해주세요' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '올바른 이메일 형식이 아니에요' });
  }

  try {
    if (type === 'register') {
      const existing = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
      if (existing) return res.status(400).json({ error: '이미 가입된 이메일이에요' });
    }
    if (type === 'reset') {
      const existing = await queryOne('SELECT * FROM users WHERE email = $1 OR username = $1', [email]);
      if (!existing) return res.status(400).json({ error: '가입되지 않은 이메일이에요' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await execute(
      "INSERT INTO verification_codes (email, code, type, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')",
      [email, code, type]
    );

    await sendVerificationEmail(email, code, type);
    res.json({ success: true, message: '인증번호가 전송되었어요' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify code
app.post('/api/auth/verify-code', async (req, res) => {
  const { email, code, type } = req.body;
  try {
    const record = await queryOne(
      "SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND type = $3 AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [email, code, type]
    );
    if (!record) return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료되었어요' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nickname, code, groupCode } = req.body;

  if (!email || !password || !nickname || !code) {
    return res.status(400).json({ error: '모든 필드를 입력해주세요' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 해요' });
  }

  try {
    const codeRecord = await queryOne(
      "SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND type = 'register' AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [email, code]
    );
    if (!codeRecord) return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료되었어요' });

    await execute('UPDATE verification_codes SET used = true WHERE id = $1', [codeRecord.id]);

    const existing = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (existing) return res.status(400).json({ error: '이미 가입된 이메일이에요' });

    const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = hashPassword(password);

    await execute(
      'INSERT INTO users (id, username, password_hash, nickname, email, email_verified) VALUES ($1, $2, $3, $4, $5, true)',
      [id, email, passwordHash, nickname, email]
    );

    let joinedGroup = null;
    if (groupCode && groupCode.trim()) {
      const group = await queryOne('SELECT * FROM groups WHERE code = $1', [groupCode.trim().toUpperCase()]);
      if (group) {
        await execute('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [group.id, id]);
        joinedGroup = { id: group.id, name: group.name };
      }
    }

    res.json({ id, email, nickname, joinedGroup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요' });
  }

  try {
    let user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) user = await queryOne('SELECT * FROM users WHERE username = $1', [email]);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸어요' });
    }

    res.json({ id: user.id, email: user.email || user.username, nickname: user.nickname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: '모든 필드를 입력해주세요' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 해요' });
  }

  try {
    const codeRecord = await queryOne(
      "SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND type = 'reset' AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [email, code]
    );
    if (!codeRecord) return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료되었어요' });

    await execute('UPDATE verification_codes SET used = true WHERE id = $1', [codeRecord.id]);

    const passwordHash = hashPassword(newPassword);
    let user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) user = await queryOne('SELECT * FROM users WHERE username = $1', [email]);
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없어요' });

    await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
    res.json({ success: true });
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

// Update nickname
app.patch('/api/users/:id/nickname', async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: '닉네임을 입력해주세요' });
  }
  try {
    await execute('UPDATE users SET nickname = $1 WHERE id = $2', [nickname.trim(), req.params.id]);
    res.json({ id: req.params.id, nickname: nickname.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change password
app.patch('/api/users/:id/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 해요' });
  }
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없어요' });
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: '현재 비밀번호가 틀렸어요' });
    }
    const passwordHash = hashPassword(newPassword);
    await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
    res.json({ success: true });
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
    dateFilter = "AND items.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')";
  } else if (period === 'week') {
    dateFilter = "AND items.created_at >= (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')";
  } else if (period === 'month') {
    dateFilter = "AND items.created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')";
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
          WHEN items.created_at >= (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
          THEN items.price ELSE 0 END), 0) as weekly_total,
        COUNT(CASE
          WHEN items.created_at >= (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
          THEN 1 END) as weekly_count,
        MAX(group_members.joined_at) as joined_at
      FROM group_members
      JOIN users ON group_members.user_id = users.id
      LEFT JOIN items ON users.id = items.user_id
      WHERE group_members.group_id = $1
      GROUP BY users.id, users.nickname
      ORDER BY weekly_total DESC
    `, [req.params.id]);

    // 지난주 우승자
    const lastWeekWinner = await queryOne(`
      SELECT
        users.id,
        users.nickname as name,
        COALESCE(SUM(items.price), 0) as total
      FROM group_members
      JOIN users ON group_members.user_id = users.id
      JOIN items ON users.id = items.user_id
      WHERE group_members.group_id = $1
        AND items.created_at >= (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' - INTERVAL '7 days')
        AND items.created_at < (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
      GROUP BY users.id, users.nickname
      HAVING COALESCE(SUM(items.price), 0) > 0
      ORDER BY total DESC
      LIMIT 1
    `, [req.params.id]);

    // 지난주 월~일 날짜 계산
    const lastWeek = lastWeekWinner ? {
      winner: lastWeekWinner.name,
      total: lastWeekWinner.total,
    } : null;

    res.json({ ...group, members, lastWeek });
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

const axios = require('axios');

const STOCKS = [
  { code: '005930', name: '삼성전자', fallbackPrice: 181200 },
  { code: 'UBER', name: '우버', fallbackPrice: 93000 },
  { code: 'TSLL', name: 'TSLL', fallbackPrice: 16000 },
];

let stockCache = { data: null, updatedAt: 0 };
const STOCK_CACHE_TTL = 10 * 60 * 1000; // 10분 캐시

async function fetchStockPrice(code) {
  try {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      },
      timeout: 5000,
    });

    // closePrice는 "181,200" 같은 형식 (콤마 포함 문자열)
    const priceStr = response.data?.closePrice || '0';
    const price = parseFloat(priceStr.replace(/,/g, ''));
    return price || 0;
  } catch (err) {
    console.error(`Stock ${code} fetch error: ${err.message}`);
    return 0;
  }
}

async function fetchStockPrices() {
  const now = Date.now();
  if (stockCache.data && now - stockCache.updatedAt < STOCK_CACHE_TTL) {
    return stockCache.data;
  }

  try {
    const prices = await Promise.all(STOCKS.map(stock => fetchStockPrice(stock.code)));

    const result = STOCKS.map((stock, i) => ({
      symbol: stock.code,
      name: stock.name,
      price: Math.round(prices[i] > 0 ? prices[i] : stock.fallbackPrice),
    }));

    stockCache = { data: result, updatedAt: now };
    console.log('📊 주식 가격 업데이트:', result);
    return result;
  } catch (err) {
    console.error('Stock fetch error:', err.message);
    return stockCache.data || STOCKS.map(s => ({ symbol: s.code, name: s.name, price: s.fallbackPrice }));
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
