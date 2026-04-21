import { Pool } from 'pg';

const connectionString = process.env.POSTGRES_URL || 'postgres://localhost:5432/campaign';

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
    console.error('PostgreSQL Beklenmeyen Hata:', err);
});

function convertQuery(query: string) {
    let index = 1;
    return query.replace(/\?/g, () => `$${index++}`);
}

export async function initializeDatabase(): Promise<void> {
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

export default pool;
