import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const useMock = !process.env.POSTGRES_URL;
const dbPath = path.resolve('db.json');

interface DbState {
  Users: Record<string, { tc_no: string; claimed_codes_count: number; is_debtor: number }>;
  Codes: Array<{ id: number; code: string; is_used: number; assigned_to_tc: string | null }>;
  Settings: Record<string, string>;
}

function readDb(): DbState {
  if (!fs.existsSync(dbPath)) {
    const initialState: DbState = { Users: {}, Codes: [], Settings: { max_codes_per_user: '1' } };
    fs.writeFileSync(dbPath, JSON.stringify(initialState, null, 2));
    return initialState;
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (err) {
    return { Users: {}, Codes: [], Settings: { max_codes_per_user: '1' } };
  }
}

function writeDb(state: DbState) {
  fs.writeFileSync(dbPath, JSON.stringify(state, null, 2));
}

function mockQuery(sql: string, params: any[] = []): { rows: any[] } {
  const db = readDb();
  let rows: any[] = [];
  const normalizedSql = sql.replace(/\s+/g, ' ').trim();

  // 1. CREATE TABLE
  if (normalizedSql.startsWith('CREATE TABLE')) {
    // No-op
  }
  // 2. Settings check/inserts/updates
  else if (normalizedSql.includes('SELECT * FROM Settings WHERE key =') || normalizedSql.includes('SELECT value FROM Settings WHERE key =')) {
    const key = params[0] || 'max_codes_per_user';
    const val = db.Settings[key] || '1';
    rows = [{ key, value: val }];
  } else if (normalizedSql.includes('INSERT INTO Settings')) {
    const key = params[0] || 'max_codes_per_user';
    const val = params[1] || '1';
    db.Settings[key] = val;
    writeDb(db);
  } else if (normalizedSql.includes('UPDATE Settings SET value =')) {
    const val = params[0];
    db.Settings['max_codes_per_user'] = String(val);
    writeDb(db);
  }
  // 3. Stats
  else if (normalizedSql.includes('SELECT COUNT(*) as count FROM Users')) {
    rows = [{ count: Object.keys(db.Users).length }];
  } else if (normalizedSql.includes('SELECT COUNT(*) as count FROM Codes WHERE is_used = 1')) {
    rows = [{ count: db.Codes.filter(c => c.is_used === 1).length }];
  } else if (normalizedSql.includes('SELECT COUNT(*) as count FROM Codes')) {
    rows = [{ count: db.Codes.length }];
  }
  // 4. Bulk operations
  else if (normalizedSql.includes('INSERT INTO Users') && normalizedSql.includes('UNNEST($1::text[])')) {
    const tcs = params[0] || [];
    const isDebtor = normalizedSql.includes('is_debtor) SELECT tc, 0, 1') ? 1 : 0;
    tcs.forEach((tc: string) => {
      if (db.Users[tc]) {
        if (isDebtor) {
          db.Users[tc].is_debtor = 1;
        }
      } else {
        db.Users[tc] = { tc_no: tc, claimed_codes_count: 0, is_debtor: isDebtor };
      }
    });
    writeDb(db);
  } else if (normalizedSql.includes('INSERT INTO Codes') && normalizedSql.includes('UNNEST($1::text[])')) {
    const codes = params[0] || [];
    codes.forEach((code: string) => {
      const exists = db.Codes.some(c => c.code === code);
      if (!exists) {
        db.Codes.push({
          id: db.Codes.length + 1,
          code,
          is_used: 0,
          assigned_to_tc: null
        });
      }
    });
    writeDb(db);
  }
  // 5. Reset
  else if (normalizedSql.startsWith('DELETE FROM Codes')) {
    db.Codes = [];
    writeDb(db);
  } else if (normalizedSql.startsWith('DELETE FROM Users')) {
    db.Users = {};
    writeDb(db);
  }
  // 6. User query
  else if (normalizedSql.includes('SELECT * FROM Users WHERE tc_no =') || normalizedSql.includes('SELECT tc_no, claimed_codes_count, is_debtor FROM Users WHERE tc_no =')) {
    const tc = params[0];
    const user = db.Users[tc];
    if (user) {
      rows = [user];
    }
  } else if (normalizedSql.includes('SELECT code FROM Codes WHERE assigned_to_tc =')) {
    const tc = params[0];
    rows = db.Codes.filter(c => c.assigned_to_tc === tc).map(c => ({ code: c.code }));
  }
  // 7. Get code to claim
  else if (normalizedSql.includes('SELECT * FROM Codes WHERE is_used = 0')) {
    const available = db.Codes.find(c => c.is_used === 0);
    if (available) {
      rows = [available];
    }
  }
  // 8. Update code assignment
  else if (normalizedSql.includes('UPDATE Codes SET is_used = 1, assigned_to_tc =')) {
    const tc = params[0];
    const id = params[1];
    const codeObj = db.Codes.find(c => c.id === Number(id));
    if (codeObj) {
      codeObj.is_used = 1;
      codeObj.assigned_to_tc = tc;
      writeDb(db);
    }
  }
  // 9. Update user claim count
  else if (normalizedSql.includes('UPDATE Users SET claimed_codes_count = claimed_codes_count + 1')) {
    const tc = params[0];
    if (db.Users[tc]) {
      db.Users[tc].claimed_codes_count += 1;
      writeDb(db);
    }
  }
  // 10. Admin view lists
  else if (normalizedSql.includes('SELECT tc_no, claimed_codes_count, is_debtor FROM Users ORDER BY tc_no')) {
    const allUsers = Object.values(db.Users).sort((a, b) => a.tc_no.localeCompare(b.tc_no));
    rows = allUsers.slice(0, 20);
  } else if (normalizedSql.includes('SELECT id, code, is_used, assigned_to_tc FROM Codes ORDER BY id DESC')) {
    const allCodes = [...db.Codes].sort((a, b) => b.id - a.id);
    rows = allCodes.slice(0, 20);
  }
  // 11. Single insert/update user (Admin)
  else if (normalizedSql.includes('INSERT INTO Users') && normalizedSql.includes('VALUES')) {
    const tc = params[0];
    const debtor = params[1];
    db.Users[tc] = { tc_no: tc, claimed_codes_count: 0, is_debtor: debtor };
    writeDb(db);
  } else if (normalizedSql.includes('UPDATE Users SET is_debtor =')) {
    const debtor = params[0];
    const tc = params[1];
    if (db.Users[tc]) {
      db.Users[tc].is_debtor = debtor;
      writeDb(db);
    }
  }

  return { rows };
}

let pool: any;

if (useMock) {
  console.log('Local environment detected: Using local JSON database (db.json).');
  const mockClient = {
    query: async (sql: string, params: any[] = []) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return mockQuery(sql, params);
    },
    release: () => {}
  };
  pool = {
    connect: async () => mockClient,
    query: async (sql: string, params: any[] = []) => {
      return mockQuery(sql, params);
    },
    on: () => {}
  };
} else {
  const connectionString = process.env.POSTGRES_URL;
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  pool.on('error', (err: any) => {
    console.error('PostgreSQL Beklenmeyen Hata:', err);
  });
}

