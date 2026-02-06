const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Check if we're using PostgreSQL (production) or SQLite (development)
const USE_POSTGRES = !!process.env.DATABASE_URL;

let db;

if (USE_POSTGRES) {
  // PostgreSQL connection
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log('🐘 Using PostgreSQL database');
} else {
  // SQLite connection (local development)
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'patience.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  db = new Database(dbPath);
  console.log('📁 Using SQLite database');
}

async function initializeTables() {
  if (USE_POSTGRES) {
    // PostgreSQL table initialization
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nickname TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS hall_of_fame (
        id SERIAL PRIMARY KEY,
        period_type TEXT NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(period_type, period_start),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
      CREATE INDEX IF NOT EXISTS idx_items_date ON items(created_at);
      CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_hall_of_fame_period ON hall_of_fame(period_type, period_start);
    `);
  } else {
    // SQLite table initialization
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
  }
}

// Database query wrapper
async function query(sql, params = []) {
  if (USE_POSTGRES) {
    const result = await db.query(sql, params);
    return result.rows;
  } else {
    // Convert PostgreSQL parameterized queries ($1, $2) to SQLite (?, ?)
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    const stmt = db.prepare(sqliteSql);
    return stmt.all(...params);
  }
}

async function queryOne(sql, params = []) {
  if (USE_POSTGRES) {
    const result = await db.query(sql, params);
    return result.rows[0] || null;
  } else {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    const stmt = db.prepare(sqliteSql);
    return stmt.get(...params) || null;
  }
}

async function execute(sql, params = []) {
  if (USE_POSTGRES) {
    const result = await db.query(sql, params);
    return {
      lastInsertId: result.rows[0]?.id,
      changes: result.rowCount
    };
  } else {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    const stmt = db.prepare(sqliteSql);
    const result = stmt.run(...params);
    return {
      lastInsertId: result.lastInsertRowid,
      changes: result.changes
    };
  }
}

module.exports = {
  db,
  USE_POSTGRES,
  initializeTables,
  query,
  queryOne,
  execute
};