function convertQuery(query: string) {
    let index = 1;
    return query.replace(/\?/g, () => `$${index++}`);
}

export async function initializeDatabase(): Promise<void> {
    if (useMock) {
        readDb(); // Initialize db.json file
        return;
    }
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS Users (
                tc_no TEXT PRIMARY KEY,
                claimed_codes_count INTEGER DEFAULT 0,
                is_debtor INTEGER DEFAULT 0
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS Codes (
                id SERIAL PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                is_used INTEGER DEFAULT 0,
                assigned_to_tc TEXT
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS Settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        const res = await client.query(`SELECT * FROM Settings WHERE key = 'max_codes_per_user'`);
        if (res.rows.length === 0) {
            await client.query(`INSERT INTO Settings (key, value) VALUES ('max_codes_per_user', '1')`);
        }
    } catch (err) {
        console.error("PG INIT ERROR:", err);
    } finally {
        client.release();
    }
}

export async function dbGet(query: string, params: any[] = []): Promise<any> {
    const res = await pool.query(convertQuery(query), params);
    return res.rows[0] || null;
}

export async function dbAll(query: string, params: any[] = []): Promise<any[]> {
    const res = await pool.query(convertQuery(query), params);
    return res.rows;
}

export async function dbRun(query: string, params: any[] = []): Promise<void> {
    await pool.query(convertQuery(query), params);
}

export { pool as default };
